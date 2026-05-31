"use client";

import { useState } from "react";
import {
  type PreparedTransaction,
  sendBatchTransaction,
  sendTransaction,
  waitForReceipt,
} from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { toast } from "sonner";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { errMessage } from "@/lib/format";

/**
 * Отправка одной или нескольких операций активным смарт-аккаунтом с тостами статуса.
 * Несколько операций уходят одним UserOp (sendBatchTransaction) — атомарно и без лишних подтверждений.
 * Для кассы (кран/вывод). Ставка Limbo асинхронна — у неё своя машина состояний (usePlaceBet).
 */
export function useSend() {
  const account = useActiveAccount();
  const [isPending, setIsPending] = useState(false);

  async function send(
    txs: PreparedTransaction[],
    label: string,
    onConfirmed?: () => void,
  ): Promise<boolean> {
    if (!account || txs.length === 0) return false;
    setIsPending(true);
    const id = toast.loading(`${label}: отправляем…`);
    try {
      const sent =
        txs.length > 1
          ? await sendBatchTransaction({ account, transactions: txs })
          : await sendTransaction({ account, transaction: txs[0] });
      await waitForReceipt({
        client,
        chain,
        transactionHash: sent.transactionHash,
      });
      toast.success(`${label}: готово`, { id });
      onConfirmed?.();
      return true;
    } catch (e) {
      toast.error(`${label}: не удалось`, { id, description: errMessage(e) });
      return false;
    } finally {
      setIsPending(false);
    }
  }

  return { send, isPending, account };
}
