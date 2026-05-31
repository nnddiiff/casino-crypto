"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuditReads } from "@/hooks/use-audit";
import { casino } from "@/lib/contract";
import { formatBps, formatEth } from "@/lib/format";
import { cn } from "@/lib/utils";

function Metric({
  label,
  value,
  hint,
  subtle,
}: {
  label: string;
  value: string;
  hint?: string;
  subtle?: boolean;
}) {
  return (
    // Одинаковая min-height на каждой ячейке: подписи разной длины (1 vs 2 строки) не ломают строки grid.
    <div className="flex min-h-[5.5rem] flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          subtle ? "text-sm font-medium text-muted-foreground" : "text-lg font-semibold",
        )}
      >
        {value}
      </span>
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
  const betWord = (n: bigint) =>
    n % 10n === 1n && n % 100n !== 11n ? "ставке" : "ставкам";
  // Факт hold на короткой выборке — это шум дисперсии, а не сигнал. Подаём честно: сходится к 1% с объёмом.
  const holdHint =
    total !== undefined && total > 0n
      ? `по ${total.toString()} ${betWord(total)} · короткая дистанция, сходится к 1%`
      : "ставок ещё нет";

  const lockedVal = a.locked.data;
  // «в резерве 0.0000 ETH» выглядит как баг — показываем строку только когда есть незакрытые ставки.
  const bankHint =
    lockedVal !== undefined && lockedVal > 0n
      ? `в резерве ${formatEth(lockedVal)} ETH`
      : undefined;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Самоаудит казино</CardTitle>
        <p className="text-xs text-muted-foreground">
          Все цифры читаются из контракта on-chain. Преимущество казино прозрачно и зашито в
          распределение: <span className="text-foreground">P(выигрыш) = RTP / множитель</span>, RTP = 99%.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <Metric
            label="Теоретический hold"
            value={`${formatBps(a.houseEdgeBps.data)}%`}
            hint="RTP 99% · преимущество казино"
          />
          <Metric label="Фактический hold" value={holdValue} hint={holdHint} subtle />
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
            hint={bankHint}
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
