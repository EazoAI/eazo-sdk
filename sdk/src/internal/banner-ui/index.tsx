"use client";

import * as React from "react";

import { getAppId } from "../config";
import { getHost } from "../env";
import {
  ArrowRightIcon,
  CAPABILITIES,
  CapIcon,
  ChatIcon,
  EazoLogo,
  HeartIcon,
  RemixIcon,
} from "./icons";
import { QrSvg } from "./qr";
import { fetchPublicAppInfo, type PublicAppInfo } from "./app-info";
import { getInitialAppInfo } from "./initial-info";
import { resolveBannerCta, type BannerCta } from "./store-links";
import {
  trackShareAttribution,
  type ShareAttributionAction,
} from "./share-attribution";
import {
  BANNER_HEIGHT_DESKTOP,
  BANNER_HEIGHT_MOBILE,
  ensureBannerStylesInjected,
} from "./styles";

// iOS Safari has no native fallback for an unhandled `eazo://` scheme;
// after this long we assume the app isn't installed and redirect to the
// store. Matches the value in `store-links.ts`.
const IOS_FALLBACK_TIMEOUT_MS = 1500;
const MOBILE_BREAKPOINT_PX = 480;
// Where the "Remix" CTA sends users when the Eazo app doesn't open
// (not installed / desktop) — the web creator portal, where they can
// remix the app in the browser. The primary handoff CTAs keep their
// default store / marketing fallback.
const REMIX_FALLBACK_URL = "https://creator.eazo.ai/";
// Master switch for the center handoff modal. The top banner alone now
// carries the web→app handoff, so the modal never opens. Everything it
// needs is still here (`Overlay`, `Orbit`, the modal CSS in `styles.ts`) —
// flip this to `true` to bring it back. Typed as `boolean` on purpose so
// the modal branch below stays live code rather than narrowing away.
const MODAL_ENABLED: boolean = false;

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

function topBannerHeightPx(mobile: boolean): number {
  return mobile ? BANNER_HEIGHT_MOBILE : BANNER_HEIGHT_DESKTOP;
}

function formatStat(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function resolveRemixFallbackUrl(): string {
  const url = new URL(REMIX_FALLBACK_URL);
  url.searchParams.set("intent", "remix");
  const appId = getAppId()?.trim();
  if (appId) url.searchParams.set("source_app_id", appId);
  return url.toString();
}

/**
 * True when the string is shaped like a URL pointing at an image — covers
 * the forms `creator_apps.icon` may carry: absolute http(s) URLs,
 * protocol-relative URLs, server-relative paths, and inline `data:image/...`
 * URIs. Anything else (emoji glyphs, single letters, etc.) renders as
 * text in the monolith.
 */
function isImageUrl(s: string): boolean {
  return (
    /^https?:\/\//i.test(s) ||
    s.startsWith("//") ||
    s.startsWith("/") ||
    s.startsWith("data:image/")
  );
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Web-only handoff overlay. Mounted by `<EazoProvider>` and visible only
 * in pure-web environments (not the eazoMobile WebView, not embedded
 * iframes). Two coordinated pieces:
 *
 *   1. Top banner — Eazo mark + app identity (icon, name) + likes/comments
 *      stats + "Remix" and "Open in Eazo" CTAs. Always visible from first
 *      paint; non-dismissible. This is the only piece that renders today.
 *   2. Full-screen scrim with coral spotlight + center modal (orbiting
 *      capability icons, app identity, QR + primary CTA). DISABLED — gated
 *      off by `MODAL_ENABLED`; kept intact so it can be switched back on.
 *
 * App identity (name, tagline, likes, comments) is fetched once from
 * `GET /apps-open/:appId`. The CTAs + QR encode the `eazo://` deep link;
 * the iOS click-handler falls back to the App Store after a short delay
 * if the app isn't installed.
 *
 * Kept exported as `EazoBrandBanner` for backwards compatibility with
 * `EazoProvider`, which mounts it by that name.
 */
export function EazoBrandBanner(): React.ReactElement | null {
  const [mounted, setMounted] = React.useState(false);
  const [cta, setCta] = React.useState<BannerCta | null>(null);
  // Seed `info` from the prefetched value (if the host's Server
  // Component passed `<EazoProvider initialAppInfo>`) so the modal
  // renders real content on first paint without a skeleton flash.
  // `useState(initializer)` runs the lazy initializer once at first
  // render; `getInitialAppInfo()` reads what `EazoProvider` stashed
  // synchronously in the SAME render pass.
  const [info, setInfo] = React.useState<PublicAppInfo | null>(() => getInitialAppInfo());
  // `loading === true` until the public app-info fetch settles (success
  // or failure). Skip the loading state entirely when a prefetched value
  // is already in hand — no fetch is going to fire.
  const [loading, setLoading] = React.useState(() => getInitialAppInfo() === null);
  const [mobile, setMobile] = React.useState(false);
  // Visibility of the strong-CTA modal. Currently disabled via
  // `MODAL_ENABLED` — it never opens, and only the top banner renders.
  // When re-enabled it opens immediately on load and shows once:
  // dismissing (X / ESC) closes it for the rest of this page load, with no
  // re-open, and a fresh page load (navigation, refresh, new tab) engages
  // it again. The top banner stays visible regardless.
  const [modalOpen, setModalOpen] = React.useState(MODAL_ENABLED);
  // Resolved on mount in the browser. Encoded by the QR so a desktop
  // scan opens the EXACT page on a phone (which then sends the user
  // through the same handoff via the mobile route).
  const [pageUrl, setPageUrl] = React.useState("");

  React.useEffect(() => {
    if (getHost() !== "web") return;
    ensureBannerStylesInjected();
    setCta(resolveBannerCta());
    setMobile(isMobile());
    setPageUrl(typeof window !== "undefined" ? window.location.href : "");
    setMounted(true);
  }, []);

  // Close the modal for the rest of this page load — no re-open.
  const dismissModal = React.useCallback(() => {
    setModalOpen(false);
  }, []);

  // ESC closes the modal — same dismiss path as the X button. Only
  // armed while the modal is actually showing.
  React.useEffect(() => {
    if (!mounted || !modalOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") dismissModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, modalOpen, dismissModal]);

  // Three coupled responsibilities, all client-side, all keyed to the
  // banner actually being visible (host === "web", post-mount):
  //
  //  1. Reserve top padding on `<html>` so the host page's flow-layout
  //     content doesn't tuck under the fixed top banner. There is no
  //     bottom banner, so no bottom padding is reserved.
  //
  //  2. Expose the reserved heights as `--eazo-handoff-top` / `bottom`
  //     CSS custom properties on `<html>`. The `.eazo-app-area`
  //     wrapper (rendered by `EazoProvider`) reads these for its inset
  //     box, and host code can read them too for tooltip / popover
  //     coordination. `--eazo-handoff-bottom` is pinned to `0px` — the
  //     handoff no longer claims any space at the bottom edge — but it's
  //     still published so host code reading it without a fallback gets
  //     a valid length.
  //
  //  3. Add the `eazo-host-web` class on `<html>`. This is the GATE for
  //     the `.eazo-app-area` wrapper's effective styling (position:
  //     fixed + overflow + containing block). The class is only added
  //     here, not in `react.tsx`, so it's coupled to banner visibility
  //     — in a mobile WebView or iframe the banner-ui mount-gate above
  //     bails out and the class is never set, leaving the wrapper as
  //     an inert pass-through `<div>` that doesn't disturb the host's
  //     scroll model or fixed-positioning containment.
  //
  // All are restored on unmount so a Provider that comes and goes leaves
  // no residue.
  React.useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const previousTop = html.style.paddingTop;
    const previousVarTop = html.style.getPropertyValue("--eazo-handoff-top");
    const previousVarBottom = html.style.getPropertyValue(
      "--eazo-handoff-bottom",
    );
    html.classList.add("eazo-host-web");
    const apply = (): void => {
      const m = isMobile();
      setMobile(m);
      const top = topBannerHeightPx(m);
      html.style.paddingTop = `${top}px`;
      html.style.setProperty("--eazo-handoff-top", `${top}px`);
      html.style.setProperty("--eazo-handoff-bottom", "0px");
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      html.classList.remove("eazo-host-web");
      html.style.paddingTop = previousTop;
      if (previousVarTop) {
        html.style.setProperty("--eazo-handoff-top", previousVarTop);
      } else {
        html.style.removeProperty("--eazo-handoff-top");
      }
      if (previousVarBottom) {
        html.style.setProperty("--eazo-handoff-bottom", previousVarBottom);
      } else {
        html.style.removeProperty("--eazo-handoff-bottom");
      }
    };
  }, [mounted]);

  // Fetch public app info on the client when the host didn't prefetch.
  // If `initialAppInfo` was supplied via the Provider, `info` is already
  // seeded above and `loading` is already false — skip the fetch entirely.
  // The overlay still renders without info — the identity falls back to
  // initials / generic copy. `loading` clears either way so the skeleton
  // doesn't shimmer forever on fetch failure.
  React.useEffect(() => {
    if (!mounted) return;
    if (info) return;
    const appId = getAppId();
    if (!appId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetchPublicAppInfo(appId, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setInfo(data);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
    // `info` is captured via closure on first mount; intentionally not in
    // deps — we only want to attempt the client fetch once, on
    // mount, if no prefetch was supplied. Re-fetching when `info` later
    // changes would be pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  React.useEffect(() => {
    if (!mounted) return;
    if (loading && !info) return;
    trackShareAttribution("page_open", {
      appName: info?.app.name,
      dedupePageOpen: true,
    });
  }, [info, loading, mounted]);

  if (!mounted || !cta) return null;

  return (
    <div className="eazo-handoff-root">
      <TopBanner
        cta={cta}
        pageUrl={pageUrl}
        info={info}
        loading={loading}
      />
      {modalOpen ? (
        <Overlay
          info={info}
          cta={cta}
          loading={loading}
          pageUrl={pageUrl}
          mobile={mobile}
          onDismiss={dismissModal}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA click handler — same scheme + iOS-timeout fallback used elsewhere
// in the SDK. Lives at module scope so both the top-bar button and the
// modal primary CTA share the exact same behaviour.
// ---------------------------------------------------------------------------

function bindCtaClick(
  cta: BannerCta,
  options: { action?: ShareAttributionAction; appName?: string | null } = {},
): React.MouseEventHandler<HTMLAnchorElement> {
  return () => {
    trackShareAttribution(options.action ?? "open_app_click", {
      appName: options.appName,
      targetUrl: cta.href,
    });
    if (!cta.needsTimeoutFallback) return;
    const start = Date.now();
    let appOpened = false;
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") appOpened = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (
        !appOpened &&
        document.visibilityState === "visible" &&
        Date.now() - start < IOS_FALLBACK_TIMEOUT_MS + 500
      ) {
        window.location.href = cta.storeUrl;
      }
    }, IOS_FALLBACK_TIMEOUT_MS);
  };
}

// ---------------------------------------------------------------------------
// Top banner
// ---------------------------------------------------------------------------

interface TopBannerProps {
  cta: BannerCta;
  /**
   * Current page URL — encoded into the hover-popover QR so a desktop
   * user scanning with their phone lands on the same page on mobile.
   * Empty during the first render tick before the mount effect resolves.
   */
  pageUrl: string;
  /** Public app info; null until the fetch resolves (or if it fails). */
  info: PublicAppInfo | null;
  /** True while the app-info fetch is in flight — drives the skeletons. */
  loading: boolean;
}

function TopBanner({
  cta,
  pageUrl,
  info,
  loading,
}: TopBannerProps): React.ReactElement {
  // Remix keeps the app-specific destination used by "Open in Eazo" and
  // adds an explicit intent. Mobile consumes it after the app detail loads;
  // desktop and app-not-installed flows land on Creator's existing chat
  // page with the same source app bound in the fallback query.
  const remixCta = React.useMemo(
    () =>
      resolveBannerCta({
        fallbackUrl: resolveRemixFallbackUrl(),
        query: { intent: "remix" },
      }),
    [],
  );
  const onRemixClick = React.useMemo(
    () =>
      bindCtaClick(remixCta, {
        action: "remix_click",
        appName: info?.app.name,
      }),
    [info?.app.name, remixCta],
  );

  // `app.icon` carries either an image URL or a short text glyph (emoji,
  // single letter, etc.). Reuse the same URL detection the modal uses.
  const rawIcon = info?.app.icon?.trim();
  const iconUrl = rawIcon && isImageUrl(rawIcon) ? rawIcon : undefined;
  const iconGlyph = rawIcon && !iconUrl ? rawIcon : undefined;
  const initials = deriveInitials(info?.app.name ?? "Eazo app");

  return (
    <div className="eazo-banner-root" role="region" aria-label="Eazo app promotion">
      <span className="eazo-banner-brand">
        <EazoLogo width={64} height={18} />
      </span>
      <span className="eazo-banner-divider" aria-hidden="true" />
      {/* Brand tagline. Sits beside the Eazo mark and is shown only on
       * wide screens (CSS-gated), at its content width. Hidden on narrower
       * bars to give the app name and CTA the space. */}
      <span className="eazo-banner-copy">
        Get the full Eazo experience in our mobile app.
      </span>
      {/* Divider between the brand tagline and the app identity. Wide-only,
       * like the tagline — on narrow bars where the tagline is hidden this
       * would otherwise double up with the brand divider. */}
      <span className="eazo-banner-divider is-wide" aria-hidden="true" />
      <div className="eazo-banner-app">
        <span className="eazo-banner-app-icon">
          <Monolith
            initials={iconGlyph ?? initials}
            iconUrl={iconUrl}
            loading={loading}
            size={34}
          />
        </span>
        <div className="eazo-banner-app-meta">
          {loading ? (
            <span className="eazo-skel eazo-banner-name-skel" aria-label="Loading app name" />
          ) : (
            <span className="eazo-banner-app-name">
              {info?.app.name ?? "This app"}
            </span>
          )}
          <BannerStats info={info} loading={loading} cta={cta} />
        </div>
      </div>
      <div className="eazo-banner-actions">
        <a
          className="eazo-banner-remix"
          href={remixCta.href}
          onClick={onRemixClick}
          aria-label="Remix this app"
        >
          <RemixIcon size={15} />
          <span className="eazo-banner-remix-label">Remix</span>
        </a>
        <TopBannerCta cta={cta} pageUrl={pageUrl} appName={info?.app.name} />
      </div>
    </div>
  );
}

/**
 * Inline likes + comments rail shown under the app name in the top
 * banner. Mirrors the metrics the public app endpoint exposes today
 * (`likeNum`, `commentsCount`); `uv` is intentionally omitted — it reads
 * as ambient web traffic, not social proof. Each value shows a small
 * skeleton until the fetch resolves.
 *
 * The whole rail is a link onto the same `eazo://` deep link as the
 * Remix / "Open in Eazo" CTAs (shared `bindCtaClick` for the iOS
 * App-Store fallback), so tapping the stats also hands off to the app.
 */
function BannerStats({
  info,
  loading,
  cta,
}: {
  info: PublicAppInfo | null;
  loading: boolean;
  cta: BannerCta;
}): React.ReactElement {
  const onClick = React.useMemo(
    () => bindCtaClick(cta, { appName: info?.app.name }),
    [cta, info?.app.name],
  );
  return (
    <a
      className="eazo-banner-stats"
      href={cta.href}
      onClick={onClick}
      rel="noreferrer noopener"
      aria-label="App likes and comments — open in the Eazo app"
    >
      <span className="eazo-banner-stat">
        <span className="eazo-banner-stat-icon is-like">
          <HeartIcon size={12} />
        </span>
        {loading ? (
          <span className="eazo-banner-stat-skel" />
        ) : (
          <span className="eazo-banner-stat-value">
            {formatStat(info?.app.likeNum)}
          </span>
        )}
      </span>
      <span className="eazo-banner-stat">
        <span className="eazo-banner-stat-icon">
          <ChatIcon size={12} />
        </span>
        {loading ? (
          <span className="eazo-banner-stat-skel" />
        ) : (
          <span className="eazo-banner-stat-value">
            {formatStat(info?.app.commentsCount)}
          </span>
        )}
      </span>
    </a>
  );
}

// Delay before hiding the hover popover after the cursor leaves both
// the CTA and the popover itself. Short enough to feel responsive but
// long enough that a user can move from one to the other without the
// popover snapping shut mid-travel.
const POPOVER_HIDE_DELAY_MS = 140;

/**
 * Top-banner CTA with a hover/focus-triggered QR popover. The popover
 * encodes the current page URL — a desktop visitor scanning with their
 * phone lands on the same page on mobile, where the SDK's mobile-path
 * deep-link kicks in (or the App-Store fallback if the app isn't
 * installed). Falls back to a plain link click on touch devices, where
 * `hover` never resolves and the popover stays suppressed by media query.
 */
function TopBannerCta({
  cta,
  pageUrl,
  appName,
}: {
  cta: BannerCta;
  pageUrl: string;
  appName?: string | null;
}): React.ReactElement {
  const onClick = React.useMemo(
    () => bindCtaClick(cta, { appName }),
    [appName, cta],
  );
  const [open, setOpen] = React.useState(false);
  const hideTimerRef = React.useRef<number | null>(null);

  const show = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setOpen(true);
  }, []);

  const queueHide = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      hideTimerRef.current = null;
    }, POPOVER_HIDE_DELAY_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    },
    [],
  );

  return (
    <span
      className="eazo-banner-cta-wrap"
      onMouseEnter={show}
      onMouseLeave={queueHide}
      onFocusCapture={show}
      onBlurCapture={queueHide}
    >
      <a
        className="eazo-banner-cta"
        href={cta.href}
        rel="noreferrer noopener"
        onClick={onClick}
        aria-describedby={open ? "eazo-banner-cta-popover" : undefined}
      >
        Open in Eazo
      </a>
      {open && pageUrl ? (
        <div
          id="eazo-banner-cta-popover"
          className="eazo-banner-cta-popover"
          role="tooltip"
        >
          <span className="eazo-banner-cta-popover-arrow" aria-hidden="true" />
          <div className="eazo-banner-cta-popover-qr">
            <QrSvg value={pageUrl} size={140} />
          </div>
          <div className="eazo-banner-cta-popover-caption">
            Scan to open in the Eazo app.
          </div>
        </div>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Center overlay (dim + spotlight + modal)
// ---------------------------------------------------------------------------

interface OverlayProps {
  cta: BannerCta;
  info: PublicAppInfo | null;
  loading: boolean;
  pageUrl: string;
  /**
   * True at viewport widths <= MOBILE_BREAKPOINT_PX. Drives the
   * Orbit-center swap (QR on desktop / logo on mobile — no point asking
   * a phone user to scan their own screen).
   */
  mobile: boolean;
  /** Hides the modal for the rest of the tab session. */
  onDismiss: () => void;
}

function Overlay({ cta, info, loading, pageUrl, mobile, onDismiss }: OverlayProps): React.ReactElement {
  const onClick = React.useMemo(
    () => bindCtaClick(cta, { appName: info?.app.name }),
    [cta, info?.app.name],
  );
  // While loading we still want SOMETHING in the monolith; initials of
  // "Eazo app" reads better than a literal placeholder. Once `info`
  // resolves, the real name's initials or cover image take over.
  const initials = deriveInitials(info?.app.name ?? "Eazo app");
  // `app.icon` carries either an image URL or a short text glyph (emoji,
  // single letter, etc.). The orbit center swaps in an <img> for URL-shaped
  // values and falls back to the typographic slot for glyphs and when the
  // field is missing altogether. URL detection accepts the full set the
  // backend may emit: absolute http(s), protocol-relative, server-relative,
  // and inline data:image URLs.
  const rawIcon = info?.app.icon?.trim();
  const iconUrl = rawIcon && isImageUrl(rawIcon) ? rawIcon : undefined;
  const iconGlyph = rawIcon && !iconUrl ? rawIcon : undefined;

  return (
    <div className="eazo-handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="eazo-handoff-title">
      <div className="eazo-handoff-overlay-dim" />
      <div className="eazo-handoff-overlay-spot" />
      <div className="eazo-modal">
        <button
          type="button"
          className="eazo-modal-close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <Orbit
          initials={iconGlyph ?? initials}
          iconUrl={iconUrl}
          iconGlyph={iconGlyph}
          pageUrl={pageUrl}
          loading={loading}
          mobile={mobile}
        />

        <div className="eazo-modal-eyebrow">Now showing in Eazo</div>
        {loading ? (
          // Two-line skeleton stand-in for title + tagline. Width
          // ratios match a typical 2-word app name / one-sentence
          // tagline so the modal doesn't visibly resize when real
          // copy lands.
          <>
            <span
              className="eazo-skel eazo-skel-title"
              role="status"
              aria-label="Loading app info"
            />
            <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
              <span className="eazo-skel eazo-skel-sub-1" />
              <br />
              <span className="eazo-skel eazo-skel-sub-2" />
            </div>
          </>
        ) : (
          <>
            <h2 id="eazo-handoff-title" className="eazo-modal-title">
              {info?.app.name ?? "This app"}
            </h2>
            <p className="eazo-modal-sub">
              {info?.app.tagline ??
                info?.app.description ??
                "Open the mobile app for the full experience."}
            </p>
          </>
        )}

        <div className="eazo-cta-row">
          <div className="eazo-qr-tile">
            {/* App logo lives in the CTA row now — the orbit's center
             * carries the scannable QR. Reuses `.eazo-qr-tile` because
             * the chrome (white tile, rounded corners, hairline border,
             * mobile `display:none`) is identical to what the QR needed;
             * the className name is slightly stale but renaming it is
             * pure churn. `Monolith` keeps its existing 3-state machine
             * (shimmer / image / initials fallback) and just renders at
             * a smaller fixed size. */}
            <Monolith
              initials={iconGlyph ?? initials}
              iconUrl={iconUrl}
              loading={loading}
              size={72}
            />
          </div>
          <div className="eazo-cta-body">
            <div>
              <div className="eazo-cta-headline">Scan to open</div>
              <div className="eazo-cta-fine">
                Scan to continue this page on your phone, or tap to open in Eazo.
              </div>
            </div>
            <a
              className="eazo-cta-primary"
              href={cta.href}
              rel="noreferrer noopener"
              onClick={onClick}
            >
              Open in Eazo app
              <ArrowRightIcon size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orbit + monolith — capability icons rotating around the app's cover
// ---------------------------------------------------------------------------

interface OrbitProps {
  initials: string;
  iconUrl?: string;
  /**
   * Emoji / short glyph (when `creator_apps.icon` is text, not a URL).
   * Forwarded to the QR's center logo on desktop and used in place of
   * `iconUrl` when none is available.
   */
  iconGlyph?: string;
  /**
   * Current page URL — encoded by the QR at the orbit's center on
   * desktop. Empty during the first render tick before the mount
   * effect resolves; the orbit still renders, just without the center
   * piece until it arrives.
   */
  pageUrl: string;
  /** True while the app-info fetch is in flight — drives the monolith shimmer. */
  loading?: boolean;
  /**
   * Viewport-width gate. Desktop puts the scannable QR at orbit center
   * (point of a desktop user being able to whip out their phone); mobile
   * falls back to the app logo monolith — asking a phone user to scan
   * their own screen is silly.
   */
  mobile?: boolean;
}

function Orbit({
  initials,
  iconUrl,
  iconGlyph,
  pageUrl,
  loading = false,
  mobile = false,
}: OrbitProps): React.ReactElement {
  // All geometry runs in a 280-unit coordinate space. The SVG uses
  // `viewBox` so its rings scale to whatever pixel size the parent is
  // (280 desktop / 220 mobile). The capability nodes are positioned via
  // percentage `left/top` on the rotating track, and centered on those
  // points by the negative-margin trick in CSS (margin trick avoids
  // colliding with the track's rotate animation, unlike a transform
  // would).
  const SIDE = 280;
  // Capability-node track radius. Pushed out from the original 102 to
  // give the 144px center QR more breathing room — node inner edge sits
  // at `RADIUS - 18` (node is 36px), so the QR (80px half-width incl.
  // tile padding) now has ~18px of clearance instead of ~4px. Capped
  // by `CENTER - 18 = 122` to keep nodes inside the orbit box.
  const RADIUS = 116;
  const CENTER = SIDE / 2;
  // Radius as a percentage of half the box — used to convert polar
  // coordinates to percentage `left/top` on the track.
  const RADIUS_PCT = (RADIUS / CENTER) * 50;

  return (
    <div className="eazo-orbit">
      <svg
        className="eazo-orbit-rings"
        viewBox={`0 0 ${SIDE} ${SIDE}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* Two concentric guide rings. Outer ring hugs the orbit
         * frame; middle dashed ring sits exactly on the node track
         * (matches `RADIUS`). The inner coral ring was dropped — at
         * r=88 its arcs visually grazed the 144px QR's white tile,
         * which read as "ring cutting through the QR" even though it
         * was geometrically clear of the QR pixels. */}
        <circle cx={CENTER} cy={CENTER} r={138} fill="none" stroke="rgba(17,19,15,0.06)" />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(17,19,15,0.08)" strokeDasharray="2 6" />
      </svg>
      <div className="eazo-orbit-track">
        {CAPABILITIES.map((c, i) => {
          // Distribute nodes evenly around the ring, starting from the
          // top (`-Math.PI / 2`).
          const angle = (i / CAPABILITIES.length) * Math.PI * 2 - Math.PI / 2;
          const leftPct = 50 + Math.cos(angle) * RADIUS_PCT;
          const topPct = 50 + Math.sin(angle) * RADIUS_PCT;
          return (
            <div
              key={c.key}
              className="eazo-orbit-node"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              aria-label={c.label}
            >
              <CapIcon k={c.key} size={14} />
            </div>
          );
        })}
      </div>
      {mobile ? (
        // Phone user can't usefully scan their own screen — show the
        // app logo at orbit center instead. CSS already adapts the
        // monolith's CSS size for the mobile media query (96 → 76).
        <Monolith initials={initials} iconUrl={iconUrl} loading={loading} />
      ) : pageUrl ? (
        // Desktop center is the scannable QR — pop your phone over the
        // screen and the SDK on the phone side does the handoff. The
        // app's icon embeds in the QR center as branding (ECC bumps to
        // H automatically so the masked area still scans).
        <div className="eazo-orbit-qr">
          {/* Sized to fill as much of the orbit's inner ring as
           * possible without colliding with the capability nodes.
           * Capability ring radius is 102 (per the SVG above) and each
           * node is 36px, so node inner-edge sits 84px from center —
           * 144px QR + 8px tile padding = 80px half-width, leaving a
           * 4px gap. Bump either value with care. */}
          <QrSvg
            value={pageUrl}
            size={144}
            logoUrl={iconUrl}
            logoGlyph={iconUrl ? undefined : iconGlyph}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monolith — the square logo tile at the orbit's center. Coordinates three
// visual states without layout shift:
//
//   1. App-info still loading        → shimmer overlay alone
//   2. iconUrl present, image decoding → shimmer + invisible <img>; fades
//                                         in on `onLoad`, falls back to
//                                         initials on `onError`
//   3. iconUrl missing OR emoji glyph → initials text immediately
// ---------------------------------------------------------------------------

interface MonolithProps {
  initials: string;
  iconUrl?: string;
  loading: boolean;
  /**
   * Override the CSS-driven monolith size (96 desktop / 76 mobile).
   * The CTA-row "small logo" instance passes 72 so it sits cleanly
   * inside its 88px tile; the orbit-center instance omits this so
   * the responsive CSS sizing applies as before.
   */
  size?: number;
}

function Monolith({ initials, iconUrl, loading, size }: MonolithProps): React.ReactElement {
  type ImgState = "pending" | "loaded" | "errored";
  const [imgState, setImgState] = React.useState<ImgState>(
    iconUrl ? "pending" : "loaded",
  );

  // Reset whenever the URL changes — covers Provider remounts and
  // hot-reload paths where the icon swaps without a fresh component.
  React.useEffect(() => {
    setImgState(iconUrl ? "pending" : "loaded");
  }, [iconUrl]);

  const hasUsableImg = !!iconUrl && imgState !== "errored";
  const showShimmer = loading || (hasUsableImg && imgState === "pending");
  // Text falls in when there's nothing to show as a picture: not loading,
  // and either no URL or the URL failed to load.
  const showText = !loading && !hasUsableImg;

  // When `size` is supplied, override the CSS-driven width/height and
  // proportionally scale the typographic fallback + corner radius so
  // the small variant in the CTA row reads as the same component, just
  // shrunk. When omitted, the CSS sizing for desktop/mobile applies.
  const overrideStyle = size
    ? {
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        borderRadius: Math.round(size * 0.22),
      }
    : undefined;

  return (
    <div className="eazo-monolith" style={overrideStyle} aria-hidden="true">
      {hasUsableImg ? (
        <img
          className={`eazo-monolith-img${imgState === "loaded" ? " is-loaded" : ""}`}
          src={iconUrl}
          alt=""
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("errored")}
        />
      ) : null}
      {showText ? (
        <span style={{ transform: "translateY(-1px)" }}>{initials}</span>
      ) : null}
      {showShimmer ? <div className="eazo-monolith-skel" /> : null}
    </div>
  );
}
