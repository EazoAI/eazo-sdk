# Eazo Payments One-Time Unlock Example

Complete Next.js App Router example for Eazo marketplace payments.

Use this example as the reference implementation for generated apps. The CLI
scaffold creates the same integration shape; this directory explains what each
piece does and why the generated app should avoid custom payment code.

## What This Example Implements

- A one-time payment product named `premium`.
- A paid CTA that requires Eazo Auth before checkout.
- Same-window redirect to Stripe Checkout through SDK lifecycle code.
- Stripe return pages at `/payment/success` and `/payment/cancel`.
- Payment status polling after Stripe redirects back with `payment_id`.
- Entitlement refresh and paid/free UI gating from Eazo platform state.
- Mock tests for checkout, status, entitlement, UI wiring, and legacy-flow regressions.

The generated app never talks to Stripe directly. It never stores Stripe
secrets, never creates Stripe webhooks, and never hand-writes
`/api/open/payments/*` request bodies.

## File Map

```text
src/lib/eazo-payments/catalog.ts
src/components/eazo-payments/PaymentUnlockPanel.tsx
src/app/api/payments/checkout/route.ts
src/app/api/payments/status/route.ts
src/app/api/payments/entitlements/route.ts
src/app/payment/success/page.tsx
src/app/payment/cancel/page.tsx
src/app/page.tsx
src/lib/eazo-payments/payment-contract.test.ts
src/lib/eazo-payments/payment-ui-contract.test.tsx
```

## Code Explanation

### `catalog.ts`

This is the only product configuration file.

```ts
export const PAYMENT_PRODUCTS = defineEazoPaymentProducts({
  premium: {
    key: "premium",
    name: "Premium unlock",
    unitAmount: 499,
    currency: EAZO_PAYMENT_CURRENCY.USD,
    mode: EAZO_PAYMENT_MODE.ONE_TIME
  }
} as const);
```

Rules:

- `key` is a stable ledger identifier used in payment metadata and entitlement lookups.
- `entitlementKey` defaults to `key`; only set it manually when multiple products unlock the same entitlement.
- `unitAmount` is the integer amount in minor currency units, such as cents for USD or fen for CNY.
- `currency` is required. Use an SDK enum value such as `EAZO_PAYMENT_CURRENCY.USD` or `EAZO_PAYMENT_CURRENCY.CNY`, not a raw string.
- The scaffold defaults to USD, but generated apps should use the currency the creator confirmed for the product.
- `mode` uses SDK constants, not raw strings.
- `defineEazoPaymentProducts(...)` validates keys, modes, currency, and price shape.

### `PaymentUnlockPanel.tsx`

This is the reusable UI shell. Generated apps may edit markup, classes, and
text, but the payment lifecycle must stay inside SDK components. The scaffolded
panel wraps `EazoPaymentUnlockPanel`; custom layouts can use its render prop or
`EazoPaymentLifecycle`.

The SDK lifecycle owns:

- app user login via Eazo Auth
- entitlement checking
- checkout creation
- checkout redirect
- pending, active, failed, refunded, and disputed states
- visible error state

The default button calls only the SDK-owned checkout action:

Do not replace it with `fetch("/api/payments/checkout")`, `data.url`,
`window.open`, or Stripe SDK calls.

### Local API Routes

The local routes are intentionally thin:

```ts
export const POST = createEazoCheckoutRoute({ getProduct: getPaymentProduct });
export const GET = createEazoPaymentStatusRoute();
export const GET = createEazoEntitlementRoute();
```

These helpers read `EAZO_API_BASE`, `EAZO_APP_ID`, and `EAZO_PRIVATE_KEY` on
the server. They also translate local app requests into the platform payment
contract:

- `POST /api/payments/checkout`
- `GET /api/payments/status?paymentId=...`
- `GET /api/payments/entitlements?productKey=...`

The route helpers also accept compatibility aliases such as `payment_id`,
`product_key`, and `key`, but generated app UI should still call them only
through SDK lifecycle components.

Generated app UI should call these only through SDK lifecycle components.

### Success And Cancel Pages

`/payment/success` uses `EazoPaymentSuccessPage`.

It:

- reads `payment_id` from the return URL
- falls back to SDK remembered payment id if needed
- polls the local status route
- waits for `paid: true`
- refreshes entitlement state
- then shows the unlocked state or redirects according to SDK options

`/payment/cancel` uses `EazoPaymentCancelPage` and does not unlock anything.

### `src/app/page.tsx`

The app page demonstrates the two normal UI placements:

```tsx
<PaymentUnlockPanel productKey="premium" />

<PremiumEntitlementGate
  paid={<PremiumExperience />}
  free={<UpgradeExperience />}
/>
```

Use `PaymentUnlockPanel` for CTAs and profile/settings upgrade panels. Use
`PremiumEntitlementGate` to switch paid vs free content from platform
entitlement state.

### Mock Tests

`payment-contract.test.ts` verifies the full server/payment contract without
Stripe or a live Eazo platform:

- checkout request URL, method, headers, and body fields
- required `unit_amount`, `product_name`, `product_key`, and `entitlement_key`
- forbidden `amount`, `title`, `product_id`, `checkout_url`, and `order_id`
- checkout response `checkout_session_id`, `checkout_url`, and `payment_id`
- normalized SDK result `checkoutSessionId`, `checkoutUrl`, and `paymentId`
- status states: `pending`, `succeeded`, `failed`, `expired`, `refunded`, `disputed`
- entitlement states: `inactive`, `pending`, `active`, `failed`, `expired`, `refunded`, `disputed`
- route-level request validation

`payment-ui-contract.test.tsx` verifies UI wiring:

- checkout UI calls SDK lifecycle `payment.checkout()`
- paid/free UI is gated by SDK lifecycle state
- source code does not contain legacy/manual checkout flow patterns

## Install

```bash
npm install
```

## Environment

Copy `.env.example` to `.env.local` and provide the generated app values:

```text
EAZO_API_BASE=https://dev1.eazo.ai
EAZO_APP_ID=<generated-app-id>
EAZO_PRIVATE_KEY=<generated-app-private-key>
```

## Run

```bash
npm run dev
npm test
npm run typecheck
```

## What Agents May Customize

- product names and prices in `catalog.ts`
- visual markup, class names, and copy in `PaymentUnlockPanel.tsx`
- placement of `PaymentUnlockPanel` and `PremiumEntitlementGate`
- surrounding page layout and styling

## What Agents Must Not Customize

- platform payment request bodies
- Stripe SDK or Stripe webhook code
- `STRIPE_SECRET_KEY` or Stripe publishable keys
- checkout popups or external-browser bridges
- entitlement state stored only in localStorage
- DTO field names such as `amount`, `title`, `product_id`, or `checkout_url`

The checkout button redirects with same-window navigation. Keep that behavior so
browser, E2B preview, hosted apps, and eazo-mobile WebView share one payment
lifecycle.
