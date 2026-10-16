import {
  EAZO_PAYMENT_CURRENCY,
  type EazoCheckoutItem,
  type EazoCheckoutLine,
} from "@eazo/sdk/payments";
import type { EazoItemsFulfill, EazoItemsResolution } from "@eazo/sdk/payments/next";

export const PAYMENT_CURRENCY = EAZO_PAYMENT_CURRENCY.USD;

// What can be paid for, keyed by the id the browser sends in lines. Replace
// with the app's own server-side data. unitAmount is integer minor units.
// entitlementKey: Eazo grants it when paid (quantity 1); read it with
// useEazoEntitlement(key). Lines without it are granted by fulfillPayment.
export const PAYMENT_ITEMS: Record<string, { name: string; unitAmount: number; entitlementKey?: string }> = {
  item_a: { name: "Item A", unitAmount: 499, entitlementKey: "item_a" },
  item_b: { name: "Item B", unitAmount: 199 },
};

// Prices the browser's lines on the server. Return null to reject the request.
// Never trust prices or amounts from the browser; a discount, if any, is
// computed here and returned as discountAmount / discountLabel.
export async function resolveItems({ lines }: { lines: EazoCheckoutLine[]; data?: Record<string, string> }): Promise<EazoItemsResolution | null> {
  if (new Set(lines.map((line) => line.id)).size !== lines.length) return null;
  const items: EazoCheckoutItem[] = [];
  for (const line of lines) {
    const item = PAYMENT_ITEMS[line.id];
    if (!item) return null;
    if (item.entitlementKey && line.quantity !== 1) return null;
    items.push({
      name: item.name,
      unitAmount: item.unitAmount,
      quantity: line.quantity,
      metadata: { item_id: line.id },
      ...(item.entitlementKey ? { entitlementKey: item.entitlementKey } : {}),
    });
  }
  return { currency: PAYMENT_CURRENCY, items };
}

// Grants the paid lines that have no entitlement_key to user.id. Called only for
// paid payments with line items, possibly more than once per payment. A real app
// records the payment in a table whose primary key is payment_id, in the same
// transaction as the grant (insert ... onConflictDoNothing ... returning; grant
// only when a row was inserted).
//
// EXAMPLE ONLY: the in-memory Set/Map below stand in for those tables; they are
// lost on restart and not shared between serverless instances.
const fulfilledPaymentIds = new Set<string>();
const balances = new Map<string, Map<string, number>>();

export function getBalances(userId: string): Record<string, number> {
  return Object.fromEntries(balances.get(userId) ?? []);
}

export const fulfillPayment: EazoItemsFulfill = async (payment, { user }) => {
  const lines = payment.line_items.filter((line) => !line.entitlement_key);
  if (lines.length === 0) return; // Entitlement lines are granted by Eazo.
  if (fulfilledPaymentIds.has(payment.payment_id)) return;
  const balance = balances.get(user.id) ?? new Map<string, number>();
  for (const line of lines) {
    const itemId = line.metadata.item_id;
    if (!itemId) continue;
    balance.set(itemId, (balance.get(itemId) ?? 0) + line.quantity);
  }
  balances.set(user.id, balance);
  fulfilledPaymentIds.add(payment.payment_id);
};
