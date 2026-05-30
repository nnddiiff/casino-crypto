import { getContract } from "thirdweb";
import { chain } from "./chain";
import { client } from "./client";

/**
 * Контракт Pyth Entropy на Base Sepolia — источник проверяемой случайности.
 * Это фиксированная инфраструктура протокола (см. DECISIONS.md), не наш деплой,
 * поэтому адрес — константа с возможностью переопределить через env. Прод не зависит
 * от наличия переменной: дефолт совпадает с задеплоенным адресом сети.
 *
 * Зачем он фронту: наш BetSettled не публикует сырое случайное число, а Pyth — публикует
 * (событие `Revealed`). Верификатор честности тянет randomNumber отсюда и пересчитывает
 * исход функцией previewMultiplier нашего контракта.
 */
export const ENTROPY_ADDRESS =
  process.env.NEXT_PUBLIC_ENTROPY_ADDRESS ??
  "0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c";

export const entropy = getContract({ client, chain, address: ENTROPY_ADDRESS });
