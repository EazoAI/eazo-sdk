# Eazo SDK Protocol (v1)

This document specifies the `postMessage` protocol between an Eazo app (web) and its host (Eazo Mobile WebView, or an iframe embed). `@eazo/sdk` is the reference implementation on the app side; host implementations (mobile, backend-driven embed) must conform to this spec.

## Transport

- Channel: `eazo-sdk`
- Version: `1`
- Encoding: JSON string
- App → host: `window.ReactNativeWebView.postMessage(payload)` (RN WebView) or `window.parent.postMessage(payload, "*")` (iframe)
- Host → app: environment-specific `postMessage` dispatch

Every envelope carries `ch: "eazo-sdk"` and `v: 1`. Messages that don't match are silently ignored — the SDK and host must co-exist with other libraries that also use `postMessage`.

## Envelope types

```ts
type Envelope =
  | Ready           // app → host
  | Hello           // host → app  (in response to Ready)
  | Request         // app → host
  | Response        // host → app  (in response to Request)
  | Event;          // host → app  (unsolicited)

interface Ready      { ch: "eazo-sdk"; v: 1; t: "ready"; appId?: string; }

interface Hello {
  ch: "eazo-sdk"; v: 1; t: "hello";
  session:       { authenticated: boolean; user: User | null; token: string | null };
  device:        DeviceContext;
  capabilities:  string[];   // e.g. ["auth.*", "device.getContext", "storage.get"]
  apiBase?:      string;     // Eazo platform URL the host is wired to; SDK-internal
}

interface Request    { ch: "eazo-sdk"; v: 1; t: "req"; id: string; fn: string; args?: unknown; }

interface ResponseOk { ch: "eazo-sdk"; v: 1; t: "res"; id: string; ok: true;  data?: unknown; }
interface ResponseErr{ ch: "eazo-sdk"; v: 1; t: "res"; id: string; ok: false; err: BridgeError; }

interface Event      { ch: "eazo-sdk"; v: 1; t: "evt"; name: string; data?: unknown; }

interface BridgeError {
  code: "NOT_SUPPORTED" | "TIMEOUT" | "DENIED" | "INVALID_ARGS" | "INTERNAL";
  message: string;
}
```

## Handshake

1. App mounts → sends `{ t: "ready", appId? }`
2. Host responds with `{ t: "hello", session, device, capabilities }`
3. App caches the hello payload as initial state; subsequent RPCs and events apply to this cache
4. If the app does not receive `hello` within **1.5 s**, it enters pure-web mode (no further requests are sent)

The `appId` field on `ready` is the Eazo app ID (e.g. `i_xxx`). Hosts that need to look up or encrypt a session token on the app's behalf can use this directly. Absent when the app hasn't been configured with an app id — hosts should fall back to another identifier if they support one.

## RPC

- `id` is app-generated, unique per session (UUID or counter)
- Response MUST echo the same `id`
- Timeout: **10 s** — if no response arrives, the app throws `TIMEOUT`

## Method and event naming

- Method names (`fn`): `<capability>.<action>`; action is camelCase
  - Examples: `auth.getToken`, `auth.getSession`, `device.getContext`, `storage.get`
- Event names (`name`): `<capability>.<event>`; past tense or state descriptor
  - Examples: `auth.changed`, `auth.loginCancelled`

## Capability advertisement

Host declares which functions it supports in `hello.capabilities`. Format:

- `auth.*` — all `auth.<anything>` supported
- `auth.getToken` — only this specific method

The app checks this list before sending a request; unsupported methods fail immediately with `NOT_SUPPORTED` (app then falls back to web-native behavior).

## Error semantics

| Code | Meaning | App behavior |
|---|---|---|
| `NOT_SUPPORTED` | Method not advertised in `capabilities` | Fall back to web-native |
| `TIMEOUT` | No response in 10 s | Fall back to web-native |
| `DENIED` | Host / user refused (permission, policy) | Surface to business code |
| `INVALID_ARGS` | Request args failed validation | Surface to business code |
| `INTERNAL` | Host error | Log + surface |

## First-version method and event catalog

### Methods

| `fn` | `args` | `data` | Notes |
|---|---|---|---|
| `auth.getToken` | — | `{ token: string \| null }` | Current session token |
| `auth.getSession` | — | `{ session: SessionToken \| null }` | Raw encrypted session (`x-eazo-session` payload) |
| `auth.requestLogin` | `{ preferredProvider?: string }` (optional) | `{ started: boolean }` | Host should display its native login UI and return promptly (don't block on user). The SDK then waits for `auth.changed` (success) or `auth.loginCancelled` (dismiss). If the host can't show native UI, respond `NOT_SUPPORTED` — SDK falls back to the web login UI inside the WebView. |
| `auth.requestLogout` | — | — (any data is ignored) | App requests a sign-out. Identity is host-managed: the host decides what (if anything) to do — surface a "not supported" message, run its own logout flow, etc. — and resolves the RPC. The SDK does NOT clear local state on the mobile path; if a real logout occurs, the host pushes `auth.changed` with `authenticated: false`. Respond `NOT_SUPPORTED` only if the host can't display anything in response — the SDK then falls back to web-style local clear. |
| `device.getContext` | — | `DeviceContext` | Usually unused — hello already contains this |
| `share.compose` | `{ text?: string; attachments?: Array<{ type: "image"; url: string; caption?: string }>; images?: string[]; sourceAppId?: string; targetPath?: string }` | `{ accepted: boolean }` | App hands raw share materials (text + up to 4 total image materials, each `https://...` or `data:image/...;base64,...`) to the host. `attachments` is the preferred shape because images can include a short caption/meaning; `images` remains legacy-compatible. `targetPath` is an optional app-relative destination such as `/profile/u_123` that the host may open when someone taps the published share widget; absolute URLs are invalid. Host opens its compose surface, AI-drafts a post from the inputs, and lets the user edit and publish. Respond promptly after navigation begins — the SDK times out at 10 s. If the host can't accept the share, respond `NOT_SUPPORTED`; the SDK falls back to a "Continue in the Eazo app" download CTA in the web. Reject with `DENIED` when the host requires a logged-in user and none is signed in. |
| `memory.reportAction` | `MemoryActionParams` (see `memory.ts`) — same payload posted to `/api/open/gum/action` | — (any data is ignored) | Fire-and-forget side-channel: when the SDK reports a user action, it forwards the same payload to the mobile host so the host can react locally (analytics, on-device memory, UI hints). The HTTP POST to Gum still happens in parallel and is the source of truth. Hosts that don't care about side-channel actions should respond `NOT_SUPPORTED` — the SDK swallows it silently and the HTTP path is unaffected. Hosts MUST NOT block on this request; respond promptly. Sent only when `getHost() === "eazoMobile"`. Both this side-channel and the HTTP POST are gated by the app author's `sendAnonymousData` consent flag (read from `GET /api/apps-open/:appId`); when consent is off, `reportAction` no-ops entirely and this message is never sent. |
| `notifications.subscribe` | — | `{ subscribed: boolean }` | Opt the current user into push notifications from the embedded app. Host flips the per-(user, app) subscription bit and echoes the resulting state. Idempotent — re-subscribing returns `{ subscribed: true }`. The host is responsible for whether the user has granted system-level push permission (the SDK does not prompt). Respond `NOT_SUPPORTED` when the host cannot maintain per-app subscriptions; the SDK then resolves `{ subscribed: false }` without throwing. |
| `notifications.unsubscribe` | — | `{ subscribed: boolean }` | Opt the current user out. Idempotent. Same fall-back semantics as `subscribe`. |
| `notifications.isSubscribed` | — | `{ subscribed: boolean }` | Read the current subscription state without side effects. Same fall-back semantics — `NOT_SUPPORTED` resolves `{ subscribed: false }`. |

### Events

| `name` | `data` | Trigger |
|---|---|---|
| `auth.changed` | `{ authenticated, user, token }` | Login, logout, account switch |
| `auth.loginCancelled` | — (optional `{ reason?: string }`) | User dismissed the native login UI without authenticating. Causes the app's in-flight `auth.login()` to reject with `DENIED`. |

### Safe-area geometry

Safe-area geometry is intentionally not part of `DeviceContext` or the
postMessage protocol. Edge-to-edge iOS hosts expose it through WebKit CSS
`env(safe-area-inset-*)`; app or template CSS decides which content consumes
those values. The SDK does not inset the application layout.

## Version evolution

- **Breaking change** → bump `v`; host replies `NOT_SUPPORTED` if mismatched
- **New capability** → append to `capabilities` only; v stays
- **Method arg change** → new fields optional (backward-compatible); incompatible changes use a new method name

## Minimal host implementation

```ts
window.addEventListener("message", (e) => {
  const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  if (msg?.ch !== "eazo-sdk" || msg.v !== 1) return;

  if (msg.t === "ready") {
    send({
      ch: "eazo-sdk", v: 1, t: "hello",
      session: { authenticated: true, user, token },
      device: { platform: "mobile", locale: "zh-CN" },
      capabilities: ["auth.*"],
      apiBase: "https://api.eazo.ai",
    });
  }

  if (msg.t === "req" && msg.fn === "auth.getToken") {
    send({ ch: "eazo-sdk", v: 1, t: "res", id: msg.id, ok: true, data: { token } });
  }
});
```

Hosts that don't implement an advertised method must respond with `ok: false, err: { code: "NOT_SUPPORTED", ... }`.
