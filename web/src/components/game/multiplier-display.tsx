"use client";

import { useEffect, useState } from "react";
import type { BetPhase, BetResult } from "@/hooks/use-place-bet";
import { casino } from "@/lib/contract";
import { formatEth, formatMultiplier } from "@/lib/format";

/** Центральная анимированная цифра множителя + строка статуса под ней. */
export function MultiplierDisplay({
  phase,
  result,
}: {
  phase: BetPhase;
  result: BetResult;
}) {
  const [rolling, setRolling] = useState("1.00");

  // «Крутка» цифры, пока ждём результат.
  useEffect(() => {
    if (phase !== "submitting" && phase !== "waiting") return;
    const id = setInterval(() => {
      setRolling((1 + Math.random() * 11).toFixed(2));
    }, 80);
    return () => clearInterval(id);
  }, [phase]);

  const won = result?.won ?? false;
  const display =
    phase === "result" && result
      ? formatMultiplier(result.resultMultiplier)
      : phase === "idle"
        ? "—"
        : rolling;

  const colorClass =
    phase === "result"
      ? won
        ? "text-primary"
        : "text-muted-foreground"
      : "text-foreground";

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <div
        className={`flex items-baseline font-bold tabular-nums transition-colors ${colorClass} ${
          phase === "waiting" ? "animate-pulse" : ""
        }`}
      >
        <span className="text-6xl sm:text-7xl">{display}</span>
        <span className="text-2xl text-muted-foreground">×</span>
      </div>
      <StatusLine phase={phase} result={result} />
    </div>
  );
}

function StatusLine({ phase, result }: { phase: BetPhase; result: BetResult }) {
  if (phase === "submitting") {
    return <p className="text-sm text-muted-foreground">Отправляем ставку…</p>;
  }
  if (phase === "waiting") {
    return <p className="text-sm text-muted-foreground">Pyth Entropy определяет результат…</p>;
  }
  if (phase === "result" && result) {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <p className={`text-sm font-medium ${result.won ? "text-primary" : "text-muted-foreground"}`}>
          {result.won
            ? `Выигрыш +${formatEth(result.payout)} ETH`
            : `Мимо · цель была ${formatMultiplier(result.target)}×`}
        </p>
        <a
          href={`https://sepolia.basescan.org/address/${casino.address}#events`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          пруф честности on-chain · seq {result.sequenceNumber.toString()}
        </a>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">provably fair · Pyth Entropy</p>;
}
