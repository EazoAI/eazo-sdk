import {
  EAZO_PAYMENT_CURRENCY,
  EAZO_PAYMENT_MODE,
  defineEazoPaymentProducts
} from "@eazo/sdk/payments";
import type { EazoPaymentProduct } from "@eazo/sdk/payments";

export const PAYMENT_PRODUCTS = defineEazoPaymentProducts({
  premium: {
    key: "premium",
    name: "Premium unlock",
    unitAmount: 499,
    currency: EAZO_PAYMENT_CURRENCY.USD,
    mode: EAZO_PAYMENT_MODE.ONE_TIME
  }
} as const);

export type PaymentProductKey = keyof typeof PAYMENT_PRODUCTS;

export function getPaymentProduct(productKey: string): EazoPaymentProduct | null {
  return PAYMENT_PRODUCTS[productKey as PaymentProductKey] ?? null;
}
