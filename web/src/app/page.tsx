"use client";

import { Cashier } from "@/components/cashier";
import { GameScreen } from "@/components/game/game-screen";
import { Header } from "@/components/header";
import { LastBetProvider } from "@/components/last-bet-context";
import { RecentBetsProvider } from "@/components/recent-bets-context";
import { Showcase } from "@/components/showcase";
import { SiteFooter } from "@/components/site-footer";

/** Игра видна сразу, без стены «подключи кошелёк»: экран → касса → витрина честности. */
export default function Home() {
  return (
    <LastBetProvider>
      <RecentBetsProvider>
        <Header />
        <main className="flex flex-1 flex-col items-center gap-8 px-3 py-6 sm:px-4 sm:py-10">
          <GameScreen />
          <Cashier />
          <Showcase />
        </main>
        <SiteFooter />
      </RecentBetsProvider>
    </LastBetProvider>
  );
}
