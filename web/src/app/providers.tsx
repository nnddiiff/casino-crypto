"use client";

import { ThirdwebProvider } from "thirdweb/react";
import { Toaster } from "@/components/ui/sonner";

/** Клиентская граница приложения: контекст thirdweb (кошелёк + React Query) и тосты статусов транзакций. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider>
      {children}
      <Toaster position="top-center" richColors />
    </ThirdwebProvider>
  );
}
