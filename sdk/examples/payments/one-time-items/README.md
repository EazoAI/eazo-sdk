# Eazo Payments One-Time Items Example

One payment for several line items, or more than one of the same item.

## Boundary

Eazo charges one Stripe Checkout for the lines the app priced, applies an
optional app-computed discount, grants an entitlement for each line with
`entitlementKey`, and reports whether the payment is paid.

The app prices the lines on its server (`resolveItems`) and grants lines without
`entitlementKey` (`fulfillPayment`), once per payment.

## Files

```text
src/lib/eazo-payments/items.ts               PAYMENT_ITEMS, resolveItems, fulfillPayment
src/lib/eazo-payments/items-contract.test.ts
src/components/eazo-payments/ItemsCheckoutButton.tsx
src/components/eazo-payments/PaymentSync.tsx   mounted in src/app/layout.tsx
src/app/api/payments/checkout/route.ts       createEazoCheckoutRoute({ resolveItems })
src/app/api/payments/status/route.ts         createEazoPaymentStatusRoute({ fulfill: fulfillPayment })
src/app/api/payments/sync/route.ts           createEazoPaymentSyncRoute({ fulfill: fulfillPayment })
src/app/api/payments/entitlements/route.ts   createEazoEntitlementRoute() for useEazoEntitlement
src/app/payment/success/page.tsx
src/app/payment/cancel/page.tsx
```

`checkout`, `status`, `entitlements`, `success` and `cancel` are the same routes the one-time and
subscription recipes use; an app with both passes `getProduct` and
`resolveItems` to one `createEazoCheckoutRoute`.

## `resolveItems({ lines, data })`

Receives `{ id, quantity }` lines and optional string `data`, and returns
`{ currency, items, discountAmount?, discountLabel?, metadata? }`. Each item is
`{ name, unitAmount, quantity, metadata, entitlementKey? }`. Return `null` to
reject the request. Prices and discounts come from server-side data only.

## `fulfillPayment(payment, { user })`

Grants the lines of `payment.line_items` that have no `entitlement_key`. It runs
only for paid payments and may run more than once, so dedupe on
`payment.payment_id` (a table keyed by `payment_id`, insert with `onConflictDoNothing`, grant only when a row was inserted).
The in-memory version here is for demonstration only.

## Rules

- Never call `/api/open/payments/*` or Stripe from the app.
- Grant only in `fulfillPayment` or through entitlements; never from the
  browser, a Stripe redirect, or localStorage.
