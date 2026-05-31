"use client";

import { useRef, useState } from "react";
import { sendTransaction, waitForReceipt } from "thirdweb";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import type { Account } from "thirdweb/wallets";
import { toast } from "sonner";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { FAUCET_AMOUNT } from "@/lib/constants";
import type { SettledResult } from "@/lib/events";
import { errMessage } from "@/lib/format";
import {
  claimFaucetTx,
  readEntropyFee,
  readFaucet,
  readGameBalance,
  readWalletBalance,
} from "@/lib/funding";
import { connectModalConfig } from "@/lib/wallet";
import { usePlaceBet } from "./use-place-bet";

/**
 * Довести счёт до суммы `need`: если не хватает и кран ещё доступен — молча берём бесплатный
 * тестовый ETH (gasless). Возвращает true, если после этого средств достаточно.
 */
async function ensureFunded(account: Account, need: bigint): Promise<boolean> {
  const [g, w] = await Promise.all([
    readGameBalance(account.address),
    readWalletBalance(account.address),
  ]);
  if (g + w >= need) return true;

  const { claimed, pool } = await readFaucet(account.address);
  if (claimed || pool < FAUCET_AMOUNT) return false;

  const sent = await sendTransaction({ account, transaction: claimFaucetTx() });
  await waitForReceipt({ client, chain, transactionHash: sent.transactionHash });

  const [g2, w2] = await Promise.all([
    readGameBalance(account.address),
    readWalletBalance(account.address),
  ]);
  return g2 + w2 >= need;
}

/**
 * Прогрессивный вход + ставка одной кнопкой («Войти и сыграть»).
 * Не вошёл → открываем email-вход (возвращается смарт-аккаунт, gasless) → авто-кран при нуле → ставка.
 * Уже вошёл → авто-кран при нуле → ставка. Все шаги безгазовые и без лишних подтверждений.
 */
export function usePlay(
  onSettled?: (result: SettledResult) => void,
  onRefunded?: () => void,
) {
  const active = useActiveAccount();
  const { connect } = useConnectModal();
  const { phase, result, pending, canRefund, actionBusy, place, refresh, refund, reset } =
    usePlaceBet(onSettled, onRefunded);
  const [preparing, setPreparing] = useState(false);
  // Синхронный гард двойной отправки: реактивный `busy`/disabled не закрывает двойной клик
  // за один тик до ре-рендера (риск гонки nonce). Выставляем ДО первого await, снимаем в finally.
  const inFlight = useRef(false);
  // Последняя ставка — для «Повторить» после сбоя отправки.
  const lastArgs = useRef<{ target: bigint; stake: bigint } | null>(null);

  async function play(target: bigint, stake: bigint) {
    if (inFlight.current) return;
    inFlight.current = true;
    lastArgs.current = { target, stake };
    try {
      let account = active;

      if (!account) {
        setPreparing(true);
        try {
          const wallet = await connect(connectModalConfig);
          account = wallet.getAccount();
        } catch {
          return; // пользователь закрыл вход
        }
      }
      if (!account) return;

      const fee = await readEntropyFee();
      const funded = await ensureFunded(account, stake + fee);
      setPreparing(false);
      if (!funded) {
        toast.error("Не хватает на счёте. Пополни баланс или уменьши ставку.");
        return;
      }
      await place(account, target, stake);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setPreparing(false);
      inFlight.current = false;
    }
  }

  /** Повторить последнюю ставку после сбоя отправки (состояние «error»). */
  function retry() {
    const a = lastArgs.current;
    if (a) void play(a.target, a.stake);
  }

  const busy =
    preparing || phase === "submitting" || phase === "waiting" || phase === "delayed";

  return {
    play,
    retry,
    refresh,
    refund,
    reset,
    phase,
    result,
    pending,
    canRefund,
    actionBusy,
    busy,
    preparing,
    isConnected: !!active,
  };
}
