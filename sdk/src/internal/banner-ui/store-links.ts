import { getAppId } from "../config";
import {
  appendCurrentShareAttribution,
  buildShareAttributionQuery,
} from "./share-attribution";

// TODO(banner): replace placeholders once the iOS App Store ID and Android
// package name are confirmed by the mobile team. Until then, all platforms
// fall back to the marketing site so users never hit a 404.
export const APP_STORE_URL = "https://eazo.ai/";
export const PLAY_STORE_URL = "https://eazo.ai/";
export const MARKETING_URL = "https://eazo.ai/";

// Eazo Mobile Android package. Mirrors `android.package` in
// `eazo-mobile/app.json`. Used to build the Chrome intent URL so the
// browser tries to open the installed app first.
const ANDROID_PACKAGE = "ai.eazo.portal";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function resolveStoreUrl(): string {
  if (typeof navigator === "undefined") return MARKETING_URL;
  const platform = detectPlatform(navigator.userAgent);
  if (platform === "ios") return appendCurrentShareAttribution(APP_STORE_URL);
  if (platform === "android") return appendCurrentShareAttribution(PLAY_STORE_URL);
  return appendCurrentShareAttribution(MARKETING_URL);
}

export interface BannerCta {
  /** URL the CTA's `<a>` navigates to. */
  href: string;
  /** Store URL to fall back to when the deeplink doesn't open the app. */
  storeUrl: string;
  /**
   * Whether the caller must run a JS timeout to detect "app not installed"
   * and navigate to `storeUrl` itself. True on iOS (Safari has no native
   * fallback for unhandled custom schemes); false on Android (Chrome's
   * `intent://` URL carries its own `browser_fallback_url`) and desktop
   * (no app-open attempt to fall back from).
   */
  needsTimeoutFallback: boolean;
}

export interface BannerCtaOptions {
  fallbackUrl?: string;
  query?: Readonly<Record<string, string | null | undefined>>;
}

function buildBannerQuery(
  extra: BannerCtaOptions["query"],
): string {
  const params = new URLSearchParams(buildShareAttributionQuery().replace(/^\?/, ""));
  for (const [key, value] of Object.entries(extra ?? {})) {
    const normalized = value?.trim();
    if (normalized) params.set(key, normalized);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Per-platform plan for the banner CTA. Uses Eazo Mobile's registered
 * custom scheme `eazo://` (declared in `eazo-mobile/app.json#scheme`),
 * which doesn't require any path-specific AASA / App Links entry.
 *
 * When an appId is configured (the normal case under the `<EazoProvider>`
 * convention), the URL carries `app/<appId>` as its path so the mobile
 * shell knows which app to push — `eazo-mobile/+native-intent.tsx`
 * whitelists this prefix to skip expo-router's default reset, and
 * `RootIntentObserver` then issues `router.push('/app/<appId>')` on top
 * of the existing stack. A missing appId falls back to bare `eazo://`,
 * which just foregrounds the app on its current screen.
 *
 * - **iOS**: `eazo://app/<appId>`. If the app is installed Safari opens
 *   it and the page is backgrounded; otherwise Safari shows a "Cannot
 *   open" toast and the page stays visible — the caller's JS timeout
 *   then navigates to the fallback URL.
 * - **Android**: Chrome `intent://app/<appId>#Intent;scheme=eazo;…;end`.
 *   Chrome opens the app when installed (launch URL becomes
 *   `eazo://app/<appId>`) and navigates to `browser_fallback_url`
 *   natively when not. No JS timeout needed.
 * - **Desktop**: just the fallback URL; no app-open attempt.
 *
 * `options.fallbackUrl` overrides where every platform lands when the app
 * doesn't open — the iOS `storeUrl`, the Android `browser_fallback_url`,
 * and the desktop `href`. Defaults to the platform store / marketing
 * site. The "Remix" CTA passes the creator portal here, for example.
 */
export function resolveBannerCta(
  options: BannerCtaOptions = {},
): BannerCta {
  const fallbackUrl = options.fallbackUrl
    ? appendCurrentShareAttribution(options.fallbackUrl)
    : undefined;
  if (typeof navigator === "undefined") {
    const url = fallbackUrl ?? MARKETING_URL;
    return { href: url, storeUrl: url, needsTimeoutFallback: false };
  }
  const platform = detectPlatform(navigator.userAgent);
  const appId = getAppId();
  const query = buildBannerQuery(options.query);
  const path = appId ? `app/${encodeURIComponent(appId)}${query}` : query;
  if (platform === "ios") {
    const storeUrl = fallbackUrl ?? appendCurrentShareAttribution(APP_STORE_URL);
    return {
      href: `eazo://${path}`,
      storeUrl,
      needsTimeoutFallback: true,
    };
  }
  if (platform === "android") {
    const storeUrl = fallbackUrl ?? appendCurrentShareAttribution(PLAY_STORE_URL);
    const fallback = encodeURIComponent(storeUrl);
    return {
      href: `intent://${path}#Intent;scheme=eazo;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
      storeUrl,
      needsTimeoutFallback: false,
    };
  }
  const url = fallbackUrl ?? appendCurrentShareAttribution(MARKETING_URL);
  return { href: url, storeUrl: url, needsTimeoutFallback: false };
}
