"use client";

import * as React from "react";

import { readApiBaseFromEnv, readAppIdFromEnv } from "./internal/config";
import { MountedContext, _EazoRuntimeProvider } from "./internal/runtime-provider";
import { store, INITIAL_STATE } from "./internal/store";
import type { EazoState } from "./types";

/**
 * Mounts the SDK runtime. Place once at the root of your React tree.
 *
 *   <EazoProvider>
 *     <App />
 *   </EazoProvider>
 *
 * Zero-config: the SDK auto-reads `EAZO_APP_ID` (and
 * `EAZO_PLATFORM_API_BASE` when set) from env. For non-RSC frameworks
 * (Vite, plain Webpack, etc.) set a framework-prefixed alias the
 * bundler can inline into the client bundle —
 * `NEXT_PUBLIC_EAZO_APP_ID`, `EXPO_PUBLIC_EAZO_APP_ID`,
 * `VITE_EAZO_APP_ID`, etc.
 *
 * Under Next.js App Router this resolves to the server variant
 * (`react.server.tsx`), which prefetches the handoff `PublicAppInfo`
 * during SSR and forwards everything to the runtime via internal props.
 */
export function EazoProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const appId = readAppIdFromEnv();
  if (!appId) {
    throw new Error(
      "@eazo/sdk: EAZO_APP_ID is not set. Add it to .env (or a framework-prefixed variant for SPA bundlers).",
    );
  }
  return (
    <_EazoRuntimeProvider
      appId={appId}
      apiBase={readApiBaseFromEnv()}
      initialAppInfo={null}
    >
      {children}
    </_EazoRuntimeProvider>
  );
}

/**
 * Subscribe to a slice of state. Re-renders only when the selector's
 * return value changes (Object.is).
 *
 *   const user = useEazo(s => s.auth.user);
 *   const { platform, locale } = useEazo(s => s.device);
 */
export function useEazo<T>(selector: (state: EazoState) => T): T {
  const mounted = React.useContext(MountedContext);
  if (process.env.NODE_ENV !== "production" && !mounted) {
    console.warn(
      "[@eazo/sdk] useEazo() called without <EazoProvider>. Mount it at the root of your app.",
    );
  }

  const getSnapshot = React.useCallback(
    () => selector(store.getSnapshot()),
    [selector],
  );
  const getServerSnapshot = React.useCallback(
    () => selector(INITIAL_STATE),
    [selector],
  );

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}
