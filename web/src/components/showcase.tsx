import { AuditDashboard } from "@/components/audit-dashboard";
import { RecentBetsFeed } from "@/components/recent-bets-feed";
import { VerifyPanel } from "@/components/verify/verify-panel";

/** Витрина доверия: дашборд юнит-экономики + лента ставок + верификатор честности. Наш дифференциатор. */
export function Showcase() {
  return (
    <section className="flex w-full flex-col gap-6">
      <div className="mx-auto max-w-prose text-center">
        <h2 className="text-balance text-xl font-semibold sm:text-2xl">
          Не верь — проверь
        </h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          Обычные онлайн-казино просят верить им на слово. Здесь и преимущество казино, и каждая
          случайная цифра считаются прямо в блокчейне — ниже инструменты, которыми скептик
          убеждается, что игра честная, а не скам.
        </p>
      </div>
      <AuditDashboard />
      <RecentBetsFeed />
      <VerifyPanel />
    </section>
  );
}
