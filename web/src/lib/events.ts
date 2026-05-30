import { getContractEvents, prepareEvent } from "thirdweb";
import { casino } from "./contract";
import { entropy } from "./entropy";

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

/** Аргументы BetSettled + где он лёг в цепочке (нужно верификатору как точный якорь блока). */
export type SettledResult = SettledArgs & {
  settledTxHash: string;
  settledBlock: bigint;
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
): Promise<SettledResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = await getContractEvents({
      contract: casino,
      events: [betSettledEvent],
      fromBlock,
      useIndexer: false, // прямой RPC: Insight у thirdweb домен-ограничен (на preview-деплоях 401), окно мелкое
    });
    const match = events.find((e) => e.args.sequenceNumber === seq);
    if (match) {
      return {
        ...(match.args as unknown as SettledArgs),
        settledTxHash: match.transactionHash ?? "",
        settledBlock: match.blockNumber ?? fromBlock,
      };
    }
    await sleep(2500);
  }
  throw new Error(
    "Pyth не прислал результат вовремя. Ставку можно вернуть позже (refundStuckBet).",
  );
}

// ============================================================
// Верификатор честности: сырое случайное число из события Pyth + наш записанный исход
// ============================================================

/**
 * Событие Pyth Entropy V2 (сверено on-chain на Base Sepolia: контракт эмитит именно эту форму).
 * seq — indexed (topic3), caller — indexed (topic2), сырое `randomNumber` — первое поле data.
 * Наш BetSettled этого числа не публикует — здесь его независимый источник.
 */
const REVEALED_SIGNATURE =
  "event Revealed(address indexed provider, address indexed caller, uint64 indexed sequenceNumber, bytes32 randomNumber, bytes32 userContribution, bytes32 providerContribution, bool callbackFailed, bytes callbackReturnValue, uint32 callbackGasUsed, bytes extraArgs)";

export type RevealedRecord = {
  randomNumber: `0x${string}`;
  txHash: string;
  blockNumber: bigint;
};

/**
 * Найти Pyth `Revealed` нашего казино по seq в окне [fromBlock; toBlock].
 * useIndexer: false — идём прямо в RPC (индексатор Insight у thirdweb домен-ограничен и в проде падает).
 * Фильтр по caller=наш контракт (indexed) на стороне RPC сужает выдачу до наших ставок; seq матчим в JS.
 */
export async function findRevealed(
  seq: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RevealedRecord | null> {
  const event = prepareEvent({
    signature: REVEALED_SIGNATURE,
    filters: { caller: casino.address as `0x${string}` },
  });
  const logs = await getContractEvents({
    contract: entropy,
    events: [event],
    fromBlock,
    toBlock,
    useIndexer: false,
  });
  const match = logs.find((l) => l.args.sequenceNumber === seq);
  if (!match) return null;
  return {
    randomNumber: match.args.randomNumber as `0x${string}`,
    txHash: match.transactionHash ?? "",
    blockNumber: match.blockNumber ?? toBlock,
  };
}

export type SettledRecord = {
  resultMultiplier: bigint;
  target: bigint;
  won: boolean;
  payout: bigint;
  txHash: string;
};

/** Прочитать наш записанный исход (BetSettled) по seq в конкретном блоке колбэка. */
export async function findSettled(
  seq: bigint,
  block: bigint,
): Promise<SettledRecord | null> {
  const logs = await getContractEvents({
    contract: casino,
    events: [betSettledEvent],
    fromBlock: block,
    toBlock: block,
    useIndexer: false,
  });
  const match = logs.find((l) => l.args.sequenceNumber === seq);
  if (!match) return null;
  return {
    resultMultiplier: match.args.resultMultiplier,
    target: match.args.target,
    won: match.args.won,
    payout: match.args.payout,
    txHash: match.transactionHash ?? "",
  };
}
