# Eazo Payments Monthly Subscription Example

Complete Next.js App Router example for Eazo marketplace monthly subscriptions.

Use this example as the reference implementation when an app needs recurring
monthly access. The app configures only `mode: EAZO_PAYMENT_MODE.SUBSCRIPTION`;
there is no public `interval` field. Eazo platform and SDK internals always use
monthly recurring Stripe Checkout for this recipe.

## What This Example Implements

- A monthly subscription product named `premium`.
- A paid CTA that requires Eazo Auth before checkout.
- Same-window redirect to Stripe Checkout through SDK lifecycle code.
- Stripe return pages at `/payment/success` and `/payment/cancel`.
- Payment status polling after Stripe redirects back with `payment_id`.
- Entitlement refresh and paid/free UI gating from Eazo platform state.
- Subscription list/cancel/resume local routes backed by SDK helpers.
- A subscription management panel that can cancel at period end or resume.
- Mock tests for checkout, status, entitlement, subscription routes, UI wiring,
  and legacy-flow regressions.

The generated app never talks to Stripe directly. It never stores Stripe
secrets, never creates Stripe webhooks, never hand-writes subscription DTOs, and
never sends an `interval` field.

## File Map

```text
src/lib/eazo-payments/catalog.ts
src/components/eazo-payments/PaymentUnlockPanel.tsx
src/components/eazo-payments/SubscriptionManagementPanel.tsx
src/app/api/payments/checkout/route.ts
src/app/api/payments/status/route.ts
src/app/api/payments/entitlements/route.ts
src/app/api/payments/subscriptions/route.ts
src/app/api/payments/subscriptions/[subscriptionId]/cancel/route.ts
src/app/api/payments/subscriptions/[subscriptionId]/resume/route.ts
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
    name: "Premium monthly subscription",
    unitAmount: 499,
    currency: EAZO_PAYMENT_CURRENCY.USD,
    mode: EAZO_PAYMENT_MODE.SUBSCRIPTION
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
- Do not add `interval`; this recipe is always monthly.
- `defineEazoPaymentProducts(...)` validates keys, modes, currency, and the legal price range.
- Use `getEazoPaymentPriceLimits(currency)` when product UI or tests need the SDK minimum, maximum, or amount increment. For example, USD must be at least `50` ($0.50), CNY at least `500` (¥5), GBP at least `30` (£0.30), and JPY at least `50` (¥50).
- Eazo caps product prices at USD $700 or its snapshot-based, whole-major-unit, rounded-up equivalent. If Stripe's technical maximum for a currency is lower, the SDK uses that lower limit. For example USD is `70_000` ($700) and CNY is `475_200` (¥4,752) using the 2026-07-14 rate snapshot.
- JPY and other zero-decimal currencies use whole currency units. ISK and UGX amounts must be divisible by `100` because of Stripe's API representation rules.
- Stripe minimums are based on the platform settlement currency. For a currency without a published static minimum, the SDK enforces a positive minor-unit amount and Eazo/Stripe performs the final conversion-aware validation during checkout.

### `PaymentUnlockPanel.tsx`

This reusable UI shell wraps `EazoPaymentUnlockPanel`. The default UI is
intentionally plain and should be treated as a working reference, not the final
visual design. Generated apps may edit markup, classes, and text so the payment
surface matches the app, but the payment lifecycle must stay inside SDK
components. Custom layouts can use its render prop or `EazoPaymentLifecycle`.

The SDK lifecycle owns:

- app user login via Eazo Auth
- entitlement checking
- checkout creation
- checkout redirect
- pending, active, canceling, past-due, failed, refunded, and disputed states
- visible error state

Do not replace it with `fetch("/api/payments/checkout")`, `data.url`,
`window.open`, Stripe SDK calls, Stripe Billing calls, or generated-app webhook
code.

### `SubscriptionManagementPanel.tsx`

This panel wraps `EazoSubscriptionManagementPanel`. Its default layout is a
reference implementation; apps should adjust the surrounding copy, spacing,
classes, and visual treatment to fit their own settings/profile UI.

It owns:

- loading the current app user's Eazo subscriptions
- canceling renewal at period end
- resuming renewal before period end
- keeping the app UI on SDK-managed subscription state

Past-due and canceled subscriptions are display-only here. The user should
return to the app premium CTA to start a new checkout.

### Local API Routes

The local routes are intentionally thin:

```ts
export const POST = createEazoCheckoutRoute({ getProduct: getPaymentProduct });
export const GET = createEazoPaymentStatusRoute();
export const GET = createEazoEntitlementRoute();
export const GET = createEazoSubscriptionsRoute();
export const POST = createEazoCancelSubscriptionRoute();
export const POST = createEazoResumeSubscriptionRoute();
```

These helpers read `EAZO_PAYMENTS_API_BASE`, `EAZO_APP_ID`, and `EAZO_PRIVATE_KEY` on
the server. They also translate local app requests into the platform payment
contract without exposing platform DTOs to UI code.

Generated app UI should call payment behavior only through SDK lifecycle
components and hooks.

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

### Mock Tests

`payment-contract.test.ts` verifies the full server/payment contract without
Stripe or a live Eazo platform:

- checkout request URL, method, headers, and body fields
- required `unit_amount`, `product_name`, `product_key`, and `entitlement_key`
- forbidden `amount`, `title`, `product_id`, `checkout_url`, `order_id`, and `interval`
- checkout response `checkout_session_id`, `checkout_url`, and `payment_id`
- normalized SDK result `checkoutSessionId`, `checkoutUrl`, and `paymentId`
- status states and entitlement states
- subscription list/cancel/resume route contracts
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
EAZO_PAYMENTS_API_BASE=https://dev1.eazo.ai/creator
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
- visual markup, class names, and copy in payment wrapper components; restyle them to match the app
- placement of `PaymentUnlockPanel`, `PremiumEntitlementGate`, and `SubscriptionManagementPanel`
- surrounding page layout and styling

## What Agents Must Not Customize

- subscription interval
- platform payment request bodies
- Stripe SDK, Stripe Billing, or Stripe webhook code
- `STRIPE_SECRET_KEY` or Stripe publishable keys
- checkout popups or external-browser bridges
- entitlement state stored only in localStorage
- DTO field names such as `amount`, `title`, `product_id`, `checkout_url`, or `interval`

The checkout button redirects with same-window navigation. Keep that behavior so
browser, E2B preview, hosted apps, and eazo-mobile WebView share one payment
lifecycle.
