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

  // Detect the runtime host so web-only React components (login /
  // share-download UI) don't even mount in mobile WebView / iframe.
  // `null` until the post-mount effect resolves it; treat null as
  // "render the web UI" so SSR and the first client render emit the
  // same JSX (no hydration mismatch). After the effect resolves on the
  // client:
  //   - web:  `host === "web"`         → web UI stays mounted
  //   - other: `host === "eazoMobile" | "embeddedIframe"` → unmounts.
  //
  // These UI components are siblings of the app children. The provider
  // deliberately adds no DOM wrapper or layout CSS around the app, so
  // host detection and UI mounting cannot change the app's layout.
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
      {props.children}
      {showWebUI && (
        <>
          <LoginUI />
          <ShareDownloadModal />
        </>
      )}
    </MountedContext.Provider>
  );
}
