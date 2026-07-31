import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EazoProvider } from "../react";
import { __resetSDK } from "../testing";

/**
 * Regression coverage for the `.eazo-app-area` wrapper + web UI mounting
 * behaviour. The contract under test:
 *
 *   1. Wrapper markup (`.eazo-app-area` + `.eazo-app-area-scroller`)
 *      ALWAYS renders — both layers — so SSR/CSR markup is identical
 *      across hosts and there's no hydration mismatch.
 *
 *   2. The web handoff banner is NOT mounted on plain-web hosts.
 *
 *   3. Web-only React components (`<LoginUI />`, `<ShareDownloadModal />`)
 *      are NOT mounted in mobile WebView / iframe hosts. The provider
 *      strips them from the tree once host detection settles.
 *
 *   4. The banner-UI stylesheet is NOT injected into `document.head` in
 *      any host — the handoff banner no longer mounts.
 *
 *   5. `<html>` itself sees no class, padding, or CSS-var pollution in
 *      any host.
 */

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function installRN(): void {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = {
    postMessage: () => undefined,
  };
}

function removeRN(): void {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

function removeBannerStyleTag(): void {
  const tag = document.getElementById("eazo-sdk-banner-ui");
  if (tag) tag.remove();
}

describe("EazoProvider .eazo-app-area wrapper", () => {
  beforeEach(() => {
    __resetSDK();
    process.env.EAZO_APP_ID = "test";
    document.documentElement.classList.remove("eazo-host-web");
    document.documentElement.style.cssText = "";
    removeBannerStyleTag();
  });

  afterEach(() => {
    __resetSDK();
    delete process.env.EAZO_APP_ID;
    removeRN();
    document.documentElement.classList.remove("eazo-host-web");
    document.documentElement.style.cssText = "";
    removeBannerStyleTag();
  });

  it("renders both wrapper layers around children regardless of host", () => {
    installRN();
    const { container, unmount } = render(
      <EazoProvider>
        <div data-testid="host-child">hello</div>
      </EazoProvider>,
    );
    const outer = container.querySelector(".eazo-app-area");
    expect(outer).not.toBeNull();
    const scroller = container.querySelector(".eazo-app-area-scroller");
    expect(scroller).not.toBeNull();
    expect(scroller?.parentElement).toBe(outer);
    expect(scroller?.querySelector("[data-testid='host-child']")).not.toBeNull();
    unmount();
  });

  it("does NOT set eazo-host-web on <html> in the mobile WebView host", async () => {
    installRN();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.documentElement.classList.contains("eazo-host-web")).toBe(
      false,
    );
    expect(document.documentElement.style.paddingTop).toBe("");
    expect(document.documentElement.style.paddingBottom).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--eazo-handoff-top"),
    ).toBe("");
    unmount();
  });

  it("does NOT inject the banner-ui stylesheet into <head> in the mobile WebView host", async () => {
    installRN();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.getElementById("eazo-sdk-banner-ui")).toBeNull();
    unmount();
  });

  it("does NOT mount the handoff banner in the mobile WebView host", async () => {
    installRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span data-testid="host-child" />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector(".eazo-handoff-root")).toBeNull();
    expect(container.querySelector("[data-testid='host-child']")).not.toBeNull();
    unmount();
  });

  it("does NOT inject the banner-ui stylesheet into <head> on plain-web hosts", async () => {
    removeRN();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.getElementById("eazo-sdk-banner-ui")).toBeNull();
    unmount();
  });

  it("does NOT mount the handoff banner on plain-web hosts", async () => {
    removeRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span data-testid="host-child" />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector(".eazo-handoff-root")).toBeNull();
    expect(container.querySelector("[data-testid='host-child']")).not.toBeNull();
    unmount();
  });

  it("does NOT set eazo-host-web or handoff CSS vars on <html> in plain-web host", async () => {
    removeRN();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const html = document.documentElement;
    expect(html.classList.contains("eazo-host-web")).toBe(false);
    expect(html.style.paddingTop).toBe("");
    expect(html.style.paddingBottom).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("");
    unmount();
  });
});
