/**
 * Константы, зеркалящие экономику контракта LimboCasino, и общие ссылки.
 * Значения сверены с `contracts/src/LimboCasino.sol` — менять только вместе с контрактом.
 */

/** Минимальная ставка (контракт: MIN_BET = 1e13 wei = 0.00001 ETH). */
export const MIN_BET = 10_000_000_000_000n;

/** Выдача крана за один claim (контракт: FAUCET_AMOUNT = 5e15 wei = 0.005 ETH). */
export const FAUCET_AMOUNT = 5_000_000_000_000_000n;

/** RTP игры (контракт: RTP_BPS = 9900 = 99.00%). Edge зашит в распределение: P(выигрыш) = RTP / T. */
export const RTP = 0.99;

/** Эксплорер сети Base Sepolia. */
export const BASESCAN = "https://sepolia.basescan.org";

/** Ссылка на транзакцию в эксплорере. */
export const txUrl = (hash: string) => `${BASESCAN}/tx/${hash}`;

/** Ссылка на адрес (контракт/кошелёк) в эксплорере. */
export const addressUrl = (address: string) => `${BASESCAN}/address/${address}`;
