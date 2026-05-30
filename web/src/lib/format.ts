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

/** Короткое сообщение из ошибки кошелька/RPC (обрезаем длинные хвосты). */
export function errMessage(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    return m.length > 140 ? `${m.slice(0, 140)}…` : m;
  }
  return "Неизвестная ошибка";
}
