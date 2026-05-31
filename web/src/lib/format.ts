import { toEther, toWei } from "thirdweb/utils";

/** wei (bigint) → строка ETH с фиксированным числом знаков. undefined → прочерк. */
export function formatEth(wei: bigint | undefined, digits = 4): string {
  if (wei === undefined) return "—";
  return Number(toEther(wei)).toFixed(digits);
}

/** Строка ETH ("0.01") → wei (bigint). Бросает при некорректном вводе — вызывающий оборачивает в try/catch. */
export function parseEth(value: string): bigint {
  return toWei(value.trim());
}

/** Безопасный парс: возвращает 0n, если строка пустая или невалидная. */
export function tryParseEth(value: string): bigint {
  if (!value.trim()) return 0n;
  try {
    return toWei(value.trim());
  } catch {
    return 0n;
  }
}

/** wei → строка ETH без округления — для подстановки в поле ввода (кнопки ½ / 2×). */
export function toEthInput(wei: bigint): string {
  return toEther(wei);
}

/** Короткое сообщение из ошибки кошелька/RPC (обрезаем длинные хвосты). */
export function errMessage(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    return m.length > 140 ? `${m.slice(0, 140)}…` : m;
  }
  return "Неизвестная ошибка";
}

// --- Множитель Limbo (фикс. точка ×1e6, как в контракте) ---
export const TARGET_SCALE = 1_000_000n;
export const MIN_TARGET = 1_010_000n; // 1.01×
export const MAX_TARGET = 10_000_000_000n; // 10000×

/** "2.47" (или "2,47") → 2_470_000n. Бросает при некорректном вводе. */
export function parseTarget(value: string): bigint {
  const n = Number(value.replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Некорректный множитель");
  return BigInt(Math.round(n * 1_000_000));
}

/** 2_470_000n → "2.47". */
export function formatMultiplier(fixed: bigint | undefined, digits = 2): string {
  if (fixed === undefined) return "—";
  return (Number(fixed) / 1_000_000).toFixed(digits);
}

/** Шанс выигрыша в % = RTP / T (RTP = 0.99). target в фикс. точке ×1e6. */
export function winChancePct(targetFixed: bigint): number {
  if (targetFixed <= 0n) return 0;
  return (0.99 / (Number(targetFixed) / 1_000_000)) * 100;
}

/** Базисные пункты (bigint) → строка процентов: 100n → "1.00". */
export function formatBps(bps: bigint | undefined): string {
  if (bps === undefined) return "—";
  return (Number(bps) / 100).toFixed(2);
}
