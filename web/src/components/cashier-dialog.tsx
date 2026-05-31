"use client";

import { useEffect, useState } from "react";
import { waitForReceipt } from "thirdweb";
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
import { FAUCET_AMOUNT, txUrl } from "@/lib/constants";
import { formatEth, tryParseEth } from "@/lib/format";
import { buildWithdrawBatch, claimFaucetTx } from "@/lib/funding";
import {
  ensureBaseSepolia,
  errorCode,
  getInjectedProvider,
  injectedMessage,
  requestAccount,
  sendNativeFromInjected,
  USER_REJECTED,
} from "@/lib/injected";
import { connectModalConfig } from "@/lib/wallet";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

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
      await connect(connectModalConfig);
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
  const [depositAmount, setDepositAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<{
    txHash: string;
    amount: string;
    to: string;
  } | null>(null);

  // Наличие инжектируемого кошелька определяем после монтирования (hydration-safe).
  useEffect(() => {
    setHasProvider(!!getInjectedProvider());
  }, []);

  const address = active?.address;
  const total = reads.total;
  const walletBal = reads.walletBalance;

  function refresh() {
    reads.refetchAll();
  }

  function onFaucet() {
    void send([claimFaucetTx()], "Пополнение", refresh);
  }

  // Пополнение прямым переводом из MetaMask на адрес «Счёта казино» (в обход thirdweb).
  async function onDepositFromWallet() {
    const provider = getInjectedProvider();
    if (!provider || !address) return;
    const value = tryParseEth(depositAmount);
    if (value <= 0n) {
      toast.error("Введите сумму пополнения");
      return;
    }
    setDepositing(true);
    const id = toast.loading("Открываем кошелёк…");
    try {
      const from = await requestAccount(provider);
      await ensureBaseSepolia(provider);
      toast.loading("Подтвердите перевод в кошельке…", { id });
      const txHash = await sendNativeFromInjected(provider, from, address, value);
      toast.loading("Ждём подтверждения сети…", { id });
      await waitForReceipt({ client, chain, transactionHash: txHash });
      toast.success("Счёт пополнен", { id });
      setDepositAmount("");
    } catch (e) {
      if (errorCode(e) === USER_REJECTED) {
        toast.error("Отклонено в кошельке", { id });
      } else {
        toast.error("Не удалось пополнить из кошелька", {
          id,
          description: injectedMessage(e),
        });
      }
    } finally {
      setDepositing(false);
      refresh(); // средства могли прийти даже при долгом подтверждении
    }
  }

  async function onWithdraw() {
    const value = tryParseEth(amount);
    if (value <= 0n || !isAddress(to) || walletBal === undefined) return;
    const sentAmount = amount;
    const sentTo = to;
    const txHash = await send(buildWithdrawBatch(walletBal, value, sentTo), "Вывод");
    if (txHash) {
      setWithdrawResult({ txHash, amount: sentAmount, to: sentTo });
      setAmount("");
      setTo("");
      refresh();
    }
  }

  // Только источник адреса: MetaMask ничего не подписывает, выплата идёт со смарт-аккаунта gasless.
  async function onPickAddress() {
    const provider = getInjectedProvider();
    if (!provider) return;
    setPicking(true);
    try {
      const addr = await requestAccount(provider);
      setTo(addr);
    } catch (e) {
      if (errorCode(e) === USER_REJECTED) toast.error("Отклонено в кошельке");
      else toast.error(injectedMessage(e));
    } finally {
      setPicking(false);
    }
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

              {hasProvider ? (
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="0.01"
                    aria-label="Сумма пополнения, ETH"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    disabled={depositing}
                  />
                  <Button
                    className="h-10 shrink-0"
                    disabled={depositing}
                    onClick={onDepositFromWallet}
                  >
                    {depositing ? "Открываем…" : "Пополнить из кошелька"}
                  </Button>
                </div>
              ) : null}

              {address ? (
                <div className="flex items-center gap-3">
                  <div className="shrink-0 rounded-lg bg-white p-2">
                    <QRCodeSVG value={address} size={92} marginSize={0} />
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
              ) : null}

              <p className="text-xs text-muted-foreground">
                {hasProvider
                  ? "«Пополнить из кошелька» откроет MetaMask с подставленными адресом и суммой (газ платит кошелёк). Или отправь Base Sepolia ETH на адрес сам."
                  : "Нет MetaMask — отправь тестовый ETH сети Base Sepolia на этот адрес вручную (или установи MetaMask)."}
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Вывести */}
        <TabsContent value="withdraw">
          <div className="flex flex-col gap-2">
            {withdrawResult ? (
              <div className="mb-1 flex flex-col gap-1.5 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-medium text-primary">
                  Выведено {withdrawResult.amount} ETH → {shortAddr(withdrawResult.to)}
                </p>
                <a
                  href={txUrl(withdrawResult.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Транзакция на Basescan →
                </a>
                <p className="text-xs text-muted-foreground">
                  Средства в сети Base Sepolia. Если не видишь их в кошельке — переключи сеть на
                  Base Sepolia.
                </p>
              </div>
            ) : null}
            <Label htmlFor="wd-to">Адрес назначения</Label>
            <Input
              id="wd-to"
              placeholder="0x… адрес MetaMask или биржи"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {hasProvider ? (
              <Button
                size="sm"
                variant="secondary"
                className="w-fit"
                disabled={picking}
                onClick={onPickAddress}
              >
                {picking ? "Открываем…" : "Взять адрес из кошелька"}
              </Button>
            ) : null}

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
                onClick={() => void onWithdraw()}
              >
                Вывести
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Выплата идёт со «Счёта казино», газ оплачивает казино — MetaMask тут только источник
              адреса. Доступно: {formatEth(total)} ETH.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
