import { createEazoCheckoutRoute } from "@eazo/sdk/payments/next";
import { resolveItems } from "@/lib/eazo-payments/items";

export const POST = createEazoCheckoutRoute({ resolveItems });
