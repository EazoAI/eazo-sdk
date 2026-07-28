# Eazo SDK

Official SDK for building apps on the Eazo platform.

English | [中文](./README.zh-CN.md)

## Package

**`@eazo/sdk`** — [`sdk/`](./sdk/) — Capability-first SDK for Eazo apps. One codebase runs seamlessly in the browser and inside the Eazo Mobile WebView.

Capabilities (`import { … } from "@eazo/sdk"`):

- `auth` — unified login flow (web UI in browsers; mobile inherits the host's signed-in user via `hello.session`), session management, JWT retrieval
- `device` — runtime context (platform, locale, backend URL)
- `share` — hand text + images to the platform's compose surface
- `storage` — presigned S3 upload / download
- `memory` — Gum memory service client
- `ai` — OpenAI-compatible AI gateway
- `notifications` — per-app push subscription toggle (frontend); `notifications.publish` from `@eazo/sdk/server` for server-to-server pushes
- `payments` — Eazo marketplace payment checkout helpers; server routes call Eazo with `EAZO_PRIVATE_KEY`, generated apps never receive Stripe secrets
- `useEazo(selector)` — React integration via `useSyncExternalStore`
- `requireAuth` — server-side session decrypt + guard for Next.js / Remix route handlers

Built-in crypto: ECC secp256k1 + AES-256-GCM (session tokens), ES256K JWT (server-to-server publish auth).

**Install:**

```bash
npm install @eazo/sdk
```

**Quick example:**

```tsx
// app/layout.tsx — Server Component
import { EazoProvider } from "@eazo/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <EazoProvider appId={process.env.EAZO_APP_ID}>
      {children}
    </EazoProvider>
  );
}
```

```tsx
// Anywhere in the app
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";

function Header() {
  const user = useEazo((s) => s.auth.user);
  if (!user) return <button onClick={() => auth.login()}>Sign in</button>;
  return <span>Hi, {user.name}</span>;
}
```

```ts
// Server route — push to subscribers
import { notifications } from "@eazo/sdk/server";

await notifications.publish({
  title: "Daily reminder",
  body: "Your tasks are waiting.",
});
```

```bash
# Next.js one-time unlock payment scaffold
pnpm dlx @eazo/sdk payments init --recipe one-time-unlock
```

Configure via `EAZO_APP_ID` and `EAZO_PRIVATE_KEY` in env. See [`sdk/README.md`](./sdk/README.md) for the full API and [`sdk/PROTOCOL.md`](./sdk/PROTOCOL.md) for the host-app wire protocol.

## Security

The SDK implements a hybrid encryption scheme for session tokens:

- **ECC secp256k1** — key encapsulation
- **AES-256-GCM** — data encryption
- **ECDH** — shared secret
- **SHA-256** — key derivation

## Publishing

Releases are triggered by git tags. See [PUBLISHING.md](./PUBLISHING.md).

## License

MIT
