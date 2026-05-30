"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLastBet } from "@/components/last-bet-context";
import { useVerify } from "@/hooks/use-verify";
import { ENTROPY_ADDRESS } from "@/lib/entropy";
import { formatEth, formatMultiplier } from "@/lib/format";
import type { VerifyResult } from "@/lib/verify";

/** 0x1234…abcd — короткий вид длинного hex с полным значением в title. */
function short(hex: string): string {
  if (hex.length <= 14) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

const TX_BASE = "https://sepolia.basescan.org/tx";
const ENTROPY_EVENTS = `https://sepolia.basescan.org/address/${ENTROPY_ADDRESS}#events`;

/**
 * Верификатор честности (закрывает пруф «проверяемо on-chain»).
 * Контракт записывает исход, но не публикует сырое случайное число — его публикует Pyth Entropy.
 * Панель тянет randomNumber из события Pyth `Revealed`, пересчитывает множитель функцией
 * previewMultiplier и показывает, что он совпадает с записанным BetSettled. Видна без кошелька.
 */
export function VerifyPanel() {
  const { lastBet } = useLastBet();
  const { phase, result, run } = useVerify();
  const [seqInput, setSeqInput] = useState("");

  // Подставляем номер только что сыгранной ставки — для бесшовного демо «сыграл → проверил».
  useEffect(() => {
    if (lastBet) setSeqInput(lastBet.seq.toString());
  }, [lastBet]);

  const checking = phase === "checking";

  function onVerify() {
    let seq: bigint;
    try {
      seq = BigInt(seqInput.trim());
    } catch {
      return;
    }
    // Точный блок известен только для ставки этой сессии — тогда проверка мгновенна (без поиска).
    const blockHint = lastBet && lastBet.seq === seq ? lastBet.block : undefined;
    void run(seq, blockHint);
  }

  const seqValid = (() => {
    try {
      return BigInt(seqInput.trim()) > 0n;
    } catch {
      return false;
    }
  })();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Проверка честности ставки</CardTitle>
        <p className="text-xs text-muted-foreground">
          Казино записывает исход, но <span className="text-foreground">сырое случайное число публикует сам Pyth Entropy</span>.
          Введите номер ставки (sequence number): достанем число из события Pyth, пересчитаем множитель
          функцией контракта <span className="text-foreground">previewMultiplier</span> и покажем, что он
          совпадает с записанным исходом.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="seq" className="text-xs text-muted-foreground">
              Номер ставки (seq)
            </label>
            <Input
              id="seq"
              inputMode="numeric"
              placeholder="напр. 56001"
              value={seqInput}
              onChange={(e) => setSeqInput(e.target.value)}
              disabled={checking}
            />
          </div>
          <Button onClick={onVerify} disabled={checking || !seqValid}>
            {checking ? "Проверяем…" : "Проверить"}
          </Button>
        </div>

        {checking ? (
          <p className="text-sm text-muted-foreground">
            Ищем случайное число Pyth и пересчитываем исход on-chain…
          </p>
        ) : null}

        {phase === "done" && result ? <Verdict result={result} /> : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono, title }: { label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : "font-semibold"} tabular-nums`} title={title}>
        {value}
      </span>
    </div>
  );
}

function Verdict({ result }: { result: VerifyResult }) {
  if (!result.ok) {
    const text =
      result.reason === "unknown"
        ? "Ставка с таким номером в этом казино не найдена."
        : result.reason === "unsettled"
          ? "Ставка ещё не разыграна — ждём колбэк Pyth."
          : result.reason === "notfound"
            ? "Не нашли событие Pyth для этой ставки в доступном окне блоков. Сверьте номер или откройте события контракта Pyth."
            : "Не удалось выполнить проверку. Повторите попытку.";
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-4">
        <p className="text-sm text-muted-foreground">{text}</p>
        {result.reason === "notfound" ? (
          <a
            href={ENTROPY_EVENTS}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            События контракта Pyth Entropy на Basescan →
          </a>
        ) : null}
      </div>
    );
  }

  const ok = result.match;
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${
        ok ? "border-primary/40 bg-primary/5" : "border-destructive/50 bg-destructive/5"
      }`}
    >
      <div className={`flex items-center gap-2 text-base font-semibold ${ok ? "text-primary" : "text-destructive"}`}>
        <span className="text-xl">{ok ? "✓" : "✗"}</span>
        <span>{ok ? "Исход честный — пересчёт совпал с записью" : "Расхождение: пересчёт не совпал с записью"}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Row
          label="Случайное число (Pyth Revealed)"
          value={short(result.randomNumber)}
          mono
          title={result.randomNumber}
        />
        <Row label="Пересчитано из него (previewMultiplier)" value={`${formatMultiplier(result.recomputed)}×`} />
        <Row label="Записано контрактом (BetSettled)" value={`${formatMultiplier(result.recorded)}×`} />
        <Row
          label="Цель / исход"
          value={`${formatMultiplier(result.target)}× · ${
            result.won ? `выигрыш +${formatEth(result.payout)} ETH` : "проигрыш"
          }`}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Случайное число пришло из контракта Pyth, а не из казино. Пересчёт — публичная функция нашего
        контракта. Совпадение доказывает, что исход не подделан.
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <a
          href={`${TX_BASE}/${result.settledTxHash}#eventlog`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Транзакция расчёта (Pyth Revealed + BetSettled) →
        </a>
        <a
          href={ENTROPY_EVENTS}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Контракт Pyth Entropy →
        </a>
      </div>
    </div>
  );
}
