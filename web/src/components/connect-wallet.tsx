"use client";

import { ConnectButton } from "thirdweb/react";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";
import { accountAbstraction, wallets } from "@/lib/wallet";

/**
 * Вход/аккаунт. Конфигурация (email-only + безгазовый смарт-аккаунт) — общая с программным входом
 * «Войти и сыграть» (lib/wallet), чтобы оба пути давали один и тот же адрес. autoConnect включён
 * по умолчанию: после перезагрузки сессия восстанавливается.
 */
export function ConnectWallet() {
  return (
    <ConnectButton
      client={client}
      chain={chain}
      wallets={wallets}
      accountAbstraction={accountAbstraction}
      theme="dark"
      connectModal={{ size: "compact" }}
      connectButton={{ label: "Войти" }}
    />
  );
}
