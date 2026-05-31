"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import type { BetPhase, BetResult, PendingBet } from "@/hooks/use-place-bet";
import type { RecentBet } from "@/hooks/use-recent-bets";
import { addressUrl, txUrl } from "@/lib/constants";
import { casino } from "@/lib/contract";
import { formatEth, formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";

const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** Пользователь просит без анимаций — уважаем prefers-reduced-motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

type StageProps = {
  phase: BetPhase;
  result: BetResult;
  recent: RecentBet[];
  pending: PendingBet | null;
  canRefund: boolean;
  actionBusy: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onRefund: () => void;
};

/** Правая колонка экрана игры (Stake-канон): лента исходов сверху + крупный множитель + статус/развилки. */
export function MultiplierStage({
  phase,
  result,
  recent,
  pending,
  canRefund,
  actionBusy,
  onRetry,
  onRefresh,
  onRefund,
}: StageProps) {
  return (
    <Card className="flex min-h-[360px] flex-1 flex-col justify-between gap-0 py-0 sm:min-h-[440px]">
      <div className="no-scrollbar fade-right flex items-center gap-1.5 overflow-x-auto px-4 py-3">
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
        <StatusLine
          phase={phase}
          result={result}
          pending={pending}
          canRefund={canRefund}
          actionBusy={actionBusy}
          onRetry={onRetry}
          onRefresh={onRefresh}
          onRefund={onRefund}
        />
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

/** Разгон во время ожидания: монотонный рост ВВЕРХ с ускорением (ease-in), без случайных скачков. */
const SPIN_RATE = 0.85; // экспонента разгона (доли/сек)
const SPIN_CAP = 50; // мягкий потолок — дальше медленный дрейф, не упор и не зависание

function BigMultiplier({ phase, result }: { phase: BetPhase; result: BetResult }) {
  const [display, setDisplay] = useState("1.00");
  const [popping, setPopping] = useState(false);
  const valueRef = useRef(1); // текущее показанное число (точка старта для count-up на результате)
  const rafRef = useRef(0);

  const spinning = phase === "waiting" || phase === "delayed";
  const won = phase === "result" && result?.won === true;
  const lost = phase === "result" && result !== null && !result.won;

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const reduced = prefersReducedMotion();

    // Покой / отправка / ошибка: спокойная «1.00», без разгона.
    if (phase === "idle" || phase === "submitting" || phase === "error") {
      valueRef.current = 1;
      setDisplay("1.00");
      setPopping(false);
      return;
    }

    // Ожидание колбэка Pyth: число ползёт вверх ускоряясь. reduced-motion → держим 1.00 статично.
    if (spinning) {
      setPopping(false);
      if (reduced) {
        setDisplay("1.00");
        return;
      }
      const capTime = Math.log(SPIN_CAP) / SPIN_RATE; // когда разгон достигнет потолка
      const start = performance.now();
      const tick = (t: number) => {
        const elapsed = (t - start) / 1000;
        let v = Math.exp(elapsed * SPIN_RATE); // 1.0 в нуле, дальше ускоряется
        if (v > SPIN_CAP) v = SPIN_CAP + (elapsed - capTime) * 0.8; // мягкий дрейф, остаётся «живым»
        valueRef.current = v;
        setDisplay(v.toFixed(2));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }

    // Раскрытие: быстрый count-up от показанного значения к РЕАЛЬНОМУ выпавшему + «pop».
    if (phase === "result" && result) {
      const final = Number(result.resultMultiplier) / 1_000_000;
      if (reduced) {
        valueRef.current = final;
        setDisplay(final.toFixed(2));
        setPopping(false);
        return;
      }
      const from = valueRef.current;
      const start = performance.now();
      const duration = 500;
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / duration);
        const value = from + (final - from) * easeOut(k);
        setDisplay(value.toFixed(2));
        if (k < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(final.toFixed(2));
          valueRef.current = final;
          setPopping(true); // короткий scale-bounce на фиксации
        }
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [phase, result, spinning]);

  return (
    <div
      className={cn(
        "flex items-start font-bold tabular-nums transition-colors duration-300",
        won && "text-primary drop-shadow-[0_0_28px_rgba(0,231,1,0.45)]",
        lost && "text-destructive",
        !won && !lost && spinning && "text-muted-foreground",
        !won && !lost && !spinning && "text-foreground",
        spinning && "animate-spin-pulse",
        popping && "animate-result-pop",
      )}
    >
      <span className="text-7xl leading-none sm:text-8xl">{display}</span>
      <span className="ml-1 mt-1 text-4xl leading-none opacity-80 sm:text-5xl">×</span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary align-[-2px]"
      aria-hidden="true"
    />
  );
}

function StatusLine({
  phase,
  result,
  pending,
  canRefund,
  actionBusy,
  onRetry,
  onRefresh,
  onRefund,
}: Omit<StageProps, "recent">) {
  if (phase === "submitting") {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Отправляем ставку…
      </p>
    );
  }
  if (phase === "waiting") {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> <span className="text-primary">✦</span> Крутим случайность Pyth…
      </p>
    );
  }
  if (phase === "delayed") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Идёт дольше обычного
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {pending
            ? `Ставка #${pending.seq.toString()} уже в блокчейне и появится автоматически.`
            : "Ставка уже в блокчейне и появится автоматически."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          {pending?.submitTx ? (
            <a
              href={txUrl(pending.submitTx)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Открыть в Basescan
            </a>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={actionBusy}
            className="rounded-md border border-border px-2.5 py-1 transition-colors hover:border-primary/50 disabled:opacity-40"
          >
            Обновить
          </button>
          {canRefund ? (
            <button
              type="button"
              onClick={onRefund}
              disabled={actionBusy}
              className="rounded-md border border-amber-500/40 px-2.5 py-1 text-amber-400 transition-colors hover:border-amber-500 disabled:opacity-40"
            >
              Вернуть ставку
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-destructive">Не удалось отправить ставку</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Проверь соединение и попробуй снова — деньги не списаны.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-3 py-1 text-xs transition-colors hover:border-primary/50"
        >
          Повторить
        </button>
      </div>
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
