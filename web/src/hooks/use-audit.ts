"use client";

import { useReadContract } from "thirdweb/react";
import { casino } from "@/lib/contract";

const live = { queryOptions: { refetchInterval: 30_000 } } as const;

/**
 * Публичные метрики казино для дашборда самоаудита. Все читаются on-chain без кошелька —
 * дашборд виден и до подключения (скептик проверяет честность сразу).
 */
export function useAuditReads() {
  const houseEdgeBps = useReadContract({
    contract: casino,
    method: "function houseEdgeBps() view returns (uint256)",
    params: [],
  });
  const hold = useReadContract({
    contract: casino,
    method: "function holdBps() view returns (bool, uint256)",
    params: [],
    ...live,
  });
  const totalWagered = useReadContract({
    contract: casino,
    method: "function totalWagered() view returns (uint256)",
    params: [],
    ...live,
  });
  const totalPaidOut = useReadContract({
    contract: casino,
    method: "function totalPaidOut() view returns (uint256)",
    params: [],
    ...live,
  });
  const betsTotal = useReadContract({
    contract: casino,
    method: "function betsTotal() view returns (uint256)",
    params: [],
    ...live,
  });
  const betsWon = useReadContract({
    contract: casino,
    method: "function betsWon() view returns (uint256)",
    params: [],
    ...live,
  });
  const casinoBank = useReadContract({
    contract: casino,
    method: "function casinoBank() view returns (uint256)",
    params: [],
    ...live,
  });
  const locked = useReadContract({
    contract: casino,
    method: "function locked() view returns (uint256)",
    params: [],
    ...live,
  });

  return {
    houseEdgeBps,
    hold,
    totalWagered,
    totalPaidOut,
    betsTotal,
    betsWon,
    casinoBank,
    locked,
  };
}
