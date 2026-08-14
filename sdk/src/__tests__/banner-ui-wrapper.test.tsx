import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EazoProvider } from "../react";
import { __resetSDK } from "../testing";

/**
 * Regression coverage for the `.eazo-app-area` wrapper + banner-UI
 * mounting behaviour. The contract under test:
 *
 *   1. Wrapper markup (`.eazo-app-area` + `.eazo-app-area-scroller`)
 *      ALWAYS renders — both layers — so SSR/CSR markup is identical
 *      across hosts and there's no hydration mismatch.
 *
 *   2. Outside plain web, the wrappers provide one definite viewport-height
 *      chain without taking over scrolling. This keeps `height: 100%` app
 *      roots visible even when the host body only has `min-height: 100%`.
 *      Plain web replaces that baseline with the banner-safe fixed area.
 *
 *   3. Banner-related React components (`<EazoBrandBanner />`,
 *      `<LoginUI />`, `<ShareDownloadModal />`) are NOT mounted in
 *      mobile WebView / iframe hosts. The provider strips them from the
 *      tree once host detection settles, so no store subscriptions,
 *      effects, or DOM nodes for those components exist in mobile.
 *
 *   4. The banner-UI stylesheet is NOT injected into `document.head` in
 *      mobile/iframe hosts — `ensureBannerStylesInjected()` self-gates
 *      on `getHost() === "web"`.
 *
 *   5. `<html>` itself sees no class, padding, or CSS-var pollution in
 *      mobile/iframe hosts.
 *
 *   6. On plain-web, the top banner renders but the center handoff modal
 *      stays disabled (`MODAL_ENABLED=false`).
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

function installIframe(): void {
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: () => undefined },
  });
}

function removeIframe(): void {
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: window,
  });
}

// Drop any banner-CSS <style> tag a previous test/run may have left in
// the document head — `ensureBannerStylesInjected` is idempotent, but
// we need a clean slate to assert that mobile hosts truly DON'T inject.
function removeBannerStyleTag(): void {
  const tag = document.getElementById("eazo-sdk-banner-ui");
  if (tag) tag.remove();
}

function removeAppAreaStyleTag(): void {
  const tag = document.getElementById("eazo-sdk-app-area");
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
    removeAppAreaStyleTag();
  });

  afterEach(() => {
    __resetSDK();
    delete process.env.EAZO_APP_ID;
    removeRN();
    removeIframe();
    document.documentElement.classList.remove("eazo-host-web");
    document.documentElement.style.cssText = "";
    removeBannerStyleTag();
    removeAppAreaStyleTag();
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

  it("includes layout-neutral wrapper CSS in SSR markup before the wrappers", () => {
    installRN();
    const markup = renderToString(
      <EazoProvider>
        <div data-testid="host-child">hello</div>
      </EazoProvider>,
    );

    const stylePosition = markup.indexOf('id="eazo-sdk-app-area"');
    const wrapperPosition = markup.indexOf('class="eazo-app-area"');
    expect(stylePosition).toBeGreaterThanOrEqual(0);
    expect(wrapperPosition).toBeGreaterThan(stylePosition);
  });

  it("does NOT set eazo-host-web on <html> in the mobile WebView host", async () => {
    installRN();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    // Let the banner-ui mount effect (and any setTimeout/microtasks it
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

  it("gives percentage-height apps a definite mobile viewport without taking over scrolling", async () => {
    installRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // The all-host wrapper stylesheet must establish a definite height
    // chain, while the web banner stylesheet remains absent.
    expect(document.getElementById("eazo-sdk-banner-ui")).toBeNull();
    const appAreaStyle = document.getElementById("eazo-sdk-app-area");
    const outer = container.querySelector(".eazo-app-area");
    const scroller = container.querySelector(".eazo-app-area-scroller");
    expect(outer).not.toBeNull();
    expect(scroller).not.toBeNull();
    expect(appAreaStyle?.textContent).toContain("height: 100dvh");
    expect(appAreaStyle?.textContent).toContain("flex: 0 0 auto");
    expect(appAreaStyle?.textContent).toContain("overflow: visible");
    expect(window.getComputedStyle(outer as Element).display).toBe("block");
    expect(window.getComputedStyle(scroller as Element).display).toBe("block");
    unmount();
  });

  it("gives iframe apps the same definite viewport-height chain", async () => {
    installIframe();
    const { container, unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const outer = container.querySelector(".eazo-app-area");
    const scroller = container.querySelector(".eazo-app-area-scroller");
    expect(outer).not.toBeNull();
    expect(scroller).not.toBeNull();
    expect(window.getComputedStyle(outer as Element).display).toBe("block");
    expect(window.getComputedStyle(scroller as Element).display).toBe("block");
    expect(document.getElementById("eazo-sdk-app-area")?.textContent).toContain(
      "height: 100dvh",
    );
    expect(document.getElementById("eazo-sdk-banner-ui")).toBeNull();
    expect(document.documentElement.classList.contains("eazo-host-web")).toBe(
      false,
    );
    unmount();
  });

  it("does NOT mount banner-UI React components in the mobile WebView host", async () => {
    installRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span data-testid="host-child" />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // EazoBrandBanner renders a `<div class="eazo-handoff-root">` once
    // it has finished its mount work. In mobile we expect it to have
    // been stripped from the tree by EazoProvider's post-mount host
    // detection — so the root marker must not exist.
    expect(container.querySelector(".eazo-handoff-root")).toBeNull();
    // Sanity: host children are still rendered (they live inside the
    // always-rendered wrapper layers).
    expect(container.querySelector("[data-testid='host-child']")).not.toBeNull();
    unmount();
  });

  it("DOES inject the banner-ui stylesheet into <head> on plain-web hosts", async () => {
    removeRN();
    const { container, unmount } = render(
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
    // The mobile baseline has an explicit viewport height. Plain web must
    // reset it so `inset` — not 100dvh — defines the area below the banner.
    expect(styleTag?.textContent).toContain("height: auto");
    expect(styleTag?.textContent).toContain("min-height: 0");
    const outer = container.querySelector(".eazo-app-area");
    const scroller = container.querySelector(".eazo-app-area-scroller");
    expect(window.getComputedStyle(outer as Element).display).toBe("block");
    expect(window.getComputedStyle(outer as Element).position).toBe("fixed");
    expect(window.getComputedStyle(scroller as Element).display).toBe("block");
    expect(window.getComputedStyle(scroller as Element).position).toBe(
      "absolute",
    );
    unmount();
  });

  it("mounts the top banner but NOT the center handoff modal on plain-web hosts", async () => {
    removeRN();
    const { container, unmount } = render(
      <EazoProvider>
        <span data-testid="host-child" />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector(".eazo-handoff-root")).not.toBeNull();
    expect(container.querySelector(".eazo-banner-root")).not.toBeNull();
    expect(container.querySelector(".eazo-handoff-overlay")).toBeNull();
    expect(container.querySelector(".eazo-modal")).toBeNull();
    unmount();
  });

  it("sets eazo-host-web + handoff CSS vars on <html> in plain-web host, and clears them on unmount", async () => {
    // No RN bridge installed → getHost() === "web".
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
    expect(html.classList.contains("eazo-host-web")).toBe(true);
    expect(html.style.paddingTop).not.toBe("");
    // No bottom banner anymore → no bottom padding is reserved, but the
    // `--eazo-handoff-bottom` var is still published (pinned to 0px) so
    // host code reading it without a fallback gets a valid length.
    expect(html.style.paddingBottom).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).not.toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("0px");

    unmount();
    expect(html.classList.contains("eazo-host-web")).toBe(false);
    expect(html.style.paddingTop).toBe("");
    expect(html.style.paddingBottom).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("");
  });

  it("restores prior <html> CSS-var values on unmount instead of leaking the SDK's", async () => {
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
    // While mounted, SDK overwrites to its own height.
    expect(html.style.getPropertyValue("--eazo-handoff-top")).not.toBe("999px");

    unmount();
    // After unmount, the previous host value is restored, not removed.
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("999px");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("888px");
  });
});
