import { __resetBootstrap } from "./internal/bootstrap";
import { __resetAuthCapability } from "./internal/capabilities/auth";
import { __resetDeviceCapability } from "./internal/capabilities/device";
import { __resetShareCapability } from "./internal/capabilities/share";
import { __resetConfig } from "./internal/config";
import { __resetSendAnonymousDataCache } from "./internal/app-info";
import { store } from "./internal/store";

/**
 * Test helpers. NOT for production code paths.
 *
 *   import { __resetSDK } from "@eazo/sdk/testing";
 *   afterEach(() => __resetSDK());
 */

export function __resetSDK(): void {
  __resetAuthCapability();
  __resetDeviceCapability();
  __resetShareCapability();
  __resetBootstrap();
  __resetConfig();
  __resetSendAnonymousDataCache();
  store.reset();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("eazo.session");
    } catch {
      /* ignore */
    }
  }
}

/**
 * Dispatches a fake message on the window. Use to simulate host → app envelopes
 * in tests that don't mount a real RN WebView.
 */
export function __dispatchHostMessage(envelope: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new MessageEvent("message", { data: envelope }));
}
