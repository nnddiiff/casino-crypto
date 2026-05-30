import { createThirdwebClient } from "thirdweb";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
if (!clientId) {
  throw new Error("NEXT_PUBLIC_THIRDWEB_CLIENT_ID не задан в .env.local");
}

/** Единый клиент thirdweb для всего приложения. На клиенте используется только публичный clientId. */
export const client = createThirdwebClient({ clientId });
