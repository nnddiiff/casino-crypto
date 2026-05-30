import { getContract } from "thirdweb";
import { chain } from "./chain";
import { client } from "./client";

const address = process.env.NEXT_PUBLIC_CASINO_ADDRESS;
if (!address) {
  throw new Error("NEXT_PUBLIC_CASINO_ADDRESS не задан в .env.local");
}

/**
 * Контракт LimboCasino на Base Sepolia. ABI намеренно не передаём: все вызовы
 * (useReadContract / prepareContractCall / prepareEvent) используют полные
 * сигнатуры — это надёжнее вывода типов из большого ABI и не нагружает парсер.
 * Канонический ABI — в contracts/out и в верифицированном контракте на Basescan.
 */
export const casino = getContract({
  client,
  chain,
  address,
});
