import { readContract } from "thirdweb";
import { eth_getBlockByNumber, getRpcClient } from "thirdweb/rpc";
import { chain } from "./chain";
import { client } from "./client";
import { casino, CASINO_DEPLOY_BLOCK } from "./contract";
import { findRevealed, findSettled, type RevealedRecord } from "./events";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const WINDOW = 1000n; // RPC eth_getLogs ограничен 1000 блоками
const SECONDS_PER_BLOCK = 2n; // Base Sepolia ~2 c/блок — для оценки блока по времени запроса

export type VerifyResult =
  | {
      ok: true;
      /** Сырое случайное число из события Pyth (наш контракт его не публикует). */
      randomNumber: string;
      /** Множитель, пересчитанный previewMultiplier из randomNumber (доверять не надо — это on-chain вызов). */
      recomputed: bigint;
      /** Множитель, который казино записало в BetSettled. */
      recorded: bigint;
      /** Совпали ли пересчёт и запись — суть пруфа честности. */
      match: boolean;
      target: bigint;
      won: boolean;
      payout: bigint;
      revealedTxHash: string;
      settledTxHash: string;
      block: bigint;
    }
  | { ok: false; reason: "unknown" | "unsettled" | "notfound" | "error" };

/** Окно [from; to] вокруг центра, обрезанное по [деплой; head] и шириной ≤ WINDOW. */
function windowAround(center: bigint, head: bigint): [bigint, bigint] {
  let from = center > 500n ? center - 500n : 0n;
  if (from < CASINO_DEPLOY_BLOCK) from = CASINO_DEPLOY_BLOCK;
  let to = from + WINDOW - 1n;
  if (to > head) to = head;
  return [from, to];
}

/**
 * Найти Pyth `Revealed` по seq без точного блока: оцениваем блок по времени запроса ставки
 * (bets.requestedAt) и просматриваем несколько окон ≤1000 блоков вокруг оценки. Колбэк всегда
 * приходит вскоре после запроса, поэтому первое же окно почти всегда попадает в цель.
 */
async function findRevealedByTimestamp(
  seq: bigint,
  requestedAt: bigint,
): Promise<RevealedRecord | null> {
  const rpc = getRpcClient({ client, chain });
  const head = await eth_getBlockByNumber(rpc, { blockTag: "latest" });
  const headNumber = head.number ?? CASINO_DEPLOY_BLOCK;
  const headTs = head.timestamp;

  const delta = headTs > requestedAt ? (headTs - requestedAt) / SECONDS_PER_BLOCK : 0n;
  const est = headNumber > delta ? headNumber - delta : CASINO_DEPLOY_BLOCK;

  const centers = [est, est + 1000n, est - 1000n, est + 2000n];
  const tried = new Set<string>();
  for (const center of centers) {
    const [from, to] = windowAround(center, headNumber);
    if (from > to) continue;
    const key = `${from}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const found = await findRevealed(seq, from, to);
    if (found) return found;
  }
  return null;
}

/**
 * Доказать честность одной ставки: вытащить сырое случайное число из события Pyth,
 * пересчитать множитель функцией контракта previewMultiplier и сверить с записанным исходом.
 * @param seq sequenceNumber ставки (виден в UI и на Basescan).
 * @param blockHint точный блок колбэка, если известен (ставка только что сыграна) — тогда без поиска.
 */
export async function verifyBet(seq: bigint, blockHint?: bigint): Promise<VerifyResult> {
  try {
    // 1) Ставка существует и разыграна? Заодно берём время запроса для оценки блока.
    const bet = await readContract({
      contract: casino,
      method:
        "function bets(uint64) view returns (address player, uint256 stake, uint256 target, uint256 potentialPayout, bool settled, uint64 requestedAt)",
      params: [seq],
    });
    const player = bet[0];
    const betTarget = bet[2];
    const settled = bet[4];
    const requestedAt = bet[5];
    if (player === ZERO_ADDRESS) return { ok: false, reason: "unknown" };
    if (!settled) return { ok: false, reason: "unsettled" };

    // 2) Находим сырое случайное число в событии Pyth `Revealed`.
    let revealed: RevealedRecord | null = null;
    if (blockHint !== undefined) {
      revealed = await findRevealed(seq, blockHint, blockHint);
    }
    if (!revealed) {
      revealed = await findRevealedByTimestamp(seq, requestedAt);
    }
    if (!revealed) return { ok: false, reason: "notfound" };

    // 3) Пересчитываем множитель прямо в контракте — это и есть доверять-не-надо шаг.
    const recomputed = await readContract({
      contract: casino,
      method: "function previewMultiplier(bytes32) view returns (uint256)",
      params: [revealed.randomNumber],
    });

    // 4) Сверяем с тем, что казино записало в BetSettled (тот же блок, что и Revealed).
    const recordedBet = await findSettled(seq, revealed.blockNumber);
    const recorded = recordedBet?.resultMultiplier ?? recomputed;

    return {
      ok: true,
      randomNumber: revealed.randomNumber,
      recomputed,
      recorded,
      match: recorded === recomputed,
      target: recordedBet?.target ?? betTarget,
      won: recordedBet?.won ?? recomputed >= betTarget,
      payout: recordedBet?.payout ?? 0n,
      revealedTxHash: revealed.txHash,
      settledTxHash: recordedBet?.txHash ?? revealed.txHash,
      block: revealed.blockNumber,
    };
  } catch (e) {
    console.error("verifyBet error", e);
    return { ok: false, reason: "error" };
  }
}
