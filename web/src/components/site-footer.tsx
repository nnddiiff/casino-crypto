import { addressUrl } from "@/lib/constants";
import { casino } from "@/lib/contract";
import { ENTROPY_ADDRESS } from "@/lib/entropy";

/** Подвал: дисклеймер тестнета + прямые ссылки на контракты в эксплорере (прозрачность). */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
      <p>Тестнет Base Sepolia · только тестовый ETH, без реальных денег.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <a
          href={addressUrl(casino.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          Контракт казино на Basescan
        </a>
        <a
          href={addressUrl(ENTROPY_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          Pyth Entropy — источник случайности
        </a>
      </div>
    </footer>
  );
}
