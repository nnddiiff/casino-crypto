"use client";

import { useActiveAccount } from "thirdweb/react";
import { FundsPanel } from "@/components/funds-panel";
import { Header } from "@/components/header";

export default function Home() {
  const account = useActiveAccount();

  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="text-primary">Limbo</span> — честное казино on-chain
          </h1>
          <p className="max-w-md text-pretty text-muted-foreground">
            Задай множитель, поставь тестовый ETH — исход решает Pyth Entropy.
            Вся логика и выплаты проверяемы на Basescan.
          </p>
        </div>
        {account ? (
          <FundsPanel />
        ) : (
          <p className="text-sm text-muted-foreground">
            Подключи кошелёк, чтобы начать.
          </p>
        )}
      </main>
    </>
  );
}
