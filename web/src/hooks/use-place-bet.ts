"use client";

import { useState } from "react";
import {
  parseEventLogs,
  sendBatchTransaction,
  sendTransaction,
  waitForReceipt,
} from "thirdweb";
import { toast } from "sonner";
import type { Account } from "thirdweb/wallets";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { betPlacedEvent, type SettledResult, waitForSettlement } from "@/lib/events";
import {
  buildBetBatch,
  readEntropyFee,
  readGameBalance,
  readWalletBalance,
} from "@/lib/funding";
import { errMessage } from "@/lib/format";

export type BetPhase = "idle" | "submitting" | "waiting" | "result";
export type BetResult = (SettledResult & { txHash: string }) | null;

/**
 * Машина состояний асинхронной ставки Limbo:
 * idle → submitting (UserOp: автодепозит при нехватке + placeBet) → waiting (колбэк Pyth) → result.
 *
 * Финансирование скрыто: если в игре не хватает на ставку, тем же UserOp незаметно доносим
 * нужную сумму со смарт-аккаунта (depositTx) — для игрока это один баланс «Счёт казино».
 * @param onSettled колбэк после расчёта — обновить балансы/ленту.
 */
export function usePlaceBet(onSettled?: (result: SettledResult) => void) {
  const [phase, setPhase] = useState<BetPhase>("idle");
  const [result, setResult] = useState<BetResult>(null);

  async function place(account: Account, target: bigint, stake: bigint) {
    setPhase("submitting");
    setResult(null);
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

      setPhase("waiting");
      const settled = await waitForSettlement(seq, receipt.blockNumber);
      setResult({ ...settled, txHash: sent.transactionHash });
      setPhase("result");
      onSettled?.(settled);
    } catch (e) {
      toast.error(`Ставка: ${errMessage(e)}`);
      setPhase("idle");
    }
  }

  function reset() {
    setPhase("idle");
    setResult(null);
  }

  return { phase, result, place, reset };
}
