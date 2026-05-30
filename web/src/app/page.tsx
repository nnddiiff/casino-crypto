"use client";

import { useActiveAccount } from "thirdweb/react";
import { AuditDashboard } from "@/components/audit-dashboard";
import { FundsPanel } from "@/components/funds-panel";
import { LimboGame } from "@/components/game/limbo-game";
import { Header } from "@/components/header";

export default function Home() {
  const account = useActiveAccount();

  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center gap-10 px-4 py-10">
        {account ? (
          <div className="flex w-full max-w-4xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
            <LimboGame />
            <FundsPanel />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 pt-6 text-center">
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="text-primary">Limbo</span> — честное казино on-chain
            </h1>
            <p className="max-w-md text-pretty text-muted-foreground">
              Задай множитель, поставь тестовый ETH — исход решает Pyth Entropy.
              Вся логика и выплаты проверяемы на Basescan.
            </p>
            <p className="text-sm text-muted-foreground">
              Подключи кошелёк, чтобы начать.
            </p>
          </div>
        )}

        <AuditDashboard />
      </main>
    </>
  );
}
