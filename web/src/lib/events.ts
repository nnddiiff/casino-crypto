import { getContractEvents, prepareEvent } from "thirdweb";
import { casino } from "./contract";

/** Событие запроса ставки — из него достаём sequenceNumber после tx1. */
export const betPlacedEvent = prepareEvent({
  signature:
    "event BetPlaced(uint64 indexed sequenceNumber, address indexed player, uint256 stake, uint256 target)",
});

/** Событие расчёта ставки — приходит вторым (колбэк Pyth). */
const betSettledEvent = prepareEvent({
  signature:
    "event BetSettled(uint64 indexed sequenceNumber, address indexed player, uint256 resultMultiplier, uint256 target, bool won, uint256 payout)",
});

export type SettledArgs = {
  sequenceNumber: bigint;
  player: string;
  resultMultiplier: bigint;
  target: bigint;
  won: boolean;
  payout: bigint;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ждать колбэк Pyth (BetSettled) по нашему sequenceNumber.
 * Polling getContractEvents от блока ставки + фильтр по seq в JS — надёжнее topic-фильтра по uint64 indexed.
 * Бросает по таймауту: ставку тогда можно вернуть через refundStuckBet (страховка контракта).
 */
export async function waitForSettlement(
  seq: bigint,
  fromBlock: bigint,
  timeoutMs = 120_000,
): Promise<SettledArgs> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = await getContractEvents({
      contract: casino,
      events: [betSettledEvent],
      fromBlock,
    });
    const match = events.find((e) => e.args.sequenceNumber === seq);
    if (match) return match.args as unknown as SettledArgs;
    await sleep(2500);
  }
  throw new Error(
    "Pyth не прислал результат вовремя. Ставку можно вернуть позже (refundStuckBet).",
  );
}
