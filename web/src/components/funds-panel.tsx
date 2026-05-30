"use client";

import { useState } from "react";
import { prepareContractCall } from "thirdweb";
import { useActiveAccount, useWalletBalance } from "thirdweb/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCasinoReads } from "@/hooks/use-casino";
import { useTx } from "@/hooks/use-tx";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { casino } from "@/lib/contract";
import { formatEth, parseEth, tryParseEth } from "@/lib/format";

const FAUCET_AMOUNT = parseEth("0.005");

/** Панель средств: игровой баланс в контракте + кран → депозит → вывод. */
export function FundsPanel() {
  const account = useActiveAccount();
  const address = account?.address;
  const { send, isPending } = useTx();
  const reads = useCasinoReads(address);
  const wallet = useWalletBalance({ client, chain, address });

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  if (!address) return null;

  const gameBal = reads.gameBalance.data;
  const claimed = reads.faucetClaimed.data;
  const pool = reads.faucetPool.data;
  const walletWei = wallet.data?.value;

  function refresh() {
    reads.refetchAll();
    void wallet.refetch?.();
  }

  function onFaucet() {
    const tx = prepareContractCall({
      contract: casino,
      method: "function claimFaucet()",
      params: [],
    });
    void send(tx, "Кран", refresh);
  }

  function onDeposit() {
    const value = tryParseEth(depositAmount);
    if (value <= 0n) return;
    const tx = prepareContractCall({
      contract: casino,
      method: "function deposit() payable",
      params: [],
      value,
    });
    void send(tx, "Депозит", () => {
      setDepositAmount("");
      refresh();
    });
  }

  function onWithdraw() {
    const value = tryParseEth(withdrawAmount);
    if (value <= 0n) return;
    const tx = prepareContractCall({
      contract: casino,
      method: "function withdraw(uint256)",
      params: [value],
    });
    void send(tx, "Вывод", () => {
      setWithdrawAmount("");
      refresh();
    });
  }

  const depositWei = tryParseEth(depositAmount);
  const withdrawWei = tryParseEth(withdrawAmount);
  const depositInvalid =
    depositWei <= 0n || (walletWei !== undefined && depositWei > walletWei);
  const withdrawInvalid =
    withdrawWei <= 0n || (gameBal !== undefined && withdrawWei > gameBal);

  const faucetLabel =
    claimed === true
      ? "Кран уже использован"
      : pool !== undefined && pool < FAUCET_AMOUNT
        ? "Кран пуст"
        : "Получить 0.005 ETH";
  const faucetDisabled =
    isPending ||
    claimed === true ||
    (pool !== undefined && pool < FAUCET_AMOUNT);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-muted-foreground">Баланс в игре</CardTitle>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums text-primary">
            {formatEth(gameBal)}
          </span>
          <span className="text-sm text-muted-foreground">ETH</span>
        </div>
        <p className="text-xs text-muted-foreground">
          На кошельке: {formatEth(walletWei)} ETH · В кране:{" "}
          {formatEth(pool)} ETH
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Кран */}
        <div className="flex flex-col gap-2">
          <Label>Бесплатный тестовый ETH</Label>
          <Button
            className="h-10"
            disabled={faucetDisabled}
            onClick={onFaucet}
          >
            {faucetLabel}
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Депозит */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="deposit">Внести на игровой баланс</Label>
          <div className="flex gap-2">
            <Input
              id="deposit"
              inputMode="decimal"
              placeholder="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <Button
              className="h-10 shrink-0"
              disabled={isPending || depositInvalid}
              onClick={onDeposit}
            >
              Внести
            </Button>
          </div>
        </div>

        {/* Вывод */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="withdraw">Вывести на кошелёк</Label>
          <div className="flex gap-2">
            <Input
              id="withdraw"
              inputMode="decimal"
              placeholder="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            <Button
              variant="outline"
              className="h-10 shrink-0"
              disabled={isPending || withdrawInvalid}
              onClick={onWithdraw}
            >
              Вывести
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
