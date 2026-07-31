// RSC variant of `<EazoProvider>`, picked by bundlers via the
// `"react-server"` export condition. In any non-RSC context the
// consumer transparently gets the client provider from `./react`.
//
// Server-side responsibilities, hidden from host apps:
//   1. Read `EAZO_APP_ID` and `EAZO_PLATFORM_API_BASE` from env and
//      forward them to the runtime provider via internal props, since
//      Next.js doesn't inline non-`NEXT_PUBLIC_*` envs into the client.
//   2. Prefetch `PublicAppInfo` so the top banner paints real content
//      on first frame.

import * as React from "react";

import { fetchPublicAppInfo } from "./internal/banner-ui/app-info";
import { readApiBaseFromEnv, readAppIdFromEnv } from "./internal/config";
import { _EazoRuntimeProvider } from "./internal/runtime-provider";

export { useEazo } from "./react";

// `EazoMobile/` is injected by `AppViewerFallback.tsx`; `wv` covers
// generic RN WebViews on Android and some iOS builds. False positives
// just fall back to the client-side fetch, same as pre-SSR behavior.
const MOBILE_WEBVIEW_UA_MARKERS = ["EazoMobile/", " wv)", "(wv;"] as const;

function isMobileWebViewUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  for (const marker of MOBILE_WEBVIEW_UA_MARKERS) {
    if (ua.indexOf(marker) !== -1) return true;
  }
  return false;
}

// `next/headers` is dynamically imported so non-Next RSC runtimes don't
// blow up at load time. Any failure → `null` → prefetch path runs as
// if no UA filter applied.
async function getRequestUserAgent(): Promise<string | null> {
  try {
    // @ts-expect-error - Optional peer; resolved only in Next.js runtimes.
    const headersModule = (await import("next/headers")) as {
      headers: () => Promise<{ get: (name: string) => string | null }>;
    };
    const requestHeaders = await headersModule.headers();
    return requestHeaders.get("user-agent");
  } catch {
    return null;
  }
}

export async function EazoProvider({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const appId = readAppIdFromEnv();
  if (!appId) {
    throw new Error(
      "@eazo/sdk: EAZO_APP_ID is not set. Add it to .env so the SDK can resolve the host app.",
    );
  }
  const apiBase = readApiBaseFromEnv();

  // Skip the prefetch inside Eazo Mobile WebView — the handoff banner is
  // `getHost()`-gated and never renders there.
  let initialAppInfo: import("./internal/banner-ui/app-info").PublicAppInfo | null = null;
  const ua = await getRequestUserAgent();
  if (!isMobileWebViewUserAgent(ua)) {
    initialAppInfo = await fetchPublicAppInfo(appId, { apiBase });
  }

  return (
    <_EazoRuntimeProvider
      appId={appId}
      apiBase={apiBase}
      initialAppInfo={initialAppInfo}
    >
      {children}
    </_EazoRuntimeProvider>
  );
}
