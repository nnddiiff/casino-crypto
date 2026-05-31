/**
 * Прямая работа с инжектируемым EIP-1193 провайдером (MetaMask и т.п.) — В ОБХОД thirdweb.
 *
 * Сознательно НЕ используем thirdweb connection manager для MetaMask: иначе кошелёк обернётся в
 * смарт-аккаунт (AA), появится второй адрес и гонка активного аккаунта. Здесь MetaMask — отдельный
 * сырой канал: для пополнения «Счёта казино» (перевод на адрес смарт-аккаунта) и как источник адреса
 * вывода. Активный thirdweb-аккаунт (email-смарт-аккаунт) этот модуль не трогает.
 */

/** Узкий тип EIP-1193 — без augment глобального Window, чтобы не конфликтовать с типами библиотек. */
export interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
}

/** Base Sepolia: chainId 84532 = 0x14a34. */
const BASE_SEPOLIA_CHAIN_HEX = "0x14a34";

/** Код «пользователь отклонил» по EIP-1193. */
export const USER_REJECTED = 4001;
/** Код «сеть не добавлена в кошелёк». */
const CHAIN_NOT_ADDED = 4902;

/** Инжектируемый провайдер из окна, если есть (иначе undefined — фолбэк на ручной адрес/QR). */
export function getInjectedProvider(): InjectedProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: InjectedProvider }).ethereum;
}

/** Числовой код ошибки провайдера (4001 / 4902 / …), если есть. */
export function errorCode(e: unknown): number | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "number" ? c : undefined;
  }
  return undefined;
}

/** Человеческое сообщение из ошибки провайдера (у MetaMask ошибки — обычно plain-объект с message). */
export function injectedMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m.length > 140 ? `${m.slice(0, 140)}…` : m;
  }
  return "Неизвестная ошибка кошелька";
}

/** Запросить доступ к аккаунтам; вернуть первый адрес. Бросает при отказе (code 4001). */
export async function requestAccount(p: InjectedProvider): Promise<string> {
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Кошелёк не вернул адрес");
  }
  return accounts[0];
}

/** Гарантировать сеть Base Sepolia: переключить, при отсутствии — добавить и переключить. */
export async function ensureBaseSepolia(p: InjectedProvider): Promise<void> {
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_CHAIN_HEX }],
    });
  } catch (e) {
    if (errorCode(e) === CHAIN_NOT_ADDED) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_SEPOLIA_CHAIN_HEX,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_CHAIN_HEX }],
      });
    } else {
      throw e;
    }
  }
}

/** Отправить нативный перевод из MetaMask-аккаунта; вернуть txHash. Попап MetaMask с подставленными to/value. */
export async function sendNativeFromInjected(
  p: InjectedProvider,
  from: string,
  to: string,
  valueWei: bigint,
): Promise<`0x${string}`> {
  return (await p.request({
    method: "eth_sendTransaction",
    params: [{ from, to, value: `0x${valueWei.toString(16)}` }],
  })) as `0x${string}`;
}
