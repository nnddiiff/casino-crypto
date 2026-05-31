"use client";

import { useRecentBetsContext } from "@/components/recent-bets-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addressUrl, txUrl } from "@/lib/constants";
import { casino } from "@/lib/contract";
import { formatEth, formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Лента ставок из on-chain BetSettled. Каждая строка открывается в эксплорере — исход нельзя подделать. */
export function RecentBetsFeed() {
  const { bets } = useRecentBetsContext();

  return (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle>Лента ставок</CardTitle>
        <p className="text-xs text-muted-foreground">
          Каждая ставка и её исход — публичное событие контракта. Любую строку можно открыть on-chain.
        </p>
      </CardHeader>
      <CardContent>
        {bets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет ставок в последних блоках. Сыграй первым — появится здесь.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">Игрок</th>
                  <th className="py-2 font-normal">Цель</th>
                  <th className="py-2 font-normal">Выпало</th>
                  <th className="py-2 text-right font-normal">Выплата</th>
                  <th className="py-2 text-right font-normal">On-chain</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((b) => (
                  <tr key={b.seq.toString()} className="border-t border-border/60">
                    <td className="py-2 font-mono text-xs">{shortAddr(b.player)}</td>
                    <td className="py-2 tabular-nums">{formatMultiplier(b.target)}×</td>
                    <td
                      className={cn(
                        "py-2 font-semibold tabular-nums",
                        b.won ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {formatMultiplier(b.resultMultiplier)}×
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {b.won ? `+${formatEth(b.payout)}` : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <a
                        href={b.txHash ? txUrl(b.txHash) : `${addressUrl(casino.address)}#events`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        #{b.seq.toString()}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
