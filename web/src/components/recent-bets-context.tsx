"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type RecentBet, useRecentBets } from "@/hooks/use-recent-bets";

type RecentBetsValue = {
  bets: RecentBet[];
  prepend: (bet: RecentBet) => void;
  reload: () => void;
};

const RecentBetsContext = createContext<RecentBetsValue | null>(null);

/** Один опрос ленты ставок на всё приложение — питает и стрип над множителем, и таблицу на витрине. */
export function RecentBetsProvider({ children }: { children: ReactNode }) {
  const value = useRecentBets(15);
  return (
    <RecentBetsContext.Provider value={value}>
      {children}
    </RecentBetsContext.Provider>
  );
}

export function useRecentBetsContext() {
  const ctx = useContext(RecentBetsContext);
  if (!ctx) throw new Error("useRecentBetsContext вне RecentBetsProvider");
  return ctx;
}
