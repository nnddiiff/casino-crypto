"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseEventLogs,
  sendBatchTransaction,
  sendTransaction,
  waitForReceipt,
} from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import type { Account } from "thirdweb/wallets";
import { toast } from "sonner";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import {
  betPlacedEvent,
  findSettledBySeq,
  type SettledResult,
  waitForSettlement,
} from "@/lib/events";
import { errMessage } from "@/lib/format";
import {
  buildBetBatch,
  readBetStatus,
  readEntropyFee,
  readGameBalance,
  readWalletBalance,
  refundStuckBetTx,
} from "@/lib/funding";

/**
 * Машина состояний асинхронной ставки Limbo:
 *   idle → submitting (UserOp: автодепозит при нехватке + placeBet) → waiting (колбэк Pyth) → result.
 * Развилки честные, без фейкового результата и без молчаливого сброса:
 *   • error   — submit упал ДО подтверждения (нет сети/отклонение): деньги не списаны, можно повторить;
 *   • delayed — колбэк не пришёл за мягкий порог: ставка уже on-chain (seq + ссылка), ждём дальше/Обновить;
 *               через час (STUCK_TIMEOUT контракта) — возврат зависшей ставки refundStuckBet.
 */
export type BetPhase =
  | "idle"
  | "submitting"
  | "waiting"
  | "delayed"
  | "result"
  | "error";

export type BetResult = (SettledResult & { txHash: string }) | null;

/** Ставка в ожидании колбэка: что показать (seq + ссылка на отправку) и чем вернуть по таймауту. */
export type PendingBet = { seq: bigint; fromBlock: bigint; submitTx: string };

/** Контрактный STUCK_TIMEOUT = 1 hours: раньше refundStuckBet ревертит (BetNotStuck). */
const STUCK_TIMEOUT_SEC = 3600;

/**
 * Финансирование скрыто: если в игре не хватает на ставку, тем же UserOp незаметно доносим нужную
 * сумму со смарт-аккаунта (depositTx) — для игрока это один баланс «Счёт казино».
 * @param onSettled колбэк после расчёта — обновить балансы/ленту.
 * @param onRefunded колбэк после возврата зависшей ставки — обновить балансы.
 */
export function usePlaceBet(
  onSettled?: (result: SettledResult) => void,
  onRefunded?: () => void,
) {
  const active = useActiveAccount();
  const [phase, setPhase] = useState<BetPhase>("idle");
  const [result, setResult] = useState<BetResult>(null);
  const [pending, setPending] = useState<PendingBet | null>(null);
  const [canRefund, setCanRefund] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const settledRef = useRef(false);
  const refundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearRefundTimer() {
    if (refundTimer.current) {
      clearTimeout(refundTimer.current);
      refundTimer.current = null;
    }
  }

  // Снять фоновое ожидание и таймеры при размонтировании.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearRefundTimer();
    };
  }, []);

  /** Единственная воронка перехода в «результат» — идемпотентна (фоновый опрос и «Обновить» не задвоят). */
  function settle(s: SettledResult, txHash: string) {
    if (settledRef.current) return;
    settledRef.current = true;
    abortRef.current?.abort();
    clearRefundTimer();
    setResult({ ...s, txHash });
    setPhase("result");
    onSettled?.(s);
  }

  /** Мягкий порог истёк: ставка идёт дольше обычного. Узнаём requestedAt и готовим возврат по таймауту. */
  async function enterDelayed(seq: bigint) {
    setPhase((p) => (p === "waiting" ? "delayed" : p));
    try {
      const { settled, requestedAt } = await readBetStatus(seq);
      if (settled) return; // колбэк уже пришёл — фоновый опрос подхватит
      const eligibleMs = (Number(requestedAt) + STUCK_TIMEOUT_SEC) * 1000 - Date.now();
      if (eligibleMs <= 0) {
        setCanRefund(true);
      } else {
        clearRefundTimer();
        refundTimer.current = setTimeout(() => setCanRefund(true), eligibleMs);
      }
    } catch {
      /* статус прочитаем позже, при попытке возврата */
    }
  }

  async function place(account: Account, target: bigint, stake: bigint) {
    abortRef.current?.abort();
    clearRefundTimer();
    settledRef.current = false;
    setResult(null);
    setPending(null);
    setCanRefund(false);
    setPhase("submitting");
    try {
      const [gameBal, walletBal, fee] = await Promise.all([
        readGameBalance(account.address),
        readWalletBalance(account.address),
        readEntropyFee(),
      ]);
      if (gameBal + walletBal < stake + fee) {
        throw new Error("Недостаточно средств на счёте");
      }

      const txs = buildBetBatch(gameBal, walletBal, target, stake, fee);
      const sent =
        txs.length > 1
          ? await sendBatchTransaction({ account, transactions: txs })
          : await sendTransaction({ account, transaction: txs[0] });

      const receipt = await waitForReceipt({
        client,
        chain,
        transactionHash: sent.transactionHash,
      });

      const placed = parseEventLogs({ logs: receipt.logs, events: [betPlacedEvent] });
      const seq = placed[0]?.args.sequenceNumber;
      if (seq === undefined) {
        throw new Error("Событие BetPlaced не найдено в транзакции");
      }

      // Ставка подтверждена on-chain: дальше только ожидание колбэка, без «ошибки отправки».
      const fromBlock = receipt.blockNumber;
      const submitTx = sent.transactionHash;
      setPending({ seq, fromBlock, submitTx });
      setPhase("waiting");

      const controller = new AbortController();
      abortRef.current = controller;
      const settledResult = await waitForSettlement(seq, fromBlock, {
        onSlow: () => void enterDelayed(seq),
        signal: controller.signal,
      });
      if (settledResult) settle(settledResult, submitTx);
    } catch (e) {
      // Сбой ДО подтверждения ставки: деньги не списаны → честная ошибка с «Повторить», не фейк-результат.
      setPhase("error");
      toast.error(`Не удалось отправить ставку: ${errMessage(e)}`);
    }
  }

  /** «Обновить» в состоянии «идёт дольше обычного»: немедленная проверка результата по seq. */
  async function refresh() {
    const p = pending;
    if (!p || actionBusy) return;
    setActionBusy(true);
    try {
      const found = await findSettledBySeq(p.seq, p.fromBlock);
      if (found) settle(found, p.submitTx);
      else toast("Результат ещё не пришёл — ставка в блокчейне, появится автоматически.");
    } finally {
      setActionBusy(false);
    }
  }

  /** «Вернуть ставку»: через час без колбэка вернуть средства на счёт (страховка контракта refundStuckBet). */
  async function refund() {
    const p = pending;
    if (!p || !active || actionBusy) return;
    setActionBusy(true);
    try {
      const { settled, requestedAt } = await readBetStatus(p.seq);
      if (settled) {
        const found = await findSettledBySeq(p.seq, p.fromBlock);
        if (found) settle(found, p.submitTx);
        return;
      }
      if (Date.now() / 1000 < Number(requestedAt) + STUCK_TIMEOUT_SEC) {
        toast.error(
          "Вернуть ставку можно через час после отправки, если результат так и не придёт.",
        );
        return;
      }
      const sent = await sendTransaction({
        account: active,
        transaction: refundStuckBetTx(p.seq),
      });
      await waitForReceipt({ client, chain, transactionHash: sent.transactionHash });
      toast.success("Ставка возвращена на счёт");
      settledRef.current = true;
      abortRef.current?.abort();
      reset();
      onRefunded?.();
    } catch (e) {
      toast.error(`Возврат: ${errMessage(e)}`);
    } finally {
      setActionBusy(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    clearRefundTimer();
    settledRef.current = true; // погасить ещё бегущий опрос предыдущей ставки
    setPhase("idle");
    setResult(null);
    setPending(null);
    setCanRefund(false);
  }

  return {
    phase,
    result,
    pending,
    canRefund,
    actionBusy,
    place,
    refresh,
    refund,
    reset,
  };
}
