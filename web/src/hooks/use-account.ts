"use client";

import { useReadContract, useWalletBalance } from "thirdweb/react";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { casino } from "@/lib/contract";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Единый «Счёт казино» = игровой баланс в контракте (G) + нативный ETH на смарт-аккаунте (W).
 *
 * Для игрока это ОДИН баланс: и тем, и другим он играет (W доносится в игру автоматически на ставку)
 * и выводит наружу. Разделение G/W — плумбинг провабли-фейр (средства обязаны лежать в контракте между
 * запросом и колбэком Pyth), пользователю он не показывается. Чтения по адресу включаются только после входа.
 */
export function useAccount(address?: string) {
  const game = useReadContract({
    contract: casino,
    method: "function balances(address) view returns (uint256)",
    params: [address ?? ZERO],
    queryOptions: { enabled: !!address, refetchInterval: 8000 },
  });

  // W (нативный ETH смарт-аккаунта) поллим тем же интервалом, что и G, — иначе внешнее пополнение
  // (перевод из MetaMask на адрес счёта) не видно без перезагрузки. enabled — чтения только после входа.
  const wallet = useWalletBalance(
    { client, chain, address },
    { enabled: !!address, refetchInterval: 8000 },
  );

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

  const entropyFee = useReadContract({
    contract: casino,
    method: "function entropyFee() view returns (uint256)",
    params: [],
  });

  const casinoBank = useReadContract({
    contract: casino,
    method: "function casinoBank() view returns (uint256)",
    params: [],
    queryOptions: { refetchInterval: 12_000 },
  });

  const gameBalance = game.data;
  const walletBalance = wallet.data?.value;
  const total =
    gameBalance !== undefined && walletBalance !== undefined
      ? gameBalance + walletBalance
      : undefined;

  function refetchAll() {
    void game.refetch();
    void wallet.refetch?.();
    void faucetClaimed.refetch();
    void faucetPool.refetch();
  }

  return {
    gameBalance,
    walletBalance,
    total,
    faucetClaimed: faucetClaimed.data,
    faucetPool: faucetPool.data,
    entropyFee: entropyFee.data,
    casinoBank: casinoBank.data,
    refetchAll,
  };
}
