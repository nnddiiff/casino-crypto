"use client";

import { useReadContract } from "thirdweb/react";
import { casino } from "@/lib/contract";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Реактивные чтения состояния контракта. Полные сигнатуры методов —
 * не зависят от вывода типов из большого ABI. Запросы по адресу включаются только при подключённом кошельке.
 */
export function useCasinoReads(address?: string) {
  const gameBalance = useReadContract({
    contract: casino,
    method: "function balances(address) view returns (uint256)",
    params: [address ?? ZERO],
    queryOptions: { enabled: !!address, refetchInterval: 8000 },
  });

  const faucetClaimed = useReadContract({
    contract: casino,
    method: "function faucetClaimed(address) view returns (bool)",
    params: [address ?? ZERO],
    queryOptions: { enabled: !!address },
  });

  const faucetPool = useReadContract({
    contract: casino,
    method: "function faucetPool() view returns (uint256)",
    params: [],
  });

  const casinoBank = useReadContract({
    contract: casino,
    method: "function casinoBank() view returns (uint256)",
    params: [],
  });

  const entropyFee = useReadContract({
    contract: casino,
    method: "function entropyFee() view returns (uint256)",
    params: [],
  });

  function refetchAll() {
    void gameBalance.refetch();
    void faucetClaimed.refetch();
    void faucetPool.refetch();
    void casinoBank.refetch();
  }

  return { gameBalance, faucetClaimed, faucetPool, casinoBank, entropyFee, refetchAll };
}
