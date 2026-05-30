"use client";

import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";

// Встроенный кошелёк thirdweb (email/google/passkey) + MetaMask.
const wallets = [inAppWallet(), createWallet("io.metamask")];

/**
 * Кнопка подключения кошелька с зафиксированной сетью Base Sepolia.
 *
 * Безгазовый вход: проп accountAbstraction оборачивает ЛЮБОЙ подключённый кошелёк
 * (встроенный и MetaMask) в смарт-аккаунт ERC-4337, а sponsorGas:true спонсирует газ
 * всех его транзакций через бандлер/пэймастер thirdweb. На тестнетах спонсирование
 * бесплатно и не требует биллинга — нужен лишь client id. Это замыкает онбординг:
 * новый кошелёк с нулём ETH проходит весь путь (кран → депозит → ставка → вывод),
 * не добывая Base Sepolia ETH на газ извне (комиссию Pyth за ставку покрывает кран).
 */
export function ConnectWallet() {
  return (
    <ConnectButton
      client={client}
      chain={chain}
      wallets={wallets}
      accountAbstraction={{ chain, sponsorGas: true }}
      theme="dark"
      connectModal={{ size: "compact" }}
      connectButton={{ label: "Подключить кошелёк" }}
    />
  );
}
