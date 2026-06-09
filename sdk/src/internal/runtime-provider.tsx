"use client";

// Internal runtime provider — receives the resolved `appId` / `apiBase` /
// `initialAppInfo` as required props and mounts the SDK runtime. The
// public `EazoProvider` in `react.tsx` / `react.server.tsx` resolves
// these values from env (and prefetches `PublicAppInfo` on the server)
// and forwards them here. Keeping this layer separate is what lets the
// public `EazoProvider` expose a zero-prop API while still passing the
// SSR-resolved values across the server/client boundary via React props.

import * as React from "react";

import { EazoBrandBanner } from "./banner-ui";
import type { PublicAppInfo } from "./banner-ui/app-info";
import { setInitialAppInfo } from "./banner-ui/initial-info";
import { ensureBannerStylesInjected } from "./banner-ui/styles";
import { getBridge } from "./bootstrap";
import { _bootstrapAuth } from "./capabilities/auth";
import { _bootstrapDevice } from "./capabilities/device";
import { setAppId, setHostApiBase } from "./config";
import { getHost, type Host } from "./env";
import { LoginUI } from "./login-ui";
import { ProfileConsentUI } from "./profile-consent-ui";
import { ShareDownloadModal } from "./share-ui";

export const MountedContext = React.createContext(false);

export function _EazoRuntimeProvider(props: {
  children: React.ReactNode;
  appId: string;
  apiBase: string | null;
  initialAppInfo: PublicAppInfo | null;
}): React.ReactElement {
  setAppId(props.appId);
  // Setter ignores null/empty — calling unconditionally keeps the
  // "clear on Provider unmount with apiBase removed" semantics simple.
  setHostApiBase(props.apiBase);
  setInitialAppInfo(props.initialAppInfo);

  // Inject the banner-ui stylesheet eagerly (before EazoBrandBanner mounts)
  // so the `.eazo-app-area` wrapper has its `display: contents`/active
  // styles ready on first paint. Banner-ui re-injects the same sheet on
  // its own mount; ensureBannerStylesInjected is idempotent via STYLE_ID.
  // The function self-gates on `getHost() === "web"` internally, so in
  // mobile WebView / iframe hosts this is a no-op — no banner CSS ever
  // lands in `document.head`.
  if (typeof document !== "undefined") {
    ensureBannerStylesInjected();
  }

  // Detect the runtime host so banner-related React components don't
  // even mount in mobile WebView / iframe. `null` until the post-mount
  // effect resolves it; treat null as "render the banner UI" so SSR
  // and the first client render emit the same JSX (no hydration mismatch).
  // After the effect resolves on the client:
  //   - web:  `host === "web"`         → banner UI stays mounted
  //   - other: `host === "eazoMobile" | "embeddedIframe"` → unmounts.
  //
  // Banner UI components are SIBLINGS of the .eazo-app-area wrapper, so
  // unmounting them does NOT affect host children — children stay at the
  // same JSX position throughout, no remount.
  const [host, setHost] = React.useState<Host | null>(null);
  React.useEffect(() => {
    // Starting the bridge is idempotent; capability access may have already done so.
    getBridge();
    void _bootstrapAuth();
    void _bootstrapDevice();
    setHost(getHost());
  }, []);
  const showBannerUI = host === null || host === "web";

  return (
    <MountedContext.Provider value={true}>
      {/*
       * Wrap host children in a TWO-LAYER container:
       *
       *   .eazo-app-area              ← outer: containing block (transform)
       *     .eazo-app-area-scroller   ← inner: scroll container (overflow:auto)
       *       {host children}
       *
       * On plain web (where the banners actually render), `<html>` gets
       * the `eazo-host-web` class and both layers receive their active
       * styles:
       *   - outer: `position: fixed` + `transform: translateZ(0)` — the
       *     containing block for host's `position: fixed` descendants,
       *     positioned inside the inter-banner gap.
       *   - inner: `position: absolute; inset: 0; overflow: auto` — the
       *     actual scroll container. No `transform`, so it does NOT
       *     reparent fixed descendants; those resolve up to the outer
       *     and stay visually pinned during scroll.
       *
       * Why TWO layers, not one: a single element that combines
       * `transform: translateZ(0)` AND `overflow: auto` makes browsers
       * translate fixed descendants by the wrapper's scroll offset —
       * sticky CTAs end up scrolling with content instead of staying
       * pinned. Splitting the responsibilities fixes that.
       *
       * In mobile WebView / iframe the `eazo-host-web` class is never
       * added; both layers fall back to `display: contents`, which
       * REMOVES their boxes from layout entirely. Host children
       * participate in the grandparent's layout context as if the
       * wrapper elements didn't exist — no containing block, no scroll
       * container, no `window.scrollY` redirection, no `position: fixed`
       * reparenting. The wrapper is fully transparent to mobile/iframe
       * hosts; the React tree just carries two extra elements that
       * generate no boxes.
       *
       * BREAKING semantics on PLAIN WEB (also in CHANGELOG):
       *   - `window.scrollY` / `window` scroll events no longer reflect
       *     host content scrolling — read from `.eazo-app-area-scroller`.
       *   - `document.body { overflow: hidden }` no longer locks scroll;
       *     body-scroll-lock libraries must target the scroller.
       *   - Host modals at `position: fixed; inset: 0` are contained to
       *     the outer wrapper rather than covering the full viewport.
       */}
      <div className="eazo-app-area">
        <div className="eazo-app-area-scroller">{props.children}</div>
      </div>
      <ProfileConsentUI />
      {showBannerUI && (
        <>
          <EazoBrandBanner />
          <LoginUI />
          <ShareDownloadModal />
        </>
      )}
    </MountedContext.Provider>
  );
}
