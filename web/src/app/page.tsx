"use client";

import { useEffect, useState } from "react";
import { GameScreen } from "@/components/game/game-screen";
import { Header } from "@/components/header";
import { LastBetProvider } from "@/components/last-bet-context";
import { RecentBetsProvider } from "@/components/recent-bets-context";
import { Showcase } from "@/components/showcase";
import { SiteFooter } from "@/components/site-footer";

/** Лёгкая заставка на время монтирования — рендерится одинаково на сервере и на первом клиенте. */
function BootScreen() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-lg text-primary">◆</span>
        <span className="text-sm">Загружаем LIMBO…</span>
      </div>
    </div>
  );
}

/**
 * Игра видна сразу, без стены «подключи кошелёк»: экран → касса → витрина честности.
 *
 * Весь интерфейс зависит от состояния кошелька (web3-хуки), поэтому рендерим его только после
 * монтирования: серверный HTML и первый клиентский рендер совпадают (заставка) — гидратация без
 * рассинхронизации (React #418), затем показываем приложение клиентом. Стандартный паттерн dApp.
 */
export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <BootScreen />;

  return (
    <LastBetProvider>
      <RecentBetsProvider>
        <Header />
        <main className="flex flex-1 flex-col items-center gap-8 px-3 py-6 sm:px-4 sm:py-10">
          <GameScreen />
          <Showcase />
        </main>
        <SiteFooter />
      </RecentBetsProvider>
    </LastBetProvider>
  );
}
