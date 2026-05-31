"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import type { BetPhase, BetResult } from "@/hooks/use-place-bet";
import type { RecentBet } from "@/hooks/use-recent-bets";
import { addressUrl, txUrl } from "@/lib/constants";
import { casino } from "@/lib/contract";
import { formatEth, formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";

const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** Правая колонка экрана игры (Stake-канон): лента исходов сверху + крупный множитель + статус. */
export function MultiplierStage({
  phase,
  result,
  recent,
}: {
  phase: BetPhase;
  result: BetResult;
  recent: RecentBet[];
}) {
  return (
    <Card className="flex min-h-[360px] flex-1 flex-col justify-between gap-0 py-0 sm:min-h-[440px]">
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-3">
        {recent.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            Лента ставок появится после первых розыгрышей
          </span>
        ) : (
          recent.map((b) => <ResultPill key={b.seq.toString()} bet={b} />)
        )}
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
        <BigMultiplier phase={phase} result={result} />
      </div>

      <div className="px-4 pb-5 pt-2 text-center">
        <StatusLine phase={phase} result={result} />
      </div>
    </Card>
  );
}

function ResultPill({ bet }: { bet: RecentBet }) {
  return (
    <a
      href={bet.txHash ? txUrl(bet.txHash) : `${addressUrl(casino.address)}#events`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Ставка #${bet.seq.toString()} · цель ${formatMultiplier(bet.target)}× · ${
        bet.won ? "выигрыш" : "мимо"
      } · открыть on-chain`}
      className={cn(
        "shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors",
        bet.won
          ? "bg-primary/10 text-primary hover:bg-primary/20"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {formatMultiplier(bet.resultMultiplier)}×
    </a>
  );
}

function BigMultiplier({ phase, result }: { phase: BetPhase; result: BetResult }) {
  const [display, setDisplay] = useState("1.00");
  const busy = phase === "submitting" || phase === "waiting";

  useEffect(() => {
    if (phase === "idle") {
      setDisplay("1.00");
      return;
    }
    if (busy) {
      const id = setInterval(() => {
        setDisplay((1 + Math.random() * 9).toFixed(2));
      }, 70);
      return () => clearInterval(id);
    }
    if (phase === "result" && result) {
      // «Прокрут вверх и замирание»: count-up от 1.00 к выпавшему множителю.
      const final = Number(result.resultMultiplier) / 1_000_000;
      const startedAt = performance.now();
      const duration = 550;
      let raf = 0;
      const tick = (t: number) => {
        const k = Math.min(1, (t - startedAt) / duration);
        const value = 1 + (final - 1) * easeOut(k);
        setDisplay(value.toFixed(2));
        if (k < 1) raf = requestAnimationFrame(tick);
        else setDisplay(final.toFixed(2));
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
  }, [phase, busy, result]);

  const won = phase === "result" && result?.won;
  const lost = phase === "result" && result && !result.won;

  return (
    <div
      className={cn(
        "flex items-baseline font-bold tabular-nums transition-all duration-300",
        won && "text-primary drop-shadow-[0_0_24px_rgba(0,231,1,0.35)]",
        lost && "text-destructive",
        !won && !lost && "text-foreground",
        phase === "result" && "scale-105",
        phase === "waiting" && "animate-pulse",
      )}
    >
      <span className="text-7xl sm:text-8xl">{display}</span>
      <span className="text-3xl text-muted-foreground">×</span>
    </div>
  );
}

function StatusLine({ phase, result }: { phase: BetPhase; result: BetResult }) {
  if (phase === "submitting") {
    return <p className="text-sm text-muted-foreground">Отправляем ставку…</p>;
  }
  if (phase === "waiting") {
    return (
      <p className="text-sm text-muted-foreground">
        Pyth Entropy определяет результат…
      </p>
    );
  }
  if (phase === "result" && result) {
    const proofHref = result.settledTxHash
      ? txUrl(result.settledTxHash)
      : `${addressUrl(casino.address)}#events`;
    return (
      <div className="flex flex-col items-center gap-1">
        <p
          className={cn(
            "text-base font-semibold",
            result.won ? "text-primary" : "text-muted-foreground",
          )}
        >
          {result.won
            ? `Выигрыш +${formatEth(result.payout)} ETH`
            : `Мимо · цель была ${formatMultiplier(result.target)}×`}
        </p>
        <a
          href={proofHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Проверить розыгрыш on-chain · ставка #{result.sequenceNumber.toString()}
        </a>
      </div>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      🛡 Исход решает Pyth Entropy — проверяемо on-chain
    </p>
  );
}
