"use client";

import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useLastBet } from "@/components/last-bet-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCasinoReads } from "@/hooks/use-casino";
import { usePlaceBet } from "@/hooks/use-place-bet";
import {
  formatEth,
  MAX_TARGET,
  MIN_TARGET,
  parseTarget,
  tryParseEth,
  winChancePct,
} from "@/lib/format";
import { MultiplierDisplay } from "./multiplier-display";

/** Игра Limbo: множитель + ставка → placeBet → ожидание колбэка Pyth → результат. */
export function LimboGame() {
  const account = useActiveAccount();
  const address = account?.address;
  const reads = useCasinoReads(address);
  const { phase, result, place } = usePlaceBet(() => reads.refetchAll());
  const { setLastBet } = useLastBet();

  const [target, setTarget] = useState("2.00");
  const [stake, setStake] = useState("0.001");

  // Разыгранную ставку отдаём верификатору: seq + точный блок колбэка (проверка без поиска).
  useEffect(() => {
    if (phase === "result" && result) {
      setLastBet({ seq: result.sequenceNumber, block: result.settledBlock });
    }
  }, [phase, result, setLastBet]);

  if (!address) return null;

  const gameBal = reads.gameBalance.data;
  const fee = reads.entropyFee.data;

  let targetFixed = 0n;
  try {
    targetFixed = parseTarget(target);
  } catch {
    targetFixed = 0n;
  }
  const stakeWei = tryParseEth(stake);

  const busy = phase === "submitting" || phase === "waiting";
  const targetValid = targetFixed >= MIN_TARGET && targetFixed <= MAX_TARGET;
  const stakeValid = stakeWei > 0n && gameBal !== undefined && stakeWei <= gameBal;
  const canBet = !busy && targetValid && stakeValid && fee !== undefined;

  function onBet() {
    if (fee === undefined || !targetValid || !stakeValid) return;
    void place(targetFixed, stakeWei, fee);
  }

  const chance = targetValid ? winChancePct(targetFixed) : 0;
  const payout =
    targetValid && stakeWei > 0n ? formatEth((stakeWei * targetFixed) / 1_000_000n) : "—";

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-4">
        <MultiplierDisplay phase={phase} result={result} />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target">Множитель ×</Label>
            <Input
              id="target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stake">Ставка, ETH</Label>
            <Input
              id="stake"
              inputMode="decimal"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Шанс: {chance.toFixed(1)}%</span>
          <span>Выплата: {payout} ETH</span>
        </div>

        <Button className="h-12 text-base font-semibold" disabled={!canBet} onClick={onBet}>
          {busy ? "Ждём результат…" : "PLACE BET"}
        </Button>

        <p className="min-h-4 text-xs text-destructive">
          {!targetValid && target.trim()
            ? "Множитель от 1.01 до 10000"
            : stakeWei > 0n && gameBal !== undefined && stakeWei > gameBal
              ? `Не хватает игрового баланса (есть ${formatEth(gameBal)} ETH)`
              : ""}
        </p>
      </CardContent>
    </Card>
  );
}
