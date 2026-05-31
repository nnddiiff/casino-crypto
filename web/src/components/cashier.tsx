"use client";

import { useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { isAddress } from "thirdweb/utils";
import { toast } from "sonner";
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
 * Касса: пополнение (бесплатный кран ИЛИ перевод со своего кошелька на адрес счёта) и вывод
 * на внешний адрес. Депозит из кошелька в игру происходит автоматически на ставку — здесь его нет.
 * Пополнение «со своего кошелька»: показываем адрес смарт-аккаунта, игрок сам шлёт на него тестовый
 * ETH из MetaMask/биржи (нативный перевод → зачисляется на «Счёт казино»). Это закрывает букву брифа
 * «внести своим кошельком» без подключения внешнего кошелька к сайту.
 */
export function Cashier() {
  const active = useActiveAccount();
  const reads = useAccount(active?.address);
  const { send, isPending } = useSend();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const connected = !!active;
  const address = active?.address;
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

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать адрес");
    }
  }

  const amountWei = tryParseEth(amount);
  const withdrawInvalid =
    !connected ||
    !isAddress(to) ||
    amountWei <= 0n ||
    total === undefined ||
    amountWei > total;

  const faucetLabel = !connected
    ? "Бесплатный ETH · 0.005"
    : reads.faucetClaimed === true
      ? "Бесплатный ETH уже получен"
      : reads.faucetPool !== undefined && reads.faucetPool < FAUCET_AMOUNT
        ? "Кран пуст"
        : "Получить бесплатно · 0.005 ETH";
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
            ? "Пополняй счёт бесплатным краном или переводом со своего кошелька, выводи на любой свой адрес."
            : "Войди по email, чтобы пополнить «Счёт казино» и выводить средства на свой кошелёк."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        {/* Пополнение */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Пополнить бесплатно (кран)</Label>
            <Button className="h-10" disabled={faucetDisabled} onClick={onFaucet}>
              {faucetLabel}
            </Button>
            <p className="text-xs text-muted-foreground">
              Тестовый ETH из крана. Один раз на аккаунт.
            </p>
          </div>

          <div className="h-px bg-border" />

          <div className="flex flex-col gap-2">
            <Label>Пополнить со своего кошелька</Label>
            {connected && address ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <span className="flex-1 truncate font-mono text-xs" title={address}>
                    {address}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={copyAddress}
                  >
                    {copied ? "Скопировано" : "Копировать"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Отправь на этот адрес тестовый ETH сети Base Sepolia из MetaMask или с биржи —
                  зачислится на твой «Счёт казино».
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Войди, чтобы увидеть адрес для пополнения.
              </p>
            )}
          </div>
        </div>

        {/* Вывод */}
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
