import { getContractEvents, prepareEvent } from "thirdweb";
import { eth_blockNumber, getRpcClient } from "thirdweb/rpc";
import { chain } from "./chain";
import { client } from "./client";
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
 * Один опрос BetSettled по seq в окне ≤1000 блоков у головы цепи (предел RPC eth_getLogs).
 * Окно скользит к голове: колбэк приходит за секунды (попадает в первое же окно у блока ставки),
 * а на длинной дистанции зависшей ставки искать нечего. Ошибки RPC глушим → null (опрос продолжится).
 */
export async function findSettledBySeq(
  seq: bigint,
  fromBlock: bigint,
): Promise<SettledResult | null> {
  try {
    const rpc = getRpcClient({ client, chain });
    const head = await eth_blockNumber(rpc);
    const from = head - fromBlock > 999n ? head - 999n : fromBlock;
    const events = await getContractEvents({
      contract: casino,
      events: [betSettledEvent],
      fromBlock: from,
      toBlock: head,
      useIndexer: false, // прямой RPC: Insight у thirdweb домен-ограничен (на боевом домене 401)
    });
    const match = events.find((e) => e.args.sequenceNumber === seq);
    if (!match) return null;
    return {
      ...(match.args as unknown as SettledArgs),
      settledTxHash: match.transactionHash ?? "",
      settledBlock: match.blockNumber ?? fromBlock,
    };
  } catch {
    return null; // транзиентная ошибка RPC — следующий опрос повторит
  }
}

export type WaitOptions = {
  /** Вызывается ОДИН раз, когда ожидание превысило мягкий порог (ставка идёт дольше обычного). */
  onSlow?: () => void;
  slowAfterMs?: number;
  pollMs?: number;
  slowPollMs?: number;
  signal?: AbortSignal;
};

/**
 * Ждать колбэк Pyth (BetSettled) по нашему sequenceNumber. Опрос идёт до результата или до отмены
 * (`signal`) — хард-таймаута НЕТ: зависшую ставку возвращают через refundStuckBet, а не молчаливым
 * сбросом в «1.00». `onSlow` срабатывает один раз после мягкого порога — UI переходит в «идёт дольше
 * обычного» (seq + ссылка + «Обновить»), но фоновый опрос продолжается и подхватит результат сам.
 */
export async function waitForSettlement(
  seq: bigint,
  fromBlock: bigint,
  opts: WaitOptions = {},
): Promise<SettledResult | null> {
  const { onSlow, slowAfterMs = 45_000, pollMs = 2500, slowPollMs = 6000, signal } = opts;
  const start = Date.now();
  let slowFired = false;
  while (!signal?.aborted) {
    const found = await findSettledBySeq(seq, fromBlock);
    if (found) return found;
    if (!slowFired && Date.now() - start >= slowAfterMs) {
      slowFired = true;
      onSlow?.();
    }
    if (signal?.aborted) break;
    await sleep(slowFired ? slowPollMs : pollMs);
  }
  return null; // отменено (reset/refund/размонтирование)
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
