"use client";

import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { chain } from "@/lib/chain";
import { client } from "@/lib/client";

// Встроенный кошелёк thirdweb (email/google/passkey) + MetaMask. Без gasless (стретч).
const wallets = [inAppWallet(), createWallet("io.metamask")];

/** Кнопка подключения кошелька с зафиксированной сетью Base Sepolia. */
export function ConnectWallet() {
  return (
    <ConnectButton
      client={client}
      chain={chain}
      wallets={wallets}
      theme="dark"
      connectModal={{ size: "compact" }}
      connectButton={{ label: "Подключить кошелёк" }}
    />
  );
}
