# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Prevented full-height apps from collapsing inside Eazo Mobile WebView and
  iframe hosts.** The provider's always-rendered wrapper layers now receive
  their layout-neutral `display: contents` CSS in SSR output instead of
  depending on the plain-web-only banner stylesheet.

### Changed

- **Restored the top web handoff banner.** `<EazoProvider>` mounts
  `<EazoBrandBanner />` again on plain-web hosts. The center handoff modal
  remains disabled (`MODAL_ENABLED=false`); only the single top strip renders.
  SSR prefetch of `PublicAppInfo` is restored so the banner can paint real app
  identity on first frame. Mobile WebView and iframe behaviour is unchanged.

## [0.21.0] - 2026-06-11

### Changed

- **`memory.reportAction()` now respects the app author's "share anonymized
  usage data" setting.** Before reporting, the SDK reads
  `sendAnonymousData` from `GET /api/apps-open/:appId` (cached per app for
  5 minutes, with concurrent lookups de-duplicated). When the author has
  not opted in, `reportAction()` silently no-ops — neither the mobile
  side-channel nor the `POST /api/open/gum/action` request fires. If the
  platform is unreachable the gate fails open (reports proceed) and the
  transient result is not cached.
- **`apps-open` responses now include `sendAnonymousData`.**
  `GET /api/apps-open/:appId` returns the boolean author consent flag.
  Older SDKs ignore the new field. The server-side `POST /api/open/gum/action`
  endpoint enforces the same gate as a second layer, returning `200` without
  writing to Gum when the app has consent disabled.
- **Web handoff consolidated into a single top banner.** The separate bottom
  banner is gone; the app identity (icon + name), the likes/comments rail,
  and the Remix + "Open in Eazo" CTAs now live on one row. The SDK no longer
  reserves bottom padding on `<html>` (`--eazo-handoff-bottom` is pinned to
  `0px`, still published for host code reading it).
- **Handoff modal now pops immediately on load and re-arms 30s after dismiss**
  (previously a one-time 60s delay). Dismissing it (X / ESC) hides it and
  brings it back 30 seconds later, repeating for each dismiss.
- **Top-banner CTAs reworked.** The handoff CTA is relabeled "Open in app" →
  "Open in Eazo"; Remix is now the primary coral CTA and falls back to the web
  creator portal (`https://creator.eazo.ai/`) when the Eazo app doesn't open,
  instead of the store / marketing site.

### Fixed

- **Recovered the stuck social-login spinner.** When a user dismissed the
  Authing OAuth popup without completing, neither callback fired and the
  in-button spinner hung forever. The login UI now resets in-flight state on
  open/close and detects a dismissed popup via the window blur→focus signal,
  clearing the spinner so the user can retry.

## [0.19.1] - 2026-05-23

### Fixed

- **Restored the 60-second handoff modal delay.** A debug value
  (`2ms`) had been left in the `setTimeout` driving `modalReady`,
  which defeated the entire delay gate and caused the center
  handoff modal to pop on first paint instead of after the
  intended grace period. Restored to `MODAL_DELAY_MS` (60_000ms).

## [0.19.0] - 2026-05-23

### Added

- **`share.compose()` now accepts structured image attachments.** Apps can pass
  `attachments: [{ type: "image", url, caption? }]` so the mobile host receives
  both the image URL/data URL and a short meaning for each image. The legacy
  `images` array remains supported for compatibility, with a shared limit of
  four total image materials.
- **`share.compose()` now accepts `targetPath`.** Apps can provide an
  app-relative destination such as `/profile/u_123` or
  `/result/abc?tab=summary`; mobile can use it to open a published share widget
  directly into the relevant in-app page instead of only launching the app root.

### Docs

- Documented the share attachment and target-path payload in the SDK README and
  bridge protocol reference.

## [0.18.0] - 2026-05-22

### Changed

- **Handoff modal: scannable QR moves to the orbit center, app logo
  moves to the CTA-row tile.** Previously the orbit's center carried
  the app's logo (`Monolith`) and the CTA row carried the QR. They've
  swapped on desktop — the QR is the primary visual now, sized to
  144px (up from 88px in the CTA tile), so a desktop user with a
  phone in hand can scan from across the room. The app's logo lives
  in the CTA-row tile at 72px. Mobile still shows the logo at orbit
  center (asking a phone user to scan their own screen is silly) and
  the CTA row stays collapsed to a single button.

- **QR now embeds the app's icon at its center.** Purely cosmetic
  branding. `QrSvg` accepts `logoUrl` (http/data URL) or `logoGlyph`
  (emoji / initials) and automatically upgrades the ECC level from
  `M` to `H` (~30% damage tolerance) when a logo is present so the
  masked region still scans cleanly. A failed image load silently
  degrades to glyph or to no logo. New props are additive — existing
  `QrSvg` callers are unaffected.

- **Orbit geometry expanded.** Capability-node track radius pushed
  from 102 → 116 so the larger center QR has ~18px of clearance to
  the nearest node (was ~4px). Outer ring expanded 132 → 138 in
  proportion. The inner coral guide ring was dropped — at the new
  geometry its arcs visually grazed the QR's white tile.

- **`Monolith` accepts an optional `size` prop.** Used by the
  CTA-row instance to render at 72px; the orbit-center instance
  omits it and keeps the responsive CSS sizing (96 desktop /
  76 mobile) it had before.

## [0.17.2] - 2026-05-21

### Docs

- **Corrects the 0.17.0 CHANGELOG entry.** The original wording said
  `appId` / `apiBase` / `initialAppInfo` "became optional" and that
  passing them explicitly was "still supported as a per-render
  override." That was wrong: the refactor in 0.17.0 **removed** all
  three props from the public `<EazoProvider>` signature entirely.
  The corrected entry is below. No runtime change in 0.17.2 — only
  the CHANGELOG text and a small docstring tweak in `react.tsx`.

## [0.17.1] - 2026-05-21

### Changed

- **Login UI: per-provider in-button spinner.** While a social-login
  round-trip is in flight, the clicked provider button now shows an
  inline spinner in its icon slot and keeps full opacity; the other
  provider buttons stay dimmed at 0.55 opacity. Replaces the previous
  behaviour where all buttons dimmed equally with no per-button
  indication of which one was in progress.

## [0.17.0] - 2026-05-21

### Changed (breaking — public Provider signature)

- **`<EazoProvider>` is now strictly zero-prop.** The `appId`,
  `apiBase`, and `initialAppInfo` props were **removed** from the
  public Provider signature in both the client (`@eazo/sdk/react`)
  and the server (`react-server` condition) entries. Host code that
  passed any of these props will now fail TypeScript (and silently
  drop the values at runtime). Configuration moves entirely to env:
  the SDK auto-reads `EAZO_APP_ID` (and the framework-prefixed
  variants — `NEXT_PUBLIC_EAZO_APP_ID`, `EXPO_PUBLIC_EAZO_APP_ID`,
  …) and `EAZO_PLATFORM_API_BASE` at SSR. Under Next.js App Router
  the server provider prefetches `PublicAppInfo` and forwards
  appId / apiBase / initialAppInfo to the runtime through an
  internal `_EazoRuntimeProvider` — host code only writes
  `<EazoProvider>{children}</EazoProvider>`.
  - Migration: drop any `appId` / `apiBase` / `initialAppInfo`
    props from `<EazoProvider>`. Make sure `EAZO_APP_ID` (and
    `EAZO_PLATFORM_API_BASE`, if pointing at a non-prod platform)
    is set in env — including a `NEXT_PUBLIC_*` alias when the
    bundler can't read the bare name at the client (SPA, plain
    Webpack, Vite).
- A missing `EAZO_APP_ID` now throws from the Provider at first
  render with a clear "EAZO_APP_ID is not set" message, instead of
  surfacing later at the first capability call.

## [0.16.0] - 2026-05-21

### Changed (breaking — env var rename)

- **Renamed `EAZO_API_BASE` → `EAZO_PLATFORM_API_BASE`** to align with
  the public Eazo platform conventions. The fallback list of accepted
  env names is now `EAZO_PLATFORM_API_BASE`,
  `NEXT_PUBLIC_EAZO_PLATFORM_API_BASE`,
  `EXPO_PUBLIC_EAZO_PLATFORM_API_BASE`,
  `VITE_EAZO_PLATFORM_API_BASE`, `PUBLIC_EAZO_PLATFORM_API_BASE`,
  `REACT_APP_EAZO_PLATFORM_API_BASE`. Projects that previously set
  `EAZO_API_BASE` must rename the env key to keep targeting their
  staging / non-prod platform.

### Added

- **Server Component `<EazoProvider>` auto-reads
  `EAZO_PLATFORM_API_BASE`** at SSR and forwards the value to the
  client provider as a prop, so a server-only env reaches the client
  without a `NEXT_PUBLIC_*` alias. Templates no longer need to read
  the env manually in `layout.tsx`.

## [0.15.0] - 2026-05-19

### Changed (breaking — plain-web hosts only)

- **`<EazoProvider>` now wraps host children in a two-layer container
  (`.eazo-app-area` + `.eazo-app-area-scroller`) on plain-web hosts** so
  the SDK's `position: fixed` bottom banner can't overlap a host's own
  bottom-fixed UI (sticky toolbar, glass CTA, mobile tab bar). Host code
  that does `position: fixed; bottom: 0` now stays visually pinned ABOVE
  our banner during scroll — automatically. **No host changes required
  for the layout fix itself**, but several `window`-level APIs change
  behaviour. Activation is scoped to plain-web hosts (gated by the
  `eazo-host-web` class on `<html>`, set by banner-ui on mount); in
  the mobile WebView and in embedded iframes both wrapper layers are
  rendered as inert `<div>`s and host semantics are unchanged.

  **Why two layers, not one**: pre-existing `<html>` padding only
  affected flow-layout content; `position: fixed` resolves to the
  viewport, not the padded `<html>` box. A naive single-element wrapper
  with `transform: translateZ(0)` + `overflow: auto` does reparent the
  containing block but ALSO translates fixed descendants by the
  wrapper's scroll offset — sticky CTAs end up scrolling with content
  rather than staying pinned. Splitting the responsibilities fixes
  this:
    - `.eazo-app-area` (outer) has `transform: translateZ(0)` and no
      overflow — the containing block; its padding box never moves.
    - `.eazo-app-area-scroller` (inner) has `overflow: auto` and no
      transform — the scroll container; it is NOT a containing block
      for fixed descendants, so host's `position: fixed; bottom: 0`
      resolves up to the outer and stays painted in the outer's
      coordinate space, outside the scroller's scroll layer.

  **Affected web APIs on plain-web hosts** (no impact in mobile WebView
  or iframes):

  | API                                                 | Before                  | After (on plain-web hosts)                       |
  | --------------------------------------------------- | ----------------------- | ------------------------------------------------ |
  | `window.scrollY` / `window.pageYOffset`             | host content scroll     | always `0`                                       |
  | `window.scrollTo()` / `window.scrollBy()`           | scrolls host content    | no-op                                            |
  | `window.addEventListener('scroll', …)`              | fires on host scroll    | never fires                                      |
  | `document.body.style.overflow = 'hidden'`           | locks scroll            | no effect (body isn't scrolling)                 |
  | Host `position: fixed` (incl. modals at `inset: 0`) | relative to viewport    | contained to `.eazo-app-area` (inter-banner box) |

  **Migration**:

  - Read the scroller element when you need the host scroll position:
    ```js
    const scroller = document.querySelector(".eazo-app-area-scroller");
    scroller?.addEventListener("scroll", onScroll);
    scroller?.scrollTo({ top: 0, behavior: "smooth" });
    ```
  - Body-scroll-lock: target the scroller instead of `<body>`. Most
    modern modal libraries (Radix, Headless UI, etc.) portal to
    `document.body` and don't need changes; legacy custom modals that
    set `body.overflow = 'hidden'` do.
  - `IntersectionObserver`, scroll-container refs, and framework
    scroll APIs are unaffected.

### Added

- `--eazo-handoff-top` / `--eazo-handoff-bottom` CSS custom properties
  on `<html>`, set whenever the handoff banners are mounted. Available
  for host coordination (e.g. anchoring a tooltip just above the bottom
  banner: `bottom: calc(var(--eazo-handoff-bottom, 0px) + 12px);`).
- `eazo-host-web` class on `<html>`, set whenever banner-ui mounts in
  plain-web mode. Internal — the gate for `.eazo-app-area` styles. Host
  code should not depend on this class.

### Platform isolation

In mobile WebView and embedded iframe hosts the SDK now leaves the host
document untouched by banner-related artifacts:

- **No banner CSS in `document.head`** — `ensureBannerStylesInjected()`
  self-gates on `getHost() === "web"`.
- **No banner React components in the tree** — `<EazoProvider>` detects
  the host after mount and unmounts `<EazoBrandBanner />`, `<LoginUI />`,
  and `<ShareDownloadModal />` outside web. No store subscriptions, no
  DOM nodes, no effects for those components in mobile/iframe.
- **`.eazo-app-area` + `.eazo-app-area-scroller` wrapper boxes
  collapse via `display: contents`** — the wrapper React elements are
  always rendered (so SSR/CSR markup matches, no hydration mismatch),
  but generate no layout boxes outside plain web. Host's `position:
  fixed`, scroll, and containing-block resolution are byte-identical
  to "no SDK wrapper present" in mobile/iframe.

Net effect: a web app inside the eazo-mobile WebView gets the SDK's
bridge transport (its actual purpose there) and nothing else — no banner
DOM, no banner CSS, no scroll-model rewrites, no `<html>` class/padding/
CSS-var pollution.

### Style

- Bottom-banner Remix CTA glyph switched to **shuffle** (Lucide
  `Shuffle` path data). Matches the same action's rendering in the
  mobile shell (`SF Symbol shuffle` on iOS, `Ionicons shuffle-outline`
  on Android), so the Remix glyph reads identically wherever a user
  encounters it.

## [0.13.0] - 2026-05-08

Bundles the changes intended for 0.12.0 (never published) with the 0.13 work.

### Added
- `HelloEnvelope.apiBase` (top-level, optional). Hosts inject the Eazo platform URL they target; the SDK routes its own platform calls through it. Internal — not exposed via `DeviceContext`.
- `setHostApiBase` private slot in `internal/config.ts`. `getPlatformApiBase()` priority: explicit override → host-injected → env-name list → default.
- `<EazoProvider appId={...}>` prop. Recommended path on Next.js / Remix: read `process.env.EAZO_APP_ID` from a Server Component, pass via prop. No `NEXT_PUBLIC_*` alias needed.
- `auth.requestLogout` RPC. Mobile delegates `auth.logout()` to the host instead of clearing local session unilaterally.

### Changed (breaking)
- **`DeviceContext.backendUrl` removed.** Apps that read `device.backendUrl` (via `useEazo` or `device.getContext()`) get a TypeScript error. The platform URL is now an SDK-internal concern, surfaced only through `getPlatformApiBase()`.
- **`appId` is configured via `<EazoProvider appId>` or `setAppId()`** rather than `auth.configure({ appId })`. Env-name fallback (`EAZO_APP_ID` plus `NEXT_PUBLIC_EAZO_APP_ID` / `EXPO_PUBLIC_EAZO_APP_ID` / `VITE_EAZO_APP_ID` / `PUBLIC_EAZO_APP_ID` / `REACT_APP_EAZO_APP_ID`) kept as a safety net.
- `getApiBase` → `getPlatformApiBase`. `DEFAULT_API_BASE` → `DEFAULT_PLATFORM_API_BASE`. Renamed across all capabilities (`auth`, `share`, `storage`, `memory`, `ai`) and `auth-primitive`.

### Removed
- The duplicated `getApiBase()` helper that lived in `server.ts`; `notifications.publish` now uses the shared `getPlatformApiBase()`.

## [0.11.0] - 2026-04-30

### Added
- `memory.reportAction` is forwarded to the mobile host as a fire-and-forget side-channel (in addition to the existing `/api/open/gum/action` HTTP POST). Mobile uses this to react to user actions inside an embedded app without polling Gum.
- `notifications` capability — frontend RPCs (`subscribe`, `unsubscribe`, `isSubscribed`) routed through the host bridge; web fallback resolves `{ subscribed: false }`.
- `notifications.publish` server helper exported from `@eazo/sdk/server`. Signs an ES256K JWT with `EAZO_PRIVATE_KEY` and POSTs `/api/open/notifications/publish`. Throws `EazoNotificationPublishError` on platform errors.

## [0.10.0] - 2026-04-29

### Removed (breaking)
- `DeviceContext.safeArea` and the `device.safeArea.changed` event. Apps reach for `env(safe-area-inset-*)` / `100dvh` for native edge-to-edge layout.
- `useSafeAreaCssVars` hook in `<EazoProvider>`. The `--eazo-safe-area-top` / `--eazo-safe-area-bottom` CSS custom properties are no longer published.

## [0.9.0] - 2026-04-28

### Changed (breaking)
- **`ready` envelope: `publicKey` → `appId`.** Apps no longer ship the developer ECC public key over the bridge; the host receives the Eazo `appId` and resolves the keypair backend-side. `EazoAuthClientConfig` accepts `appId` instead of `publicKey`.

## [0.8.1] - 2026-04-27

### Removed
- `share.configure({ downloadUrl })`. The web download CTA's URL is now hard-coded to the platform default; configuration was unused.

## [0.8.0] - 2026-04-26

### Added
- `memory` capability — Gum memory service client (sessions, messages, contextual memory, user action events). Shared between mobile and web paths.

## [0.7.0] - 2026-04-25

### Added
- `ai` capability — OpenAI-compatible signature routing through the Eazo platform AI gateway.

## [0.6.0] - 2026-04-24

### Added
- `storage` capability — presigned S3 upload / download (`storage.upload`, `storage.getCredentials`).

## [0.5.0] - 2026-04-22

### Added
- `auth.login(options?)` / `showLogin()` / `hideLogin()` / `loginUIOpen` — unified login entry point. On Eazo Mobile hosts that advertise `auth.requestLogin`, delegates to the native host flow; otherwise renders the SDK-bundled `<LoginUI />` inside the Web context. Idempotent (resolves immediately when already signed in), default 5-minute timeout, cancel surfaces as `DENIED`.
- Bundled `<LoginUI />` mounted automatically by `<EazoProvider>`. Adds `@radix-ui/react-dialog` as a runtime dependency; keeps zero Tailwind / shadcn / lucide coupling (styles injected at runtime, inline SVG icons).
- Protocol v1 additive: `ready` envelope now carries an optional `publicKey` field so hosts can exchange a session token against the app's own developer key without a backend `appId → creator → DeveloperKey` lookup.
- Shared internal config module (`src/internal/config.ts`) backing the publicKey resolver for both the bridge and the auth capability.

### Changed
- Merged `@eazo/auth` primitives into `@eazo/sdk`. `EazoAuthClient` / `EazoAuthServer` / `decrypt` / `decryptUserInfo` are now internal implementation details of the SDK (`src/internal/auth-primitive/`). App code goes through `auth.*` and `requireAuth`.
- Added `authing-js-sdk` and `elliptic` as direct dependencies of `@eazo/sdk` (previously transitive via `@eazo/auth`).
- `fetchWebUserProfile` now extracts `{ user }` from the `/api/user/profile` response envelope and always hits a same-origin path (no longer concatenates `NEXT_PUBLIC_EAZO_API_URL`).

### Removed
- `@eazo/auth` package (source + directory). Repository now ships a single SDK package.
- `EazoAuthClient.loginByEazoMobile()` and `EazoAuthClient.isEazoMobile()` — superseded by the SDK's own host bridge (`auth.login()` routes automatically).

## [0.1.0] - 2026-03-13

### Added
- Initial release of @eazo/node-sdk
- `decrypt()` function for decrypting encrypted data
- `decryptUserInfo()` convenience function for user information
- Support for ECC secp256k1 + AES-256-GCM hybrid encryption
- TypeScript type definitions
- Comprehensive documentation (English and Chinese)
- Unit tests

### Security
- Secure hybrid encryption implementation
- Input validation and error handling
- Private key format validation
