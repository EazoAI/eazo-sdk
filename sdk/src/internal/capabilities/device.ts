import type { DeviceContext } from "../../types";
import { getBridge, waitForBootstrap } from "../bootstrap";
import { DEVICE_CHANGED_EVENT } from "../bridge/protocol";
import { setHostApiBase } from "../config";
import { setDevice, store } from "../store";

function webDefaults(): DeviceContext {
  const locale =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  return {
    platform: "web",
    locale,
  };
}

let bootstrapPromise: Promise<void> | null = null;

export function __resetDeviceCapability(): void {
  bootstrapPromise = null;
}

export function _bootstrapDevice(): Promise<void> {
  return ensureBootstrap();
}

function ensureBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    setDevice(webDefaults());
    const hello = await waitForBootstrap();
    if (!hello) return;
    setHostApiBase(hello.apiBase ?? null);
    setDevice(hello.device);

    // Host may push runtime device changes (e.g. the Creator switching the
    // preview language). Merge the patch into the store so `useEazo(s =>
    // s.device.*)` consumers re-render without an app reload.
    const bridge = getBridge();
    bridge?.on(DEVICE_CHANGED_EVENT, (payload) => {
      if (!payload || typeof payload !== "object") return;
      setDevice(payload as Partial<DeviceContext>);
    });
  })();
  return bootstrapPromise;
}

export const device = {
  get platform(): DeviceContext["platform"] {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.platform;
  },

  get locale(): string {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.locale;
  },

  getContext(): DeviceContext {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device;
  },
};
