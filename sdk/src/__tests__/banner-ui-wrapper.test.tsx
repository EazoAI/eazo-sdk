import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EazoProvider } from "../react";
import { __resetSDK } from "../testing";

/**
 * Regression coverage for the `.eazo-app-area` wrapper + web-UI mounting
 * behaviour.
 *
 * The SDK no longer renders its own top web→app handoff banner — branding
 * is delivered by the hosted `eazo-brand-banner.js` drop-in script that
 * the app loads itself. What remains under test:
 *
 *   1. Wrapper markup (`.eazo-app-area` + `.eazo-app-area-scroller`)
 *      ALWAYS renders — both layers — so SSR/CSR markup is identical
 *      across hosts and there's no hydration mismatch.
 *
 *   2. Because the SDK banner was the only thing that added the
 *      `eazo-host-web` class (and the `<html>` padding / handoff CSS
 *      vars), NONE of that is set anymore — in ANY host. The wrapper
 *      layers stay at their default `display: contents` (a layout no-op)
 *      everywhere, so host content flows normally in `<body>` and the
 *      drop-in script owns all banner spacing.
 *
 *   3. Web-only React components (`<LoginUI />`, `<ShareDownloadModal />`)
 *      are NOT mounted in mobile WebView / iframe hosts. The provider
 *      strips them from the tree once host detection settles.
 *
 *   4. The wrapper stylesheet is still injected into `document.head` on
 *      plain-web (it carries the `.eazo-app-area` rules) but NOT in
 *      mobile/iframe hosts — `ensureBannerStylesInjected()` self-gates on
 *      `getHost() === "web"`.
 *
 *   5. The SDK's brand banner (`.eazo-handoff-root` / `.eazo-banner-root`)
 *      is never rendered in any host.
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

// Drop any banner-CSS <style> tag a previous test/run may have left in
// the document head — `ensureBannerStylesInjected` is idempotent, but
// we need a clean slate to assert that mobile hosts truly DON'T inject.
function removeBannerStyleTag(): void {
  const tag = document.getElementById("eazo-sdk-banner-ui");
  if (tag) tag.remove();
}

describe("EazoProvider .eazo-app-area wrapper", () => {
  beforeEach(() => {
    __resetSDK();
    // `<EazoProvider>` reads its appId from env — set one for the tests
    // that exercise mount behaviour.
    process.env.EAZO_APP_ID = "test";
    // Make sure no leftover state from a previous test leaks the class
    // onto <html>.
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
    // Both wrapper layers exist even in the eazoMobile host — only their
    // styles are gated; the markup is always emitted so SSR/CSR hydration
    // matches. Order matters: scroller MUST be a direct child of the
    // outer wrapper, and host children MUST be inside the scroller —
    // that's what the two-layer architecture in styles.ts depends on.
    const outer = container.querySelector(".eazo-app-area");
    expect(outer).not.toBeNull();
    const scroller = container.querySelector(".eazo-app-area-scroller");
    expect(scroller).not.toBeNull();
    // Scroller must be a direct child of the outer wrapper — that
    // nesting is what the two-layer CSS architecture in styles.ts
    // depends on for `position: fixed; bottom: 0` to stay pinned.
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
    // Let the provider's mount effect (and any setTimeout/microtasks it
    // queues) flush so we're not racing the assertion.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.documentElement.classList.contains("eazo-host-web")).toBe(
      false,
    );
    // And no padding / CSS vars leak onto <html> either.
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
    // ensureBannerStylesInjected() self-gates on getHost() === "web". In
    // the mobile host the <style> tag must never appear.
    expect(document.getElementById("eazo-sdk-banner-ui")).toBeNull();
    unmount();
  });

  it("does NOT mount web-UI React components in the mobile WebView host", async () => {
    installRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span data-testid="host-child" />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // The SDK never renders its own brand banner anymore, and the
    // remaining web UI (login / share-download) is stripped from the tree
    // in mobile — so the banner root marker must not exist.
    expect(container.querySelector(".eazo-handoff-root")).toBeNull();
    // Sanity: host children are still rendered (they live inside the
    // always-rendered wrapper layers).
    expect(container.querySelector("[data-testid='host-child']")).not.toBeNull();
    unmount();
  });

  it("DOES inject the wrapper stylesheet into <head> on plain-web hosts", async () => {
    removeRN();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const styleTag = document.getElementById("eazo-sdk-banner-ui");
    expect(styleTag).not.toBeNull();
    // Sanity: it's a <style> with the expected marker attribute.
    expect(styleTag?.tagName).toBe("STYLE");
    expect(styleTag?.getAttribute("data-eazo-sdk")).toBe("banner-ui");
    unmount();
  });

  it("never renders the SDK brand banner on plain-web hosts", async () => {
    removeRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span data-testid="host-child" />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Branding is delivered by the hosted drop-in script, not the SDK —
    // so neither the handoff root nor the top banner ever mount.
    expect(container.querySelector(".eazo-handoff-root")).toBeNull();
    expect(container.querySelector(".eazo-banner-root")).toBeNull();
    expect(container.querySelector(".eazo-handoff-overlay")).toBeNull();
    expect(container.querySelector(".eazo-modal")).toBeNull();
    unmount();
  });

  it("does NOT set eazo-host-web or handoff CSS vars on <html> in plain-web host", async () => {
    // No RN bridge installed → getHost() === "web".
    removeRN();
    const html = document.documentElement;
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // The class + padding + handoff vars were owned by the (now removed)
    // SDK brand banner. With branding delegated to the drop-in script,
    // the SDK leaves `<html>` untouched — the drop-in reserves its own
    // banner space.
    expect(html.classList.contains("eazo-host-web")).toBe(false);
    expect(html.style.paddingTop).toBe("");
    expect(html.style.paddingBottom).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("");
    unmount();
  });

  it("leaves prior <html> CSS-var values untouched on plain-web host", async () => {
    removeRN();
    const html = document.documentElement;
    html.style.setProperty("--eazo-handoff-top", "999px");
    html.style.setProperty("--eazo-handoff-bottom", "888px");

    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // The SDK no longer writes these vars, so a host's own values survive
    // unchanged for the whole lifecycle.
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("999px");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("888px");

    unmount();
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("999px");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("888px");
  });
});
