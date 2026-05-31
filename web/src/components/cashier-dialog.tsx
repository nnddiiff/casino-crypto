"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import { isAddress } from "thirdweb/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/hooks/use-account";
import { useSend } from "@/hooks/use-send";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { FAUCET_AMOUNT } from "@/lib/constants";
import { formatEth, tryParseEth } from "@/lib/format";
import { buildWithdrawBatch, claimFaucetTx } from "@/lib/funding";
import { accountAbstraction, wallets } from "@/lib/wallet";

function CardGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 9.5h19" />
    </svg>
  );
}

/**
 * Триггер «Касса» в шапке + модалка со вкладками «Пополнить | Вывести».
 * До входа кнопка ведёт на email-вход (useConnectModal), после — открывает кассу.
 * Презентация перенесена из инлайн-блока; логика та же (useSend, useAccount, билдеры funding.ts).
 */
export function CashierButton() {
  const active = useActiveAccount();
  const { connect } = useConnectModal();
  const [open, setOpen] = useState(false);

  async function onClick() {
    if (active) {
      setOpen(true);
      return;
    }
    try {
      await connect({
        client,
        chain,
        wallets,
        accountAbstraction,
        size: "compact",
        theme: "dark",
      });
      setOpen(true);
    } catch {
      /* пользователь закрыл вход */
    }
  }

  return (
    <>
      <Button variant="secondary" className="h-9 gap-1.5 px-3" onClick={onClick}>
        <CardGlyph />
        Касса
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{active ? <CashierContent /> : null}</DialogContent>
      </Dialog>
    </>
  );
}

function CashierContent() {
  const active = useActiveAccount();
  const reads = useAccount(active?.address);
  const { send, isPending } = useSend();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

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
    !isAddress(to) ||
    amountWei <= 0n ||
    total === undefined ||
    amountWei > total;

  const faucetLabel =
    reads.faucetClaimed === true
      ? "Бесплатный ETH уже получен"
      : reads.faucetPool !== undefined && reads.faucetPool < FAUCET_AMOUNT
        ? "Кран пуст"
        : "Получить бесплатно · 0.005 ETH";
  const faucetDisabled =
    isPending ||
    reads.faucetClaimed === true ||
    (reads.faucetPool !== undefined && reads.faucetPool < FAUCET_AMOUNT);

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <DialogTitle>Касса</DialogTitle>
          <DialogDescription>
            Счёт казино: {formatEth(total)} ETH
          </DialogDescription>
        </div>
        <DialogClose className="-mr-1 -mt-1 rounded-md px-2 py-1 text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          ✕
        </DialogClose>
      </div>

      <Tabs defaultValue="deposit">
        <TabsList>
          <TabsTrigger value="deposit">Пополнить</TabsTrigger>
          <TabsTrigger value="withdraw">Вывести</TabsTrigger>
        </TabsList>

        {/* Пополнить */}
        <TabsContent value="deposit">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Бесплатно (кран)</Label>
              <Button className="h-10" disabled={faucetDisabled} onClick={onFaucet}>
                {faucetLabel}
              </Button>
              <p className="text-xs text-muted-foreground">
                Тестовый ETH из крана. Один раз на аккаунт.
              </p>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-3">
              <Label>Со своего кошелька</Label>
              {address ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 rounded-lg bg-white p-2">
                      <QRCodeSVG value={address} size={96} marginSize={0} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <span
                        className="break-all font-mono text-xs text-muted-foreground"
                        title={address}
                      >
                        {address}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-fit"
                        onClick={copyAddress}
                      >
                        {copied ? "Скопировано" : "Копировать адрес"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Отправь на этот адрес тестовый ETH сети Base Sepolia из MetaMask или с биржи —
                    зачислится на «Счёт казино».
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </TabsContent>

        {/* Вывести */}
        <TabsContent value="withdraw">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wd-to">Адрес назначения</Label>
            <Input
              id="wd-to"
              placeholder="0x… адрес MetaMask или биржи"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Label htmlFor="wd-amount" className="mt-1">
              Сумма, ETH
            </Label>
            <div className="flex gap-2">
              <Input
                id="wd-amount"
                inputMode="decimal"
                placeholder="0.005"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                className="h-10 shrink-0"
                disabled={isPending || withdrawInvalid}
                onClick={onWithdraw}
              >
                Вывести
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Отправим тестовый ETH на твой адрес, газ оплачивает казино. Доступно:{" "}
              {formatEth(total)} ETH.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
