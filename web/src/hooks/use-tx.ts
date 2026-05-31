"use client";

import { type PreparedTransaction, waitForReceipt } from "thirdweb";
import { useSendTransaction } from "thirdweb/react";
import { toast } from "sonner";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { errMessage } from "@/lib/format";

/**
 * Отправка транзакции с ожиданием подтверждения и тостами статуса.
 * Подходит для синхронных операций (кран/депозит/вывод). Ставка Limbo асинхронна —
 * её колбэк (BetSettled) ждём отдельно поверх этого же механизма.
 */
export function useTx() {
  const { mutateAsync, isPending } = useSendTransaction();

  async function send(
    tx: PreparedTransaction,
    label: string,
    onConfirmed?: () => void,
  ): Promise<boolean> {
    const id = toast.loading(`${label}: отправляем транзакцию…`);
    try {
      const result = await mutateAsync(tx);
      toast.loading(`${label}: ждём подтверждения сети…`, { id });
      await waitForReceipt({
        client,
        chain,
        transactionHash: result.transactionHash,
      });
      toast.success(`${label}: готово`, { id });
      onConfirmed?.();
      return true;
    } catch (e) {
      toast.error(`${label}: не удалось`, { id, description: errMessage(e) });
      return false;
    }
  }

  return { send, isPending };
}
