import type { SmartWalletOptions } from "thirdweb/wallets";
import { inAppWallet, type Wallet } from "thirdweb/wallets";
import { chain } from "./chain";

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
