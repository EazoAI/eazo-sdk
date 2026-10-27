import { getHost, isBrowser } from "./env";

/**
 * Hosted Eazo app analytics script. It reports deployment-domain opens /
 * sessions through the Eazo platform API and `$pageview` through PostHog,
 * with the same anonymous attribution as the brand banner. It is updated on
 * the CDN, so apps pick up changes without a new SDK release.
 */
export const APP_ANALYTICS_SRC = "https://cdn.eazo.ai/branding/eazo-app-analytics.js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

interface AppAnalyticsWindow {
  EAZO_APP_ANALYTICS?: boolean;
  EazoAppAnalytics?: { start: (options: { appId: string }) => boolean };
}

function isLocalDevelopmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local");
}

/**
 * Loads the analytics script once for a top-level browser page. Eazo Mobile
 * WebViews and iframe embeds report their own sessions, and local
 * development servers are skipped so `next dev` traffic stays out of
 * production analytics. Set `window.EAZO_APP_ANALYTICS = false` to opt out.
 */
export function loadAppAnalytics(options: { appId: string; apiBase?: string | null }): void {
  if (!isBrowser() || typeof document === "undefined") return;
  if (getHost() !== "web") return;
  const win = window as unknown as AppAnalyticsWindow;
  if (win.EAZO_APP_ANALYTICS === false) return;
  if (isLocalDevelopmentHost(window.location.hostname)) return;

  if (win.EazoAppAnalytics) {
    win.EazoAppAnalytics.start({ appId: options.appId });
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>("script[data-eazo-app-analytics]");
  if (existing) {
    // Mounted by the app itself; hand it the app id once it has loaded.
    existing.addEventListener("load", () => win.EazoAppAnalytics?.start({ appId: options.appId }), {
      once: true,
    });
    return;
  }

  const script = document.createElement("script");
  script.src = APP_ANALYTICS_SRC;
  script.async = true;
  script.dataset.eazoAppAnalytics = "";
  script.dataset.eazoAppId = options.appId;
  if (options.apiBase) script.dataset.apiBase = options.apiBase;
  document.head.appendChild(script);
}
