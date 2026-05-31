"use client";

import { useState } from "react";
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
import { accountAbstraction, wallets } from "@/lib/wallet";
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
export function usePlay(onSettled?: (result: SettledResult) => void) {
  const active = useActiveAccount();
  const { connect } = useConnectModal();
  const { phase, result, place, reset } = usePlaceBet(onSettled);
  const [preparing, setPreparing] = useState(false);

  async function play(target: bigint, stake: bigint) {
    let account = active;

    if (!account) {
      setPreparing(true);
      try {
        const wallet = await connect({
          client,
          chain,
          wallets,
          accountAbstraction,
          size: "compact",
          theme: "dark",
        });
        account = wallet.getAccount();
      } catch {
        setPreparing(false);
        return; // пользователь закрыл вход
      }
    }
    if (!account) {
      setPreparing(false);
      return;
    }

    try {
      const fee = await readEntropyFee();
      const funded = await ensureFunded(account, stake + fee);
      setPreparing(false);
      if (!funded) {
        toast.error("Не хватает на счёте. Пополни баланс или уменьши ставку.");
        return;
      }
      await place(account, target, stake);
    } catch (e) {
      setPreparing(false);
      toast.error(errMessage(e));
    }
  }

  const busy = preparing || phase === "submitting" || phase === "waiting";
  return { play, phase, result, reset, busy, preparing, isConnected: !!active };
}
