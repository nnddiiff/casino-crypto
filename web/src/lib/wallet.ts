import { darkTheme } from "thirdweb/react";
import type { SmartWalletOptions } from "thirdweb/wallets";
import { inAppWallet, type Wallet } from "thirdweb/wallets";
import { chain } from "./chain";
import { client } from "./client";

/**
 * Единственный способ входа — email.
 *
 * Почему один способ: у встроенного кошелька thirdweb каждый провайдер (email/Google/passkey)
 * даёт СВОЙ отдельный адрес. Если дать выбор, игрок войдёт через Google, в другой раз через email —
 * и попадёт на «два разных кошелька» с разными балансами. Один способ убирает эту ловушку.
 */
export const wallets: Wallet[] = [
  inAppWallet({ auth: { options: ["email"] } }),
];

/**
 * Безгазовый смарт-аккаунт (ERC-4337): любой вход оборачивается в смарт-аккаунт, а газ всех его
 * операций спонсирует пэймастер thirdweb (на тестнете бесплатно, нужен лишь client id). Так онбординг
 * не упирается в недоступный газ Base Sepolia — игрок проходит весь путь, не добывая ETH на газ извне.
 */
export const accountAbstraction: SmartWalletOptions = { chain, sponsorGas: true };

/** Тема окна входа под бренд: charcoal-фон + неон-зелёный акцент (как всё приложение). */
export const brandTheme = darkTheme({
  colors: {
    modalBg: "#1e212b",
    modalOverlayBg: "rgba(8, 9, 12, 0.7)",
    borderColor: "#2b3140",
    separatorLine: "#2b3140",
    accentText: "#00e701",
    accentButtonBg: "#00e701",
    accentButtonText: "#052109",
    primaryButtonBg: "#00e701",
    primaryButtonText: "#052109",
    primaryText: "#e8eaef",
    secondaryText: "#99a1b3",
  },
});

/**
 * Единая конфигурация окна входа для всех точек (шапка, «Касса», «Войти и сыграть»):
 * email-only + безгазовый смарт-аккаунт + русский язык + бренд-тема, без брендинга thirdweb.
 * Один конфиг → один и тот же адрес и одинаковый UX везде.
 */
export const connectModalConfig = {
  client,
  chain,
  wallets,
  accountAbstraction,
  size: "compact" as const,
  theme: brandTheme,
  locale: "ru_RU" as const,
  showThirdwebBranding: false,
};
