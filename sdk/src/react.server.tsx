// RSC variant of `<EazoProvider>`, picked by bundlers via the
// `"react-server"` export condition. In any non-RSC context the
// consumer transparently gets the client provider from `./react`.
//
// Server-side responsibilities, hidden from host apps:
//   1. Read `EAZO_APP_ID` and `EAZO_PLATFORM_API_BASE` from env and
//      forward them to the runtime provider via internal props, since
//      Next.js doesn't inline non-`NEXT_PUBLIC_*` envs into the client.

import * as React from "react";

import { readApiBaseFromEnv, readAppIdFromEnv } from "./internal/config";
import { _EazoRuntimeProvider } from "./internal/runtime-provider";

export { useEazo } from "./react";

export function EazoProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const appId = readAppIdFromEnv();
  if (!appId) {
    throw new Error(
      "@eazo/sdk: EAZO_APP_ID is not set. Add it to .env so the SDK can resolve the host app.",
    );
  }
  const apiBase = readApiBaseFromEnv();

  return (
    <_EazoRuntimeProvider
      appId={appId}
      apiBase={apiBase}
    >
      {children}
    </_EazoRuntimeProvider>
  );
}
