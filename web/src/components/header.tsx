"use client";

import { useActiveAccount, useWalletBalance } from "thirdweb/react";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { ConnectWallet } from "./connect-wallet";

/** Шапка: логотип + баланс кошелька (нативный ETH) + кнопка подключения. */
export function Header() {
  const account = useActiveAccount();
  const { data: balance } = useWalletBalance({
    client,
    chain,
    address: account?.address,
  });

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="text-primary">◆</span>
        <span className="text-lg">LIMBO</span>
      </div>
      <div className="flex items-center gap-3">
        {account && balance ? (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {Number(balance.displayValue).toFixed(4)} {balance.symbol}
          </span>
        ) : null}
        <ConnectWallet />
      </div>
    </header>
  );
}
