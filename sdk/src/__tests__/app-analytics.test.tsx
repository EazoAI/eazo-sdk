import { render } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_ANALYTICS_SRC, loadAppAnalytics } from "../internal/app-analytics";
import { EazoProvider } from "../react";
import { __resetSDK } from "../testing";

interface TestWindow {
  ReactNativeWebView?: unknown;
  EAZO_APP_ANALYTICS?: boolean;
  EazoAppAnalytics?: { start: (options: { appId: string }) => boolean };
}

const testWindow = window as unknown as TestWindow;

function analyticsScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-eazo-app-analytics]"));
}

function setUrl(url: string): void {
  window.location.href = url;
}

describe("app analytics loader", () => {
  beforeEach(() => {
    __resetSDK();
    setUrl("https://shop.eazo.dev/products/necklace");
  });

  afterEach(() => {
    analyticsScripts().forEach((script) => script.remove());
    delete testWindow.ReactNativeWebView;
    delete testWindow.EAZO_APP_ANALYTICS;
    delete testWindow.EazoAppAnalytics;
    Object.defineProperty(window, "parent", { configurable: true, value: window });
    delete process.env.EAZO_APP_ID;
    __resetSDK();
    setUrl("http://localhost:3000/");
  });

  it("injects the hosted script once with the app id and api base", () => {
    loadAppAnalytics({ appId: "app_1", apiBase: "https://staging.eazo.ai" });
    loadAppAnalytics({ appId: "app_1", apiBase: "https://staging.eazo.ai" });

    const scripts = analyticsScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(APP_ANALYTICS_SRC);
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].dataset.eazoAppId).toBe("app_1");
    expect(scripts[0].dataset.apiBase).toBe("https://staging.eazo.ai");
  });

  it("omits the api base so the script uses its default", () => {
    loadAppAnalytics({ appId: "app_1", apiBase: null });
    expect(analyticsScripts()[0].dataset.apiBase).toBeUndefined();
  });

  it("starts an already loaded script instead of injecting another one", () => {
    const start = vi.fn(() => true);
    testWindow.EazoAppAnalytics = { start };
    loadAppAnalytics({ appId: "app_1" });
    expect(start).toHaveBeenCalledWith({ appId: "app_1" });
    expect(analyticsScripts()).toHaveLength(0);
  });

  it.each([
    ["the Eazo Mobile WebView", () => { testWindow.ReactNativeWebView = {}; }],
    ["an iframe embed", () => {
      Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: () => undefined } });
    }],
    ["an opt-out", () => { testWindow.EAZO_APP_ANALYTICS = false; }],
    ["localhost", () => setUrl("http://localhost:3000/")],
    ["a .local host", () => setUrl("http://my-mac.local:3000/")],
  ])("does not load in %s", (_label, arrange) => {
    arrange();
    loadAppAnalytics({ appId: "app_1" });
    expect(analyticsScripts()).toHaveLength(0);
  });

  it("is loaded by EazoProvider on a top-level page", () => {
    process.env.EAZO_APP_ID = "app_provider";
    render(<EazoProvider><div>app</div></EazoProvider>);
    const [script] = analyticsScripts();
    expect(script?.dataset.eazoAppId).toBe("app_provider");
  });
});
