"use client";

import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/hooks/use-account";
import { formatEth } from "@/lib/format";
import { ConnectWallet } from "./connect-wallet";

/** Шапка: логотип + единый «Счёт казино» (после входа) + кнопка входа/аккаунта. */
export function Header() {
  const active = useActiveAccount();
  const reads = useAccount(active?.address);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="text-primary">◆</span>
        <span className="text-lg">LIMBO</span>
        <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
          · честное казино on-chain
        </span>
      </div>
      <div className="flex items-center gap-3">
        {active ? (
          <div className="hidden flex-col items-end leading-tight sm:flex">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Счёт казино
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatEth(reads.total)} ETH
            </span>
          </div>
        ) : null}
        <ConnectWallet />
      </div>
    </header>
  );
}
