"use client";

import { useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { isAddress } from "thirdweb/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/use-account";
import { useSend } from "@/hooks/use-send";
import { FAUCET_AMOUNT } from "@/lib/constants";
import { formatEth, tryParseEth } from "@/lib/format";
import { buildWithdrawBatch, claimFaucetTx } from "@/lib/funding";

/**
 * Касса: пополнение счёта (бесплатный кран) и вывод на внешний адрес. Депозит из кошелька в игру
 * происходит автоматически на ставку, поэтому в кассе его нет — для игрока это один «Счёт казино».
 */
export function Cashier() {
  const active = useActiveAccount();
  const reads = useAccount(active?.address);
  const { send, isPending } = useSend();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const connected = !!active;
  const total = reads.total;
  const walletBal = reads.walletBalance;

  function refresh() {
    reads.refetchAll();
  }

  function onFaucet() {
    void send([claimFaucetTx()], "Пополнение", refresh);
  }

  function onWithdraw() {
    const value = tryParseEth(amount);
    if (value <= 0n || !isAddress(to) || walletBal === undefined) return;
    void send(buildWithdrawBatch(walletBal, value, to), "Вывод", () => {
      setAmount("");
      setTo("");
      refresh();
    });
  }

  const amountWei = tryParseEth(amount);
  const withdrawInvalid =
    !connected ||
    !isAddress(to) ||
    amountWei <= 0n ||
    total === undefined ||
    amountWei > total;

  const faucetLabel = !connected
    ? "Пополнить счёт · 0.005 ETH"
    : reads.faucetClaimed === true
      ? "Бесплатный ETH уже получен"
      : reads.faucetPool !== undefined && reads.faucetPool < FAUCET_AMOUNT
        ? "Кран пуст"
        : "Пополнить счёт · 0.005 ETH бесплатно";
  const faucetDisabled =
    !connected ||
    isPending ||
    reads.faucetClaimed === true ||
    (reads.faucetPool !== undefined && reads.faucetPool < FAUCET_AMOUNT);

  return (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle>Касса</CardTitle>
        <p className="text-xs text-muted-foreground">
          {connected
            ? "Пополняй счёт бесплатным тестовым ETH и выводи на любой свой адрес — газ оплачивает казино."
            : "Войди по email, чтобы пополнить «Счёт казино» и выводить средства на свой кошелёк."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Пополнить счёт</Label>
          <Button className="h-10" disabled={faucetDisabled} onClick={onFaucet}>
            {faucetLabel}
          </Button>
          <p className="text-xs text-muted-foreground">
            Бесплатный тестовый ETH из крана. Один раз на аккаунт.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="wd-to">Вывести на свой кошелёк</Label>
          <Input
            id="wd-to"
            placeholder="0x… адрес MetaMask или биржи"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={!connected}
          />
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              placeholder="0.005"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!connected}
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
          <p className="text-xs text-muted-foreground">
            {connected
              ? `Отправим тестовый ETH на твой адрес. Доступно: ${formatEth(total)} ETH.`
              : "Вывод доступен после входа."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
