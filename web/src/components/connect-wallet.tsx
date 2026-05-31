"use client";

import { useState } from "react";
import {
  AutoConnect,
  Blobbie,
  useActiveAccount,
  useActiveWallet,
  useConnectModal,
  useDisconnect,
} from "thirdweb/react";
import { Button } from "@/components/ui/button";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { addressUrl } from "@/lib/constants";
import { accountAbstraction, wallets } from "@/lib/wallet";

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Вход и меню аккаунта. Намеренно НЕ используем штатный ConnectButton thirdweb в подключённом
 * состоянии: его плашка и модалка показывают сырой баланс кошелька — это второе число рядом с
 * нашим единым «Счётом казино», чего быть не должно. Здесь — собственный чип: только адрес и
 * выход, без баланса. Вход и восстановление сессии — через useConnectModal + AutoConnect
 * (та же конфигурация email-only + безгазовый смарт-аккаунт, что и в каскаде «Войти и сыграть»).
 */
export function ConnectWallet() {
  const account = useActiveAccount();
  const activeWallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { connect, isConnecting } = useConnectModal();
  const [open, setOpen] = useState(false);

  async function login() {
    try {
      await connect({
        client,
        chain,
        wallets,
        accountAbstraction,
        size: "compact",
        theme: "dark",
      });
    } catch {
      /* пользователь закрыл окно входа */
    }
  }

  return (
    <>
      {/* Восстановление сессии при перезагрузке (без штатного ConnectButton). */}
      <AutoConnect
        client={client}
        wallets={wallets}
        accountAbstraction={accountAbstraction}
      />

      {!account ? (
        <Button onClick={login} disabled={isConnecting} className="h-9 px-4">
          {isConnecting ? "Входим…" : "Войти"}
        </Button>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <Blobbie address={account.address} size={20} className="rounded-full" />
            <span className="font-medium tabular-nums">{shortAddr(account.address)}</span>
            <span className="text-xs text-muted-foreground">⌄</span>
          </button>

          {open ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(account.address);
                    setOpen(false);
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  Скопировать адрес
                </button>
                <a
                  href={addressUrl(account.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  Открыть в Basescan
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (activeWallet) disconnect(activeWallet);
                    setOpen(false);
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  Выйти
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
