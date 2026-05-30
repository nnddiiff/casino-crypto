"use client";

import { useState } from "react";
import { verifyBet, type VerifyResult } from "@/lib/verify";

export type VerifyPhase = "idle" | "checking" | "done";

/** Машина состояний верификатора честности: idle → checking → done (result). */
export function useVerify() {
  const [phase, setPhase] = useState<VerifyPhase>("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function run(seq: bigint, blockHint?: bigint) {
    setPhase("checking");
    setResult(null);
    const r = await verifyBet(seq, blockHint);
    setResult(r);
    setPhase("done");
  }

  function reset() {
    setPhase("idle");
    setResult(null);
  }

  return { phase, result, run, reset };
}
