"use client";

import { useState } from "react";
import { parseEventLogs, prepareContractCall, waitForReceipt } from "thirdweb";
import { useSendTransaction } from "thirdweb/react";
import { toast } from "sonner";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { casino } from "@/lib/contract";
import { betPlacedEvent, type SettledArgs, waitForSettlement } from "@/lib/events";
import { errMessage } from "@/lib/format";

export type BetPhase = "idle" | "submitting" | "waiting" | "result";
export type BetResult = (SettledArgs & { txHash: string }) | null;

/**
 * Машина состояний асинхронной ставки Limbo:
 * idle → submitting (tx1: placeBet) → waiting (ждём колбэк Pyth) → result.
 * @param onSettled колбэк после расчёта — для обновления балансов.
 */
export function usePlaceBet(onSettled?: () => void) {
  const [phase, setPhase] = useState<BetPhase>("idle");
  const [result, setResult] = useState<BetResult>(null);
  const { mutateAsync } = useSendTransaction();

  async function place(target: bigint, stake: bigint, fee: bigint) {
    setPhase("submitting");
    setResult(null);
    try {
      const tx = prepareContractCall({
        contract: casino,
        method: "function placeBet(uint256 target, uint256 stake) payable",
        params: [target, stake],
        value: fee, // msg.value = комиссия Pyth (getFeeV2)
      });
      const sent = await mutateAsync(tx);
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
      onSettled?.();
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
