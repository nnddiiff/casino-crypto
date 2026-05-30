"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

/** Последняя разыгранная в этой сессии ставка: seq + точный блок колбэка (якорь для верификатора). */
export type LastBet = { seq: bigint; block: bigint } | null;

type LastBetContextValue = {
  lastBet: LastBet;
  setLastBet: (bet: LastBet) => void;
};

const LastBetContext = createContext<LastBetContextValue | null>(null);

export function LastBetProvider({ children }: { children: ReactNode }) {
  const [lastBet, setLastBet] = useState<LastBet>(null);
  const value = useMemo(() => ({ lastBet, setLastBet }), [lastBet]);
  return <LastBetContext.Provider value={value}>{children}</LastBetContext.Provider>;
}

export function useLastBet() {
  const ctx = useContext(LastBetContext);
  if (!ctx) throw new Error("useLastBet вне LastBetProvider");
  return ctx;
}
