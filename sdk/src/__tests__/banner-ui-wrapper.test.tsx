import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EazoProvider } from "../react";
import { __resetSDK } from "../testing";

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

function removeSDKStyleTags(): void {
  document.getElementById("eazo-sdk-banner-ui")?.remove();
  document.getElementById("eazo-sdk-app-area")?.remove();
}

async function flushHostDetection(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("EazoProvider DOM isolation", () => {
  beforeEach(() => {
    __resetSDK();
    process.env.EAZO_APP_ID = "test";
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    removeSDKStyleTags();
  });

  afterEach(() => {
    __resetSDK();
    delete process.env.EAZO_APP_ID;
    removeRN();
    removeIframe();
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    removeSDKStyleTags();
  });

  it.each([
    ["mobile WebView", installRN],
    ["iframe", installIframe],
    ["plain web", removeRN],
  ])("does not wrap app children in %s", async (_host, installHost) => {
    installHost();
    const { container, unmount } = render(
      <EazoProvider>
        <main data-testid="app-root">app</main>
      </EazoProvider>,
    );

    await flushHostDetection();

    expect(container.querySelector(".eazo-app-area")).toBeNull();
    expect(container.querySelector(".eazo-app-area-scroller")).toBeNull();
    expect(container.querySelector("[data-testid='app-root']")).not.toBeNull();
    unmount();
  });

  it("emits no app-area wrapper or style in SSR markup", () => {
    const markup = renderToString(
      <EazoProvider>
        <main data-testid="app-root">app</main>
      </EazoProvider>,
    );

    expect(markup).not.toContain("eazo-app-area");
    expect(markup).not.toContain("eazo-sdk-app-area");
    expect(markup).toContain('data-testid="app-root"');
  });

  it.each([
    ["mobile WebView", installRN],
    ["iframe", installIframe],
    ["plain web", removeRN],
  ])("does not inject obsolete wrapper CSS in %s", async (_host, installHost) => {
    installHost();
    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );

    await flushHostDetection();

    expect(document.getElementById("eazo-sdk-banner-ui")).toBeNull();
    expect(document.getElementById("eazo-sdk-app-area")).toBeNull();
    unmount();
  });

  it("never renders the retired SDK brand banner", async () => {
    const { container, unmount } = render(
      <EazoProvider>
        <main data-testid="app-root" />
      </EazoProvider>,
    );

    await flushHostDetection();

    expect(container.querySelector(".eazo-handoff-root")).toBeNull();
    expect(container.querySelector(".eazo-banner-root")).toBeNull();
    expect(container.querySelector(".eazo-handoff-overlay")).toBeNull();
    unmount();
  });

  it("leaves existing html classes and styles untouched", async () => {
    const html = document.documentElement;
    html.classList.add("app-owned-class");
    html.style.paddingTop = "12px";
    html.style.setProperty("--eazo-handoff-top", "999px");

    const { unmount } = render(
      <EazoProvider>
        <span />
      </EazoProvider>,
    );

    await flushHostDetection();

    expect(html.classList.contains("app-owned-class")).toBe(true);
    expect(html.classList.contains("eazo-host-web")).toBe(false);
    expect(html.style.paddingTop).toBe("12px");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("999px");

    unmount();
    expect(html.style.paddingTop).toBe("12px");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("999px");
  });
});
