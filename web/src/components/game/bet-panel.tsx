"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_BET } from "@/lib/constants";
import {
  formatEth,
  MAX_TARGET,
  MIN_TARGET,
  parseTarget,
  TARGET_SCALE,
  toEthInput,
  tryParseEth,
  winChancePct,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type AccountView = {
  total?: bigint;
  fee?: bigint;
  faucetClaimed?: boolean;
  casinoBank?: bigint;
};

const AMOUNT_CHIPS = ["0.001", "0.005", "0.01"];
const TARGET_CHIPS = ["1.5", "2", "5", "10"];

/** Левая панель ставки (Stake-канон): сумма + чипы/½/2×, целевой множитель + чипы, шанс/выплата, «Сыграть». */
export function BetPanel({
  account,
  isConnected,
  busy,
  primaryLabel,
  onPlay,
}: {
  account: AccountView;
  isConnected: boolean;
  busy: boolean;
  primaryLabel: string;
  onPlay: (targetFixed: bigint, stakeWei: bigint) => void;
}) {
  const [stake, setStake] = useState("0.001");
  const [target, setTarget] = useState("2.00");

  let targetFixed = 0n;
  try {
    targetFixed = parseTarget(target);
  } catch {
    targetFixed = 0n;
  }
  const targetValid = targetFixed >= MIN_TARGET && targetFixed <= MAX_TARGET;
  const stakeWei = tryParseEth(stake);
  const stakeFormatValid = stakeWei >= MIN_BET;

  const fee = account.fee ?? 0n;
  // Предел по балансу: весь «Счёт казино» минус комиссия Pyth.
  const balanceMax =
    account.total !== undefined && account.fee !== undefined
      ? account.total > fee
        ? account.total - fee
        : 0n
      : undefined;
  // Предел по банку казино: выплата stake·T не может превысить банк → stake ≤ bank·SCALE/(T−SCALE).
  const bankMax =
    account.casinoBank !== undefined && targetValid && targetFixed > TARGET_SCALE
      ? (account.casinoBank * TARGET_SCALE) / (targetFixed - TARGET_SCALE)
      : undefined;

  const maxStake =
    balanceMax !== undefined && bankMax !== undefined
      ? balanceMax < bankMax
        ? balanceMax
        : bankMax
      : (balanceMax ?? bankMax);

  const overBank = bankMax !== undefined && stakeWei > bankMax;
  const affordable =
    !isConnected || balanceMax === undefined || stakeWei <= balanceMax;
  const canAutoFaucet = isConnected && account.faucetClaimed === false;
  const canPlay =
    !busy &&
    targetValid &&
    stakeFormatValid &&
    !overBank &&
    (!isConnected || affordable || canAutoFaucet);

  const chance = targetValid ? winChancePct(targetFixed) : 0;
  const payout =
    targetValid && stakeWei > 0n
      ? formatEth((stakeWei * targetFixed) / TARGET_SCALE)
      : "—";

  function clampToMax(value: bigint): bigint {
    return maxStake !== undefined && maxStake > 0n && value > maxStake
      ? maxStake
      : value;
  }
  function half() {
    if (stakeWei > 0n) setStake(toEthInput(stakeWei / 2n));
  }
  function double() {
    if (stakeWei > 0n) setStake(toEthInput(clampToMax(stakeWei * 2n)));
  }
  function setMax() {
    if (maxStake !== undefined && maxStake > 0n) setStake(toEthInput(maxStake));
  }

  const hint = (() => {
    if (target.trim() && !targetValid)
      return { text: "Множитель от 1.01 до 10000×", danger: true };
    if (stakeWei > 0n && !stakeFormatValid)
      return { text: "Минимальная ставка 0.00001 ETH", danger: true };
    if (overBank && bankMax !== undefined)
      return { text: `Макс. ставка по банку: ${formatEth(bankMax)} ETH`, danger: true };
    if (isConnected && !affordable && !canAutoFaucet)
      return { text: "Не хватает на счёте — пополни в «Кассе»", danger: false };
    if (!isConnected)
      return {
        text: "Вход по email · дадим бесплатный тестовый ETH · без газа",
        danger: false,
      };
    return { text: "", danger: false };
  })();

  return (
    <Card className="w-full gap-0 py-0 lg:w-[360px] lg:shrink-0">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
          <span className="text-xs text-muted-foreground">Счёт казино</span>
          <span className="text-sm font-semibold tabular-nums">
            {formatEth(account.total)} ETH
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stake">Сумма ставки, ETH</Label>
          <div className="flex gap-2">
            <Input
              id="stake"
              inputMode="decimal"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              disabled={busy}
            />
            <Button variant="secondary" className="shrink-0 px-3" disabled={busy} onClick={half}>
              ½
            </Button>
            <Button variant="secondary" className="shrink-0 px-3" disabled={busy} onClick={double}>
              2×
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AMOUNT_CHIPS.map((v) => (
              <Chip key={v} active={stake === v} disabled={busy} onClick={() => setStake(v)}>
                {v}
              </Chip>
            ))}
            <Chip disabled={busy || maxStake === undefined} onClick={setMax}>
              Max
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target">Целевой множитель</Label>
          <div className="relative">
            <Input
              id="target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy}
              className="pr-7"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
              ×
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TARGET_CHIPS.map((v) => (
              <Chip
                key={v}
                active={target === v || target === `${v}.00`}
                disabled={busy}
                onClick={() => setTarget(v)}
              >
                {v}×
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Шанс выигрыша" value={`${chance.toFixed(2)}%`} />
          <Stat label="Выплата" value={`${payout} ETH`} />
        </div>

        <Button
          className="h-12 text-base font-semibold"
          disabled={!canPlay}
          onClick={() => onPlay(targetFixed, stakeWei)}
        >
          {primaryLabel}
        </Button>

        <p
          className={cn(
            "min-h-4 text-xs",
            hint.danger ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hint.text}
        </p>
      </CardContent>
    </Card>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-primary/15 text-primary"
          : "bg-secondary text-muted-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-secondary/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
