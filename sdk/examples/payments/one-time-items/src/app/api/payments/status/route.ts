import { createEazoPaymentStatusRoute } from "@eazo/sdk/payments/next";
import { fulfillPayment } from "@/lib/eazo-payments/items";

export const GET = createEazoPaymentStatusRoute({ fulfill: fulfillPayment });
