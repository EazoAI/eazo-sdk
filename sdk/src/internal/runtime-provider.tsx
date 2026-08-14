"use client";

// Internal runtime provider — receives the resolved `appId` / `apiBase` /
// `initialAppInfo` as required props and mounts the SDK runtime. The
// public `EazoProvider` in `react.tsx` / `react.server.tsx` resolves
// these values from env (and prefetches `PublicAppInfo` on the server)
// and forwards them here. Keeping this layer separate is what lets the
// public `EazoProvider` expose a zero-prop API while still passing the
// SSR-resolved values across the server/client boundary via React props.

import * as React from "react";

import type { PublicAppInfo } from "./banner-ui/app-info";
import { setInitialAppInfo } from "./banner-ui/initial-info";
import { ensureBannerStylesInjected } from "./banner-ui/styles";
import { getBridge } from "./bootstrap";
import { _bootstrapAuth } from "./capabilities/auth";
import { _bootstrapDevice } from "./capabilities/device";
import { setAppId, setHostApiBase } from "./config";
import { getHost, type Host } from "./env";
import { LoginUI } from "./login-ui";
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

  // Inject the wrapper stylesheet eagerly so the `.eazo-app-area`
  // wrapper has its default `display: contents` styling ready on first
  // paint. `ensureBannerStylesInjected` is idempotent via STYLE_ID and
  // self-gates on `getHost() === "web"`, so in mobile WebView / iframe
  // hosts this is a no-op — no wrapper CSS ever lands in `document.head`.
  // The SDK no longer renders its own brand banner; the active wrapper
  // styles (gated on `html.eazo-host-web`) therefore stay dormant, but
  // the sheet is still injected so the markup keeps its base rules.
  if (typeof document !== "undefined") {
    ensureBannerStylesInjected();
  }

  // Detect the runtime host so web-only React components (login /
  // share-download UI) don't even mount in mobile WebView / iframe.
  // `null` until the post-mount effect resolves it; treat null as
  // "render the web UI" so SSR and the first client render emit the
  // same JSX (no hydration mismatch). After the effect resolves on the
  // client:
  //   - web:  `host === "web"`         → web UI stays mounted
  //   - other: `host === "eazoMobile" | "embeddedIframe"` → unmounts.
  //
  // These UI components are SIBLINGS of the .eazo-app-area wrapper, so
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
  const showWebUI = host === null || host === "web";

  return (
    <MountedContext.Provider value={true}>
      {/*
       * Wrap host children in a TWO-LAYER container:
       *
       *   .eazo-app-area              ← outer: containing block (transform)
       *     .eazo-app-area-scroller   ← inner: scroll container (overflow:auto)
       *       {host children}
       *
       * The SDK no longer renders its own top web→app handoff banner —
       * branding is now delivered by the hosted `eazo-brand-banner.js`
       * drop-in script (loaded by the app itself), which manages its own
       * banner layout and page spacing. Because the SDK banner was the
       * only thing that set the `eazo-host-web` class on `<html>`, both
       * wrapper layers now stay at `display: contents` (a layout no-op)
       * in every host, so host content flows normally in `<body>`. The
       * wrapper markup is kept so the styling can be re-activated if the
       * SDK ever brings the banner back.
       */}
      <div className="eazo-app-area">
        <div className="eazo-app-area-scroller">{props.children}</div>
      </div>
      {showWebUI && (
        <>
          <LoginUI />
          <ShareDownloadModal />
        </>
      )}
    </MountedContext.Provider>
  );
}
