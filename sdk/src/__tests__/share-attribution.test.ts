import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setAppId, setHostApiBase } from "../internal/config";
import { resolveBannerCta } from "../internal/banner-ui/store-links";
import {
  appendCurrentShareAttribution,
  getCurrentShareAttribution,
  trackShareAttribution,
} from "../internal/banner-ui/share-attribution";
import { __resetSDK } from "../testing";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
  };
}

function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
}

function setUrl(url: string): void {
  window.history.pushState({}, "", url);
}

describe("share attribution handoff", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    __resetSDK();
    Object.defineProperty(window, "localStorage", {
      value: createStorage(),
      configurable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: createStorage(),
      configurable: true,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    setAppId("app_123");
    setHostApiBase("https://portal.example");
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    setUrl(
      "/?entry_source=share_link&entry_source_id=shr_123&share_channel=copy&inviter_user_id=user_inviter&product_name=creator_web&utm_source=copy_link&utm_medium=share&utm_campaign=app_share",
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __resetSDK();
  });

  it("parses and normalizes canonical share attribution from the current URL", () => {
    expect(getCurrentShareAttribution()).toEqual({
      entry_source: "share_link",
      entry_source_id: "shr_123",
      share_channel: "copy_link",
      inviter_user_id: "user_inviter",
      ptnr: undefined,
      utm_source: "copy_link",
      utm_medium: "share",
      utm_campaign: "app_share",
      product_name: "creator_web",
      app_id: "app_123",
    });
  });

  it("appends attribution to iOS deeplink and fallback URL", () => {
    const cta = resolveBannerCta({
      fallbackUrl:
        "https://creator.eazo.ai/?intent=remix&source_app_id=app_123",
      query: { intent: "remix" },
    });

    expect(cta.href).toContain("eazo://app/app_123?");
    expect(cta.href).toContain("intent=remix");
    expect(cta.href).toContain("entry_source=share_link");
    expect(cta.href).toContain("share_channel=copy_link");
    expect(cta.href).toContain("product_name=creator_web");
    expect(cta.storeUrl).toContain("https://creator.eazo.ai/");
    expect(cta.storeUrl).toContain("intent=remix");
    expect(cta.storeUrl).toContain("source_app_id=app_123");
    expect(cta.storeUrl).toContain("entry_source_id=shr_123");
  });

  it("appends attribution to Android intent fallback", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)");

    const cta = resolveBannerCta({
      fallbackUrl:
        "https://creator.eazo.ai/?intent=remix&source_app_id=app_123",
      query: { intent: "remix" },
    });

    expect(cta.href).toContain("intent://app/app_123?");
    expect(cta.href).toContain("intent=remix");
    expect(cta.href).toContain("entry_source=share_link");
    expect(decodeURIComponent(cta.href)).toContain(
      "S.browser_fallback_url=https://creator.eazo.ai/?intent=remix&source_app_id=app_123",
    );
  });

  it("adds explicit CTA query parameters without share attribution", () => {
    setUrl("/");

    const cta = resolveBannerCta({
      fallbackUrl:
        "https://creator.eazo.ai/?intent=remix&source_app_id=app_123",
      query: { intent: "remix" },
    });

    expect(cta.href).toBe("eazo://app/app_123?intent=remix");
    expect(cta.storeUrl).toBe(
      "https://creator.eazo.ai/?intent=remix&source_app_id=app_123",
    );
  });

  it("tracks share attribution to portal without blocking navigation", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    trackShareAttribution("open_app_click", {
      appName: "Habit Tracker",
      targetUrl: "eazo://app/app_123?entry_source_id=shr_123",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://portal.example/api/analytics/share-attribution",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Eazo-Client-Context": expect.any(String),
        }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual(
      expect.objectContaining({
        action: "open_app_click",
        product_name: "creator_web",
        entry_source: "share_link",
        entry_source_id: "shr_123",
        share_channel: "copy_link",
        inviter_user_id: "user_inviter",
        app_id: "app_123",
        app_name: "Habit Tracker",
      }),
    );
  });

  it("leaves URLs unchanged when the current page has no share attribution", () => {
    setUrl("/");
    expect(appendCurrentShareAttribution("https://creator.eazo.ai/")).toBe(
      "https://creator.eazo.ai/",
    );
  });
});
