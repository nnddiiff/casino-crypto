import {
  type PreparedTransaction,
  prepareContractCall,
  prepareTransaction,
  readContract,
} from "thirdweb";
import { eth_getBalance, getRpcClient } from "thirdweb/rpc";
import { chain } from "./chain";
import { client } from "./client";
import { casino } from "./contract";

// ============================================================
// Свежие чтения (вне React — для оркестрации ставки/вывода по точному состоянию)
// ============================================================

/** Игровой баланс в контракте (`balances[addr]`) — то, чем можно делать ставку. */
export async function readGameBalance(address: string): Promise<bigint> {
  return readContract({
    contract: casino,
    method: "function balances(address) view returns (uint256)",
    params: [address],
  });
}

/** Нативный ETH на смарт-аккаунте — из него платится комиссия Pyth и автодепозит в игру. */
export async function readWalletBalance(address: string): Promise<bigint> {
  const rpc = getRpcClient({ client, chain });
  return eth_getBalance(rpc, { address: address as `0x${string}` });
}

/** Текущая комиссия Pyth за один запрос случайности (wei). */
export async function readEntropyFee(): Promise<bigint> {
  return readContract({
    contract: casino,
    method: "function entropyFee() view returns (uint256)",
    params: [],
  });
}

/** Состояние крана для адреса: использован ли и сколько осталось в пуле. */
export async function readFaucet(
  address: string,
): Promise<{ claimed: boolean; pool: bigint }> {
  const [claimed, pool] = await Promise.all([
    readContract({
      contract: casino,
      method: "function faucetClaimed(address) view returns (bool)",
      params: [address],
    }),
    readContract({
      contract: casino,
      method: "function faucetPool() view returns (uint256)",
      params: [],
    }),
  ]);
  return { claimed, pool };
}

/**
 * Статус ставки по seq: рассчитана ли (`settled`) и когда запрошена (`requestedAt`, сек).
 * Нужен для возврата зависшей ставки: контракт допускает refundStuckBet через STUCK_TIMEOUT (1 ч).
 * Порядок полей сверен с ABI getter'а `bets`: [player, stake, target, potentialPayout, settled, requestedAt].
 */
export async function readBetStatus(
  seq: bigint,
): Promise<{ settled: boolean; requestedAt: bigint }> {
  const bet = await readContract({
    contract: casino,
    method:
      "function bets(uint64) view returns (address player, uint256 stake, uint256 target, uint256 potentialPayout, bool settled, uint64 requestedAt)",
    params: [seq],
  });
  return { settled: bet[4], requestedAt: bet[5] };
}

// ============================================================
// Строители транзакций (плумбинг «Счёта казино» — пользователю невидим)
// ============================================================

/** Перенос нативного ETH со смарт-аккаунта в игровой баланс контракта (W → G). */
export const depositTx = (value: bigint): PreparedTransaction =>
  prepareContractCall({
    contract: casino,
    method: "function deposit() payable",
    params: [],
    value,
  });

/** Снятие части игрового баланса обратно на смарт-аккаунт (G → W). */
export const withdrawTx = (amount: bigint): PreparedTransaction =>
  prepareContractCall({
    contract: casino,
    method: "function withdraw(uint256)",
    params: [amount],
  });

/** Ставка Limbo. msg.value = комиссия Pyth (берётся из W). */
export const placeBetTx = (
  target: bigint,
  stake: bigint,
  fee: bigint,
): PreparedTransaction =>
  prepareContractCall({
    contract: casino,
    method: "function placeBet(uint256 target, uint256 stake) payable",
    params: [target, stake],
    value: fee,
  });

/** Получить бесплатный тестовый ETH из крана (один раз на адрес). */
export const claimFaucetTx = (): PreparedTransaction =>
  prepareContractCall({
    contract: casino,
    method: "function claimFaucet()",
    params: [],
  });

/**
 * Вернуть зависшую ставку (страховка контракта): permissionless, доступно через STUCK_TIMEOUT (1 ч),
 * если колбэк Pyth так и не пришёл. Ставка возвращается на «Счёт казино», резерв — обратно в банк.
 */
export const refundStuckBetTx = (seq: bigint): PreparedTransaction =>
  prepareContractCall({
    contract: casino,
    method: "function refundStuckBet(uint64)",
    params: [seq],
  });

/** Нативный перевод ETH на внешний адрес (вывод «на свой кошелёк»). */
export const sendNativeTx = (to: string, value: bigint): PreparedTransaction =>
  prepareTransaction({ client, chain, to: to as `0x${string}`, value });

// ============================================================
// Минимальные батчи (≤2 вызова = один UserOp, безгазовый и атомарный)
// ============================================================

/**
 * «Профинансировать и поставить» одним UserOp. Инвариант к моменту placeBet: G' ≥ stake и W' ≥ fee.
 * Вызывающий гарантирует общую достаточность: G + W ≥ stake + fee.
 *
 * - G < stake → довносим в игру нехватку (stake − G); после депозита W' = (G+W) − stake ≥ fee.
 * - G ≥ stake, но W < fee → переносим нехватку комиссии из игры в кошелёк (G ≥ stake, излишек есть).
 */
export function buildBetBatch(
  G: bigint,
  W: bigint,
  target: bigint,
  stake: bigint,
  fee: bigint,
): PreparedTransaction[] {
  const txs: PreparedTransaction[] = [];
  if (G < stake) {
    txs.push(depositTx(stake - G));
  } else if (W < fee) {
    txs.push(withdrawTx(fee - W));
  }
  txs.push(placeBetTx(target, stake, fee));
  return txs;
}

/**
 * Вывод `amount` на внешний адрес одним UserOp: если на кошельке не хватает —
 * добираем нехватку из игрового баланса (G → W), затем переводим наружу.
 */
export function buildWithdrawBatch(
  W: bigint,
  amount: bigint,
  to: string,
): PreparedTransaction[] {
  const txs: PreparedTransaction[] = [];
  if (W < amount) txs.push(withdrawTx(amount - W));
  txs.push(sendNativeTx(to, amount));
  return txs;
}
