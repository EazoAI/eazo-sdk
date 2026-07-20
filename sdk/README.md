# @eazo/sdk

Capability-first SDK for web apps that run both on a standard browser and inside the Eazo Mobile WebView. Write one codebase; the SDK picks the right implementation for the runtime.

## Install

```bash
npm install @eazo/sdk
```

## Quick start

```tsx
// app/layout.tsx
import { EazoProvider } from "@eazo/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <EazoProvider>{children}</EazoProvider>;
}
```

```tsx
// Any component
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";

export function Header() {
  const user = useEazo((s) => s.auth.user);
  if (!user) return <button onClick={() => auth.loginWithSocial("google")}>Sign in</button>;
  return <span>Hi, {user.name}</span>;
}
```

## API

### `auth`

```ts
import { auth } from "@eazo/sdk";

auth.user                                   // User | null
auth.loading                                // boolean
auth.authenticated                          // boolean
auth.loginUIOpen                            // boolean (web login UI)
await auth.getToken()                       // string | null
auth.onChange((user) => { ... })            // () => void (unsubscribe)

// One-stop login — handles every runtime and idempotent if already signed in.
const user = await auth.login()             // User
await auth.login({ timeoutMs: 120_000 })    // custom timeout (default: 5 min)
auth.showLogin()                            // imperative open (no await)
auth.hideLogin()                            // imperative close (rejects pending login())

// Low-level login primitives (rarely needed; `login()` orchestrates these).
await auth.loginWithSocial("google")
await auth.loginWithEmailPassword(email, password)
await auth.loginWithEmailCode(email, code)
await auth.sendEmailCode(email)
await auth.logout()

auth.fetchSocialConnections()               // SocialConnection[]
```


#### `auth.login()` — unified login flow

`auth.login()` is the canonical way to sign a user in. It:

1. Returns the current user immediately if already authenticated (idempotent).
2. On Eazo Mobile (host advertises `auth.requestLogin`), delegates to the native host login UI.
3. Otherwise, shows the SDK-bundled login modal (social providers + email / code / password).

```tsx
<button onClick={async () => {
  await auth.login();
  doSomethingProtected();
}}>
  Do something
</button>
```

It rejects with `DENIED` if the user cancels, or `TIMEOUT` after 5 minutes of inactivity (configurable via `timeoutMs`).

### `device`

```ts
import { device } from "@eazo/sdk";

device.platform                             // 'web' | 'mobile'
device.locale                               // 'zh-CN' | ...
device.getContext()                         // full DeviceContext
```

### `share`

Hand share materials (text + image attachments) to the platform's compose surface. Inside the Eazo Mobile WebView the host opens its native compose page, AI-drafts a post from the inputs, and lets the user edit and publish; in a plain browser the SDK shows a "Continue in the Eazo app" CTA pointing to https://eazo.ai/.

```ts
import { share } from "@eazo/sdk";

await share.compose({
  text: "Made carbonara tonight — first time the egg didn't scramble.",
  attachments: [
    {
      type: "image",
      url: "data:image/jpeg;base64,...",    // data: or https:
      caption: "finished dish photo",
    },
  ],
  sourceAppId: "recipe-keeper",             // optional attribution
  targetPath: "/recipes/carbonara-42",       // optional app-internal destination
});
// → { accepted: true } in the mobile app
// → { accepted: false } on the web (download CTA shown)
```

`attachments` currently supports image attachments only. Pass up to 4 total image materials. `images: string[]` is still accepted for legacy apps, but new code should prefer `attachments` so images can carry a short caption/meaning.

`targetPath` is optional and tells Eazo Mobile where to open the source app when someone taps the published share widget. It must be a relative path inside the source app, such as `/profile/u_123` or `/result/abc?tab=summary`; absolute URLs are rejected.

`share.compose` throws `INVALID_ARGS` synchronously if none of `text`, `attachments`, or `images` is provided, or if more than 4 total image materials are passed.

### `notifications`

Per-app push-notification subscription, mediated by the host. Calls flow through the postMessage bridge to the mobile shell which writes the per-(user, app) bit; the embedded app never talks to the platform directly here.

```ts
import { notifications } from "@eazo/sdk";

const { subscribed } = await notifications.isSubscribed();
if (!subscribed) await notifications.subscribe();   // opt the user in
// later…
await notifications.unsubscribe();                  // opt the user out
```

In a plain browser (no host) every method resolves `{ subscribed: false }` — no throws — so apps can render the right UI during local web development without special-casing.

**Publishing** is a separate, server-side surface — see [`@eazo/sdk/server` notifications](#server-notifications-publish).

### React integration

```ts
import { EazoProvider, useEazo } from "@eazo/sdk/react";
```

Rule: inside React render, read reactive state via `useEazo(selector)`. Outside render (event handlers, effects, non-React code), read directly from `auth.xxx` / `device.xxx`.

```tsx
const user = useEazo((s) => s.auth.user);
const { platform, locale } = useEazo((s) => s.device);
```

### Server (Next.js route handler)

```ts
import { requireAuth } from "@eazo/sdk/server";

export function GET(req: NextRequest) {
  const r = requireAuth(req);
  if (!r.ok) return r.response;
  // r.user: User
}
```

Requires `EAZO_PRIVATE_KEY` in the server environment.

<a id="server-notifications-publish"></a>
#### `notifications.publish`

Send a system push to every user subscribed to your app. Authenticates by signing an ES256K JWT with `EAZO_PRIVATE_KEY` — there is no user JWT in scope, so this is the right path for cron-driven digests, event-driven alerts, or any backend-originated notification.

```ts
import { notifications } from "@eazo/sdk/server";

export async function POST() {
  const { delivered, publishId } = await notifications.publish({
    title: "Slow-cooker timer",
    body: "Your stew is ready.",
    data: { recipeId: "stew-42" },           // optional, surfaces in the device tap handler
  });
  return Response.json({ delivered, publishId });
}
```

`audience` defaults to `"subscribers"` (v1's only value).

Throws `EazoNotificationPublishError` on platform-level errors (`code` 401 = bad JWT, 403 = appId doesn't belong to your key, 413 = >5,000 subscribers, etc.).

### Payments

Eazo marketplace payments are available through the payments subpaths. Generated apps create local Next.js routes and pages, but the platform checkout/status calls stay inside the SDK.

```bash
pnpm dlx @eazo/sdk payments init --recipe one-time-unlock
```

Generated files include:

```text
src/lib/eazo-payments/catalog.ts
src/components/eazo-payments/PaymentUnlockPanel.tsx
src/app/api/payments/checkout/route.ts
src/app/api/payments/status/route.ts
src/app/api/payments/entitlements/route.ts
src/app/payment/success/page.tsx
src/app/payment/cancel/page.tsx
src/lib/eazo-payments/payment-contract.test.ts
src/lib/eazo-payments/payment-ui-contract.test.tsx
```

UI code should place the scaffolded component so checkout, login, status
polling, and entitlement state stay on the SDK-owned lifecycle:

```tsx
import {
  PaymentUnlockPanel,
  PremiumEntitlementGate,
} from "@/components/eazo-payments/PaymentUnlockPanel";

<PaymentUnlockPanel productKey="premium" />

<PremiumEntitlementGate
  paid={<PremiumExperience />}
  free={<UpgradeExperience />}
/>
```

For custom UI, edit the scaffolded panel's markup/classes/text or use
`EazoPaymentLifecycle` / `useEazoPaymentLifecycle(productKey)` from
`@eazo/sdk/payments/react`. The SDK lifecycle owns checkout, login, status
polling, errors, and entitlement refresh; app code should only render the
returned state.

Server code should use the route helpers generated by the CLI:

```ts
import { createEazoCheckoutRoute } from "@eazo/sdk/payments/next";
import { getPaymentProduct } from "@/lib/eazo-payments/catalog";

export const POST = createEazoCheckoutRoute({ getProduct: getPaymentProduct });
```

For a full copyable Next.js example, see:

```text
examples/payments/one-time-unlock/
```

That example includes product catalog constants, local route handlers,
success/cancel pages, profile/upgrade UI, and mock contract tests for checkout,
status, entitlement, and legacy-flow regression checks.

Do not add Stripe SDKs, Stripe webhooks, `STRIPE_SECRET_KEY`, direct
`/api/open/payments/*` request bodies, or localStorage-only premium state to
generated apps. Checkout uses same-window navigation, confirms payment by
polling the Eazo ledger after Stripe returns with `payment_id`, and refreshes
platform-owned entitlements before paid UI renders as active.

### Testing

```ts
import { __resetSDK, __dispatchHostMessage } from "@eazo/sdk/testing";

afterEach(() => __resetSDK());
```

## Types

```ts
interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface DeviceContext {
  platform: "web" | "mobile";
  locale: string;
}
```

## How it works

The SDK talks to the Eazo Mobile host over `postMessage` using the protocol documented in [PROTOCOL.md](./PROTOCOL.md). When no host responds within 1.5 seconds, the SDK falls back to web-native implementations (GenAuth for login, `localStorage` for session, `navigator.language` for locale).

App code never branches on environment — the capability API is the same on both platforms.

## Environment

| Variable | Required | Used by |
|---|---|---|
| `EAZO_APP_ID` | yes | App ID; auto-resolved by `<EazoProvider>`. |
| `EAZO_PLATFORM_API_BASE` | optional | Override the Eazo platform base URL (defaults to `https://eazo.ai`). |
| `EAZO_PAYMENTS_API_BASE` | payments | Eazo Creator API base for generated app payment routes. |
| `EAZO_PRIVATE_KEY` | server | `requireAuth`, `notifications.publish`, payment checkout/status routes |
