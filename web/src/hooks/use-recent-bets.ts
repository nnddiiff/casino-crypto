"use client";

import { useCallback, useEffect, useState } from "react";
import { getContractEvents, prepareEvent } from "thirdweb";
import { eth_blockNumber, getRpcClient } from "thirdweb/rpc";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { casino, CASINO_DEPLOY_BLOCK } from "@/lib/contract";

const betSettledEvent = prepareEvent({
  signature:
    "event BetSettled(uint64 indexed sequenceNumber, address indexed player, uint256 resultMultiplier, uint256 target, bool won, uint256 payout)",
});

export type RecentBet = {
  seq: bigint;
  player: string;
  resultMultiplier: bigint;
  target: bigint;
  won: boolean;
  payout: bigint;
  txHash: string;
  block: bigint;
};

const WINDOW = 1000n; // RPC eth_getLogs ограничен 1000 блоками на запрос
const MAX_WINDOWS = 80; // предохранитель: ~80k блоков от головы (покрывает всю историю хакатона)
const CHUNK = 8; // окон в одном параллельном заходе

async function fetchWindow(from: bigint, to: bigint): Promise<RecentBet[]> {
  const logs = await getContractEvents({
    contract: casino,
    events: [betSettledEvent],
    fromBlock: from,
    toBlock: to,
    useIndexer: false, // прямой RPC: Insight у thirdweb домен-ограничен
  });
  return logs.map((l) => ({
    seq: l.args.sequenceNumber,
    player: l.args.player,
    resultMultiplier: l.args.resultMultiplier,
    target: l.args.target,
    won: l.args.won,
    payout: l.args.payout,
    txHash: l.transactionHash ?? "",
    block: l.blockNumber ?? to,
  }));
}

/** Окна [from; to] от головы цепи назад к блоку деплоя, каждое шириной ≤ WINDOW. */
function windowsBack(head: bigint): Array<[bigint, bigint]> {
  const ranges: Array<[bigint, bigint]> = [];
  let to = head;
  for (let i = 0; i < MAX_WINDOWS && to >= CASINO_DEPLOY_BLOCK; i++) {
    const from =
      to >= CASINO_DEPLOY_BLOCK + WINDOW ? to - WINDOW + 1n : CASINO_DEPLOY_BLOCK;
    ranges.push([from, to]);
    if (from <= CASINO_DEPLOY_BLOCK) break;
    to = from - 1n;
  }
  return ranges;
}

function dedupeSorted(list: RecentBet[], limit: number): RecentBet[] {
  const map = new Map<string, RecentBet>();
  for (const b of list) {
    const key = b.seq.toString();
    if (!map.has(key)) map.set(key, b);
  }
  return [...map.values()]
    .sort((a, b) => (a.block < b.block ? 1 : a.block > b.block ? -1 : 0))
    .slice(0, limit);
}

/**
 * Лента последних расчётов (`BetSettled`) прямо из RPC. Глубокий скан окнами назад к блоку деплоя
 * (исторические ставки не выпадают из ленты), с ранним выходом, как только набрали `limit`. Дальше —
 * лёгкий опрос свежего окна для новых ставок. Пусто только если ставок нет за всю историю.
 */
export function useRecentBets(limit = 12) {
  const [bets, setBets] = useState<RecentBet[]>([]);

  const loadDeep = useCallback(async () => {
    try {
      const rpc = getRpcClient({ client, chain });
      const head = await eth_blockNumber(rpc);
      const ranges = windowsBack(head);
      const collected: RecentBet[] = [];
      for (let i = 0; i < ranges.length; i += CHUNK) {
        const chunk = ranges.slice(i, i + CHUNK);
        const res = await Promise.all(
          chunk.map(([f, t]) => fetchWindow(f, t).catch(() => [] as RecentBet[])),
        );
        for (const r of res) collected.push(...r);
        if (dedupeSorted(collected, limit).length >= limit) break; // набрали свежие N — дальше не копаем
      }
      setBets(dedupeSorted(collected, limit));
    } catch {
      // RPC шумит — оставляем прежнюю ленту
    }
  }, [limit]);

  const pollRecent = useCallback(async () => {
    try {
      const rpc = getRpcClient({ client, chain });
      const head = await eth_blockNumber(rpc);
      const from = head >= WINDOW ? head - WINDOW + 1n : CASINO_DEPLOY_BLOCK;
      const fresh = await fetchWindow(from, head);
      if (fresh.length) {
        setBets((prev) => dedupeSorted([...fresh, ...prev], limit));
      }
    } catch {
      // тихо
    }
  }, [limit]);

  useEffect(() => {
    void loadDeep();
    const id = setInterval(() => void pollRecent(), 30_000);
    return () => clearInterval(id);
  }, [loadDeep, pollRecent]);

  const prepend = useCallback(
    (bet: RecentBet) => {
      setBets((prev) => dedupeSorted([bet, ...prev], limit));
    },
    [limit],
  );

  return { bets, reload: loadDeep, prepend };
}
