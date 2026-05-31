"use client";

import { useCallback, useEffect, useState } from "react";
import { getContractEvents, prepareEvent } from "thirdweb";
import { eth_blockNumber, getRpcClient } from "thirdweb/rpc";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { casino } from "@/lib/contract";

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

const WINDOW = 1000n; // RPC eth_getLogs ограничен 1000 блоками
const MAX_WINDOWS = 3; // ~3000 блоков ≈ 100 мин истории — пока не наберём limit

/**
 * Лента последних расчётов (`BetSettled`) прямо из RPC (useIndexer:false — Insight домен-ограничен).
 * Сканируем несколько окон ≤1000 блоков от головы цепочки. Источник «прозрачности»: каждую ставку
 * видно on-chain. Оптимистичный `prepend` подставляет только что сыгранную ставку до следующего опроса.
 */
export function useRecentBets(limit = 12) {
  const [bets, setBets] = useState<RecentBet[]>([]);

  const load = useCallback(async () => {
    try {
      const rpc = getRpcClient({ client, chain });
      const head = await eth_blockNumber(rpc);
      const collected: RecentBet[] = [];

      for (let i = 0; i < MAX_WINDOWS; i++) {
        const to = head - BigInt(i) * WINDOW;
        const from = to >= WINDOW ? to - WINDOW + 1n : 0n;
        if (from > to) break;
        const logs = await getContractEvents({
          contract: casino,
          events: [betSettledEvent],
          fromBlock: from,
          toBlock: to,
          useIndexer: false,
        });
        for (const l of logs) {
          collected.push({
            seq: l.args.sequenceNumber,
            player: l.args.player,
            resultMultiplier: l.args.resultMultiplier,
            target: l.args.target,
            won: l.args.won,
            payout: l.args.payout,
            txHash: l.transactionHash ?? "",
            block: l.blockNumber ?? to,
          });
        }
        if (collected.length >= limit) break;
      }

      setBets(dedupeSorted(collected, limit));
    } catch {
      // RPC шумит (лимит окна / 401 Insight) — оставляем прежнюю ленту
    }
  }, [limit]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  const prepend = useCallback(
    (bet: RecentBet) => {
      setBets((prev) => dedupeSorted([bet, ...prev], limit));
    },
    [limit],
  );

  return { bets, reload: load, prepend };
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
