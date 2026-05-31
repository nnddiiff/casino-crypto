"use client";

import { useActiveAccount } from "thirdweb/react";
import { useLastBet } from "@/components/last-bet-context";
import { useRecentBetsContext } from "@/components/recent-bets-context";
import { useAccount } from "@/hooks/use-account";
import { usePlay } from "@/hooks/use-play";
import { BetPanel } from "./bet-panel";
import { MultiplierStage } from "./multiplier-stage";

/** Экран игры: левая панель ставки + крупный множитель. Виден сразу, до входа (стена «подключи кошелёк» убрана). */
export function GameScreen() {
  const active = useActiveAccount();
  const reads = useAccount(active?.address);
  const { bets, prepend } = useRecentBetsContext();
  const { setLastBet } = useLastBet();

  const { play, phase, result, busy, preparing, isConnected } = usePlay((settled) => {
    reads.refetchAll();
    prepend({
      seq: settled.sequenceNumber,
      player: settled.player,
      resultMultiplier: settled.resultMultiplier,
      target: settled.target,
      won: settled.won,
      payout: settled.payout,
      txHash: settled.settledTxHash,
      block: settled.settledBlock,
    });
    setLastBet({ seq: settled.sequenceNumber, block: settled.settledBlock });
  });

  const primaryLabel = !isConnected
    ? "Войти и сыграть"
    : preparing
      ? "Готовим…"
      : phase === "submitting"
        ? "Отправляем…"
        : phase === "waiting"
          ? "Ждём результат…"
          : "Сыграть";

  return (
    <div className="flex w-full max-w-5xl flex-col-reverse gap-3 lg:flex-row lg:items-stretch">
      <BetPanel
        account={{
          total: reads.total,
          fee: reads.entropyFee,
          faucetClaimed: reads.faucetClaimed,
          casinoBank: reads.casinoBank,
        }}
        isConnected={isConnected}
        busy={busy}
        primaryLabel={primaryLabel}
        onPlay={(t, s) => void play(t, s)}
      />
      <MultiplierStage phase={phase} result={result} recent={bets} />
    </div>
  );
}
