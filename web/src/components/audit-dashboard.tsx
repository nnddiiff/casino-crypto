"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuditReads } from "@/hooks/use-audit";
import { casino } from "@/lib/contract";
import { formatBps, formatEth } from "@/lib/format";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Дашборд самоаудита: live edge/hold/RTP + статистика банка прямо из контракта. Дифференциатор «не скам». */
export function AuditDashboard() {
  const a = useAuditReads();

  const total = a.betsTotal.data;
  const won = a.betsWon.data;
  const hold = a.hold.data; // [houseAhead, magnitudeBps]

  const winRate =
    total !== undefined && total > 0n && won !== undefined
      ? `${((Number(won) / Number(total)) * 100).toFixed(0)}%`
      : "—";

  const holdValue = hold
    ? `${hold[0] ? "казино" : "игроки"} +${formatBps(hold[1])}%`
    : "—";
  const holdHint =
    total !== undefined && total > 0n ? `по ${total.toString()} ставкам` : "ставок ещё нет";

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Самоаудит казино</CardTitle>
        <p className="text-xs text-muted-foreground">
          Все цифры читаются из контракта on-chain. Преимущество казино прозрачно и зашито в
          распределение: <span className="text-foreground">P(выигрыш) = RTP / множитель</span>, RTP = 99%.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <Metric label="Преимущество (теория)" value={`${formatBps(a.houseEdgeBps.data)}%`} hint="RTP 99%" />
          <Metric label="Фактический hold" value={holdValue} hint={holdHint} />
          <Metric
            label="Ставок сыграно"
            value={total !== undefined ? total.toString() : "—"}
            hint={`выиграно ${won?.toString() ?? "—"} · ${winRate}`}
          />
          <Metric label="Объём ставок" value={`${formatEth(a.totalWagered.data)} ETH`} />
          <Metric label="Выплачено игрокам" value={`${formatEth(a.totalPaidOut.data)} ETH`} />
          <Metric
            label="Банк казино"
            value={`${formatEth(a.casinoBank.data)} ETH`}
            hint={`в резерве ${formatEth(a.locked.data)} ETH`}
          />
        </div>
        <a
          href={`https://sepolia.basescan.org/address/${casino.address}#events`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Проверить все ставки и исходы on-chain →
        </a>
      </CardContent>
    </Card>
  );
}
