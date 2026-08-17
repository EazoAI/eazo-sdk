import { getHost } from "../env";

const STYLE_ID = "eazo-sdk-banner-ui";

/* The top banner now carries the app identity (icon + name), the
 * likes/comments rail, and both CTAs on a single row — so it's a touch
 * taller than the old slim copy strip. These values also drive the
 * `<html>` padding-top the SDK reserves (see banner-ui/index.tsx), so
 * the host page never tucks under the banner. */
export const BANNER_HEIGHT_DESKTOP = 58;
export const BANNER_HEIGHT_MOBILE = 60;

const TOKENS = `
  --eazo-cream: #f1ebe0;
  --eazo-paper: #faf6ee;
  --eazo-ink: #11130f;
  --eazo-ink-soft: rgba(17,19,15,0.62);
  --eazo-ink-faint: rgba(17,19,15,0.32);
  --eazo-hair: rgba(17,19,15,0.10);
  --eazo-coral: #d4614a;
  --eazo-coral-gradient: linear-gradient(180deg, #F47A42 0%, #EE5C2A 100%);
  --eazo-glow: rgba(212,97,74,0.36);
  --eazo-sans: "Inter", "Helvetica Neue", system-ui, sans-serif;
  --eazo-serif: "Source Serif 4", "GT Sectra", "Tiempos", Georgia, serif;
  --eazo-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace;
`;

export const BANNER_UI_CSS = `
/* ════════════════════════════════════════════════════════════════════════
 *  Host content safe area — two-layer wrapper
 *
 *  Two nested elements wrap the host's children at the EazoProvider level:
 *
 *    <div class="eazo-app-area">              ← outer: containing block
 *      <div class="eazo-app-area-scroller">   ← inner: scroll container
 *        {host children}
 *      </div>
 *    </div>
 *
 *  Both elements are ALWAYS rendered (SSR + CSR markup is static, no
 *  hydration mismatch). The effective styles activate only when the host
 *  is a plain web browser AND the handoff banners are mounted — gated on
 *  the \`eazo-host-web\` class on \`<html>\`, set/cleared by the banner-ui
 *  effect. In a mobile WebView or iframe both elements are inert \`<div>\`s.
 *
 *  Why two layers (this is the whole point):
 *
 *  A single-element wrapper that combines \`transform: translateZ(0)\` AND
 *  \`overflow: auto\` LOOKS like it should keep host's \`position: fixed;
 *  bottom: 0\` elements pinned above the SDK banner — the transform
 *  reparents the containing block to the wrapper, after all. But under
 *  that combination, browsers (per the CSS positioning + scrolling spec
 *  interaction) demote the fixed descendant to absolute-like behavior
 *  AND translate it by the wrapper's scroll offset. The "sticky CTA"
 *  ends up scrolling with content rather than staying pinned.
 *
 *  Splitting them fixes this:
 *    - \`.eazo-app-area\` (outer): \`position: fixed\` between the banners
 *      + \`transform: translateZ(0)\`. It establishes the containing block
 *      but is NOT a scroll container — its own padding box never moves.
 *    - \`.eazo-app-area-scroller\` (inner): \`position: absolute; inset: 0\`
 *      to fill the outer + \`overflow-y: auto\` to scroll host content. It
 *      is NOT a containing block for fixed descendants (no transform,
 *      static position contexts don't qualify), so host's
 *      \`position: fixed; bottom: 0\` still resolves all the way up to the
 *      outer. The bar is painted in the outer's coordinate space, OUTSIDE
 *      the inner's scroll layer, so scrolling host content does NOT
 *      translate it. Result: bar stays visually pinned to the outer's
 *      bottom edge — which sits exactly above the SDK banner.
 *
 *  Why scope the styles to \`html.eazo-host-web\`:
 *    The wrapper only exists to keep host content clear of the SDK's
 *    handoff banners. In a mobile WebView or iframe the banners don't
 *    render — the wrapper has no job, and activating the fixed-position
 *    + overflow + containing-block semantics there would silently break
 *    \`window.scrollY\`, \`window\` scroll listeners, body-overflow scroll
 *    locks, and host modals at \`position: fixed; inset: 0\` for zero
 *    product benefit. So both layers stay inert outside plain web.
 *
 *  Known trade-offs on web (called out in CHANGELOG):
 *    - Scrolling happens inside \`.eazo-app-area-scroller\`, not on
 *      \`window\`. Code reading \`window.scrollY\` or attaching \`scroll\`
 *      listeners to \`window\` must migrate to the scroller element.
 *    - \`document.body { overflow: hidden }\` no longer locks scroll;
 *      body-scroll-lock libraries must target the scroller.
 *    - Host modals at \`position: fixed; inset: 0\` are contained to
 *      the outer wrapper rather than covering the full viewport —
 *      visually equivalent (the wrapper IS the safe-area box) but
 *      \`inset: 0\` no longer covers the banner area.
 */
/* Default state for the two wrapper layers: \`display: contents\` makes
 * the wrapper boxes disappear from layout entirely. Their children
 * participate in the GRANDPARENT's layout context (i.e. directly in the
 * \`<body>\`'s flex column) as if the wrapper elements didn't exist.
 * With no generated box there's also no containing block for fixed
 * descendants — host's \`position: fixed; bottom: 0\` resolves all the
 * way up to the viewport, exactly as it would without the SDK present.
 *
 * This is the ONLY state the wrapper takes in mobile WebView / iframe
 * hosts: the banners aren't mounted, the wrapper has no job, so it
 * collapses to a layout no-op. \`html.eazo-host-web\` (added by banner-ui
 * on mount, only in plain web) overrides BOTH layers below to their
 * full active styles. */
.eazo-app-area,
.eazo-app-area-scroller {
  display: contents;
}

html.eazo-host-web .eazo-app-area {
  display: block;
  position: fixed;
  inset: var(--eazo-handoff-top, 0px) 0 var(--eazo-handoff-bottom, 0px) 0;
  /* Containing block for fixed-positioned descendants — this is what
   * lets host's \`position: fixed; bottom: 0\` anchor to the wrapper
   * (between the banners) instead of to the viewport (under our banner).
   *
   * IMPORTANT: do not move \`overflow: auto\` onto this element. The
   * combination of transform + overflow makes fixed descendants scroll
   * with content. The scroll lives on \`.eazo-app-area-scroller\` below. */
  transform: translateZ(0);
}
html.eazo-host-web .eazo-app-area-scroller {
  display: block;
  /* Fill the outer wrapper exactly. \`position: absolute\` is the
   * cheapest way to do this — \`width/height: 100%\` plus margin/padding
   * inheritance can leak; \`inset: 0\` against the outer's padding box
   * is unambiguous. */
  position: absolute;
  inset: 0;
  /* This is the actual scroll container for host content. Crucially,
   * it does NOT have \`transform\` — so it is NOT a containing block
   * for host's \`position: fixed\` descendants. Those still resolve up
   * to \`.eazo-app-area\` and stay pinned to its edges, ignoring scroll. */
  overflow-x: hidden;
  overflow-y: auto;
  /* Disable rubber-band overscroll. The wrapper sits between two fixed
   * banners on its own compositor layer (via the outer's translateZ);
   * during native overscroll bounce the scroller's content briefly
   * translates beyond its padding box and the compositor briefly
   * reveals adjacent layers — the cream top banner above, the white
   * bottom banner below, the body's UA-default background everywhere
   * else — as a flash of "other colors" at the top/bottom edges.
   * \`overscroll-behavior: none\` keeps the scroll fully contained and
   * eliminates that visual seam, at the cost of the native bounce
   * gesture inside the wrapper (acceptable trade for the SDK's promo
   * surface, which is already constrained by the banner sandwich). */
  overscroll-behavior: none;
}

/* The whole handoff UI lives inside ONE fixed-positioned container that
 * fills the viewport and flex-columns its two children: top banner +
 * overlay (which holds the modal). This replaces the earlier design
 * where each piece was independently position:fixed with hand-tuned
 * insets — that scheme broke any time an ancestor of the SDK mount
 * established a containing block (transform / filter / backdrop-filter /
 * contain on <body>, a wrapper, etc.), at which point position:fixed
 * becomes relative to that ancestor and the math goes wrong. Flex layout
 * pins the top banner and lets the overlay claim the rest by structure,
 * not by pixel math.
 *
 * The root is pointer-events:none so the user's page underneath stays
 * interactive in transparent regions (there shouldn't be any when the
 * overlay's modal is up, but it's the right default). Each visual child
 * (banner + overlay dim) opts back in with pointer-events:auto. */
.eazo-handoff-root {
  ${TOKENS}
  position: fixed;
  inset: 0;
  z-index: 2147483540;
  display: flex;
  flex-direction: column;
  color: var(--eazo-ink);
  font-family: var(--eazo-sans);
  box-sizing: border-box;
  pointer-events: none;
}
.eazo-handoff-root *, .eazo-handoff-root *::before, .eazo-handoff-root *::after {
  box-sizing: border-box;
}

@keyframes eazo-handoff-slide-down {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes eazo-handoff-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes eazo-handoff-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes eazo-handoff-orbit-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes eazo-handoff-glow { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
@keyframes eazo-handoff-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes eazo-handoff-pop-in {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============ TOP BANNER ============
 *
 * Single-row strip carrying everything the old top + bottom banners
 * split between them: Eazo mark, a hairline divider, the app identity
 * (icon + name) with a likes/comments rail beneath the name, and the
 * Remix + "Open in Eazo" CTAs on the right. The underlying app's content
 * sits below this. Non-dismissible.
 */
.eazo-banner-root {
  /* Flex child of .eazo-handoff-root — naturally pinned to the top of
   * the viewport-filling container. No position:fixed needed. */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  height: ${BANNER_HEIGHT_DESKTOP}px;
  padding: 0 14px 0 16px;
  background: var(--eazo-cream);
  border-bottom: 1px solid var(--eazo-hair);
  pointer-events: auto;
  animation: eazo-handoff-slide-down 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.eazo-banner-brand {
  display: inline-flex; align-items: center;
  flex-shrink: 0;
  color: var(--eazo-ink);
}
/* Hairline separator. One sits between the Eazo mark and what follows;
 * the is-wide variant (between the tagline and the app identity) only
 * shows on wide bars, alongside the tagline. */
.eazo-banner-divider {
  flex-shrink: 0;
  width: 1px; height: 26px;
  background: var(--eazo-hair);
}
.eazo-banner-divider.is-wide { display: none; }

/* App identity block. On narrow bars it takes the flexible middle so the
 * name truncates (rather than the CTAs) when space is tight; on wide bars
 * the tagline copy becomes the grower instead (see the min-width query
 * below) and this shrinks to its content. */
.eazo-banner-app {
  flex: 1 1 auto; min-width: 0;
  display: flex; align-items: center; gap: 10px;
}

/* Brand tagline — sits beside the Eazo mark. Hidden by default, revealed
 * at its content width on wide bars (see the min-width query at the end of
 * this sheet); it never grows into the slack. Truncates rather than
 * wrapping so it never grows the banner height. */
.eazo-banner-copy {
  display: none;
  min-width: 0;
  font-family: var(--eazo-sans);
  font-size: 13px; font-weight: 500;
  color: var(--eazo-ink-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.eazo-banner-app-icon {
  flex-shrink: 0;
  display: inline-flex;
}
.eazo-banner-app-meta {
  min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.eazo-banner-app-name {
  font-family: var(--eazo-sans);
  font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--eazo-ink); line-height: 1.15;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.eazo-banner-name-skel { width: 120px; height: 14px; border-radius: 5px; }

/* Likes + comments rail under the app name. The rail is a link onto the
 * same eazo:// handoff as the CTAs (see BannerStats), so it carries
 * cursor + hover + focus affordances. */
.eazo-banner-stats {
  display: inline-flex; align-items: center; gap: 12px;
  min-width: 0;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  border-radius: 8px;
}
.eazo-banner-stats:hover .eazo-banner-stat { color: var(--eazo-ink); }
.eazo-banner-stats:focus-visible {
  outline: 2px solid var(--eazo-coral);
  outline-offset: 3px;
}
.eazo-banner-stat {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--eazo-sans);
  font-size: 12px; font-weight: 500;
  color: var(--eazo-ink-soft);
  transition: color 140ms ease;
}
.eazo-banner-stat-icon {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--eazo-ink-faint);
}
.eazo-banner-stat-icon.is-like { color: var(--eazo-coral); }
.eazo-banner-stat-value {
  font-variant-numeric: tabular-nums;
}
.eazo-banner-stat-skel {
  display: inline-block;
  width: 18px; height: 11px; border-radius: 4px;
  background: linear-gradient(90deg,
    rgba(17,19,15,0.05) 0%,
    rgba(17,19,15,0.12) 50%,
    rgba(17,19,15,0.05) 100%);
  background-size: 200% 100%;
  animation: eazo-skel-shimmer 1.4s linear infinite;
}

/* Right-aligned action cluster: primary Remix + secondary "Open in Eazo". */
.eazo-banner-actions {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 8px;
}
/* Remix is the primary action — coral gradient pill. Same deep-link +
 * iOS-store fallback as the "Open in Eazo" CTA. */
.eazo-banner-remix {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 12px;
  border-radius: 10px;
  border: 0;
  background: var(--eazo-coral-gradient); color: #fff;
  font-family: var(--eazo-sans);
  font-size: 12px; font-weight: 600;
  text-decoration: none; cursor: pointer;
  box-shadow: 0 10px 22px var(--eazo-glow);
  transition: filter 160ms ease, box-shadow 160ms ease;
}
.eazo-banner-remix:hover { filter: brightness(1.06); }
/* "Open in Eazo" is the secondary action — ghost pill so the coral Remix
 * CTA stays the clear primary. */
.eazo-banner-cta {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 14px; border-radius: 10px;
  border: 1px solid var(--eazo-hair);
  background: rgba(255,255,255,0.6);
  color: var(--eazo-ink);
  font-size: 12px; font-weight: 600; cursor: pointer;
  text-decoration: none;
  transition: background 140ms ease, border-color 140ms ease;
}
.eazo-banner-cta:hover {
  background: #fff;
  border-color: rgba(17,19,15,0.18);
}

/* CTA wrapper anchors the hover/focus popover. position:relative is the
 * coordinate origin for the absolutely-positioned popover below. */
.eazo-banner-cta-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

/* Hover popover holding the page-URL QR. Matches the v5-stagelight
 * design (project/v5-stagelight.jsx:59-85). The CTA's right edge anchors
 * the right edge of the popover so it never spills off the viewport on
 * a banner where the CTA is hugged to the right padding. */
.eazo-banner-cta-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 2147483560;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  min-width: 168px;
  padding: 14px;
  background: #fff;
  border: 1px solid var(--eazo-hair);
  border-radius: 14px;
  box-shadow:
    0 24px 50px -20px rgba(17,19,15,0.22),
    0 0 0 1px rgba(17,19,15,0.03);
  animation: eazo-handoff-fade-in 140ms ease-out;
}
/* Triangular tail pointing back up at the CTA. Rotated square so it
 * inherits the card's border + background without an extra SVG. */
.eazo-banner-cta-popover-arrow {
  position: absolute;
  top: -7px; right: 24px;
  width: 12px; height: 12px;
  background: #fff;
  border-top: 1px solid var(--eazo-hair);
  border-left: 1px solid var(--eazo-hair);
  transform: rotate(45deg);
}
.eazo-banner-cta-popover-qr {
  padding: 4px;
  background: #fff;
  line-height: 0;
}
.eazo-banner-cta-popover-caption {
  font-family: var(--eazo-mono);
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.04em;
  color: var(--eazo-ink-soft);
  text-align: center;
}

/* ============ OVERLAY (backdrop + spotlight + modal) ============
 *
 * The flex-middle of .eazo-handoff-root. Takes whatever vertical space
 * the top and bottom banners don't claim — i.e. it IS the inter-banner
 * area by structure, not by pixel math. overflow:hidden clips any
 * oversized modal at this seam; the modal's own max-height:100% plus
 * the overlay's flex centering keeps it inside.
 */
.eazo-handoff-overlay {
  flex: 1;
  min-height: 0;  /* allow the flex item to shrink below content size */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 16px;
  pointer-events: auto;
  animation: eazo-handoff-fade-in 320ms ease-out;
}
.eazo-handoff-overlay-dim {
  position: absolute; inset: 0;
  background: rgba(241,235,224,0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.eazo-handoff-overlay-spot {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 50%, rgba(212,97,74,0.22) 0%, rgba(212,97,74,0.06) 30%, transparent 58%);
  pointer-events: none;
}

.eazo-modal {
  /* Natural flex centering by the overlay parent — no absolute
   * positioning. This keeps the modal inside the overlay's banner-
   * constrained box even when its content is tall, so it never bleeds
   * into the top or bottom banner area. If the modal is taller than the
   * overlay, the inner content scrolls. */
  position: relative;
  width: min(540px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 32px 32px 28px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--eazo-hair);
  border-radius: 24px;
  color: var(--eazo-ink);
  box-shadow:
    0 60px 100px -40px rgba(17,19,15,0.28),
    inset 0 1px 0 rgba(255,255,255,0.7),
    0 0 60px var(--eazo-glow);
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  animation: eazo-handoff-pop-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
/* Close button — sits in the modal's top-right corner. The top + bottom
 * Eazo banners stay visible after the user dismisses the modal; only
 * this center "strong CTA" goes away (per-tab via sessionStorage). */
.eazo-modal-close {
  position: absolute;
  top: 12px; right: 12px;
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; padding: 0;
  border-radius: 999px;
  background: rgba(17,19,15,0.04);
  color: var(--eazo-ink-soft);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.eazo-modal-close:hover {
  background: rgba(17,19,15,0.08);
  color: var(--eazo-ink);
}
.eazo-modal-close:focus-visible {
  outline: 2px solid var(--eazo-coral);
  outline-offset: 2px;
}

/* ============ ORBITING CAPABILITIES + APP MONOLITH ============
 *
 * Geometry runs in a 280-unit coordinate space (matches the V5 design
 * canvas). The rings SVG uses a viewBox so its content scales to whatever
 * pixel size the .eazo-orbit container is in CSS (280 desktop, 220
 * mobile). The capability nodes position via percentage left/top on
 * the rotating track, then use negative margins to center on that point
 * — margins do not fight the track rotate animation the way a
 * transform: translate(-50%, -50%) would.
 */
.eazo-orbit {
  position: relative;
  width: 280px; height: 280px;
  display: grid; place-items: center;
}
.eazo-orbit-rings {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  opacity: 0.95;
}
.eazo-orbit-track {
  position: absolute; inset: 0; width: 100%; height: 100%;
  animation: eazo-handoff-orbit 30s linear infinite;
}
.eazo-orbit-node {
  position: absolute;
  width: 36px; height: 36px;
  margin: -18px 0 0 -18px;
  border-radius: 10px;
  background: #fff; border: 1px solid var(--eazo-hair);
  display: grid; place-items: center;
  box-shadow: 0 10px 22px -10px rgba(17,19,15,0.15);
  animation: eazo-handoff-orbit-rev 30s linear infinite;
  color: var(--eazo-coral);
}
.eazo-monolith {
  width: 96px; height: 96px; border-radius: 22px;
  /* Default fallback background — visible behind emoji icons and the
   * typographic initials fallback. URL icons render as a child <img>
   * that covers this completely. Eazo coral gradient (same as primary
   * CTAs) so the empty state reads as a clear Eazo-brand placeholder. */
  background: var(--eazo-coral-gradient);
  display: grid; place-items: center;
  position: relative;
  color: #ffffff;
  font-family: var(--eazo-serif); font-weight: 500;
  font-size: 42px; letter-spacing: -0.02em;
  box-shadow:
    0 30px 60px -20px var(--eazo-glow),
    inset 0 1px 0 rgba(255,255,255,0.30),
    0 0 0 1px rgba(255,255,255,0.14);
  overflow: hidden;
}
.eazo-monolith img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}

.eazo-modal-eyebrow {
  font-family: var(--eazo-mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--eazo-ink-faint);
  text-align: center;
}
.eazo-modal-title {
  margin: 0; font-family: var(--eazo-serif); font-weight: 500;
  font-size: 32px; line-height: 1.15; letter-spacing: -0.02em;
  text-align: center; max-width: 360px;
  /* Clamp at 2 lines so an unusually long app name doesn't blow up the
   * modal height. Ellipsis takes over for the overflow. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.eazo-modal-sub {
  margin: 0; font-size: 13px; line-height: 1.5;
  color: var(--eazo-ink-soft);
  text-align: center; max-width: 360px;
  /* Same idea — long taglines clamp to 3 lines to keep the QR + CTA
   * visible without scrolling. */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* Skeleton blocks shown while public app info is in flight. The modal
 * frame appears immediately so the user sees Eazo's commitment to the
 * handoff; the name / tagline swap in once the fetch resolves. */
.eazo-skel {
  display: inline-block;
  vertical-align: middle;
  background: linear-gradient(90deg,
    rgba(17,19,15,0.05) 0%,
    rgba(17,19,15,0.12) 50%,
    rgba(17,19,15,0.05) 100%);
  background-size: 200% 100%;
  border-radius: 8px;
  animation: eazo-skel-shimmer 1.4s linear infinite;
}
.eazo-skel-title { width: 60%; height: 36px; }
.eazo-skel-sub-1 { width: 80%; height: 13px; margin-top: 8px; }
.eazo-skel-sub-2 { width: 55%; height: 13px; margin-top: 6px; }
.eazo-skel-stat  { width: 28px; height: 11px; border-radius: 4px; }
@keyframes eazo-skel-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* Monolith-tuned shimmer — sweeps a brighter band over the dark navy
 * gradient. Used while public app info is still loading, and as the
 * placeholder behind an <img> until it decodes. */
.eazo-monolith-skel {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    rgba(255,255,255,0.00) 0%,
    rgba(255,255,255,0.18) 50%,
    rgba(255,255,255,0.00) 100%);
  background-size: 200% 100%;
  animation: eazo-skel-shimmer 1.4s linear infinite;
  pointer-events: none;
}
.eazo-monolith-img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
  opacity: 0;
  transition: opacity 220ms ease-out;
}
.eazo-monolith-img.is-loaded { opacity: 1; }

/* Orbit-center QR tile (desktop only). Wraps the QR SVG in a white
 * card so it reads as an intentional center piece rather than floating
 * pixels — same shadow + hairline language as the monolith it replaced,
 * scaled down slightly. Mobile keeps the monolith at orbit center
 * (asking a phone user to scan their own screen is silly), so no mobile
 * sizing is needed here. */
.eazo-orbit-qr {
  padding: 8px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--eazo-hair);
  box-shadow:
    0 22px 44px -18px rgba(17,19,15,0.18),
    0 0 0 1px rgba(255,255,255,0.14);
}

/* ============ QR + CTA ROW ============ */
.eazo-cta-row {
  width: 100%; display: flex; gap: 12px; align-items: stretch; margin-top: 6px;
}
.eazo-qr-tile {
  padding: 8px; border-radius: 10px;
  background: #fff; border: 1px solid var(--eazo-hair);
  display: grid; place-items: center;
}
.eazo-cta-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; justify-content: space-between; gap: 8px;
}
.eazo-cta-headline {
  font-size: 12px; font-weight: 600;
}
.eazo-cta-fine {
  font-size: 10px; color: var(--eazo-ink-faint); margin-top: 4px;
  font-family: var(--eazo-mono); letter-spacing: 0.04em; line-height: 1.5;
}
.eazo-cta-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; border-radius: 10px;
  background: var(--eazo-coral-gradient); color: #fff;
  font-size: 13px; font-weight: 600; border: 0; cursor: pointer;
  text-decoration: none;
  box-shadow: 0 14px 26px var(--eazo-glow);
  transition: filter 160ms ease;
}
.eazo-cta-primary:hover { filter: brightness(1.06); }

/* ============ WIDE BANNER (≥760px) ============
 *
 * Enough room for the brand tagline beside the Eazo mark. The tagline
 * shows at its content width (grow: 0 — it never stretches into the
 * slack); the app block stays the grower, so the flexible space lands
 * between the app stats and the Remix + "Open in Eazo" actions.
 *
 * On wide bars the app identity collapses to JUST the likes/comments
 * rail, shown a size up — the tagline already carries the messaging, so
 * the app icon and name are dropped to keep the row clean. Below this
 * width all of that is hidden / reverts: the tagline + its divider go
 * away and the app block shows icon + name + stats as the grower. */
@media (min-width: 760px) {
  .eazo-banner-copy { display: block; flex: 0 1 auto; }
  .eazo-banner-divider.is-wide { display: block; }
  /* App identity → stats only. */
  .eazo-banner-app-icon,
  .eazo-banner-app-name,
  .eazo-banner-name-skel { display: none; }
  /* Bump the stats a size up now that they stand alone. */
  .eazo-banner-stats { gap: 16px; }
  .eazo-banner-stat { font-size: 15px; gap: 6px; }
  .eazo-banner-stat-icon svg { width: 15px; height: 15px; }
}

/* ============ MOBILE TWEAKS (≤480px) ============ */
@media (max-width: 480px) {
  .eazo-banner-root {
    height: ${BANNER_HEIGHT_MOBILE}px;
    padding: 0 12px;
    gap: 10px;
  }
  /* Reclaim width on phones: the Eazo wordmark, its divider, and the
   * (now primary, coral) Remix pill drop out so the "Open in Eazo" button
   * alone carries the handoff. */
  .eazo-banner-brand,
  .eazo-banner-divider,
  .eazo-banner-remix { display: none; }
  .eazo-banner-app { gap: 9px; }
  .eazo-banner-stats { gap: 10px; }
  /* It's the only CTA left on phones, so it takes the primary coral
   * treatment here (it's the ghost secondary on wider bars, where the
   * coral Remix pill is the primary). */
  .eazo-banner-cta {
    height: 32px; padding: 0 12px; font-size: 12px; border-radius: 9px;
    border: 0;
    background: var(--eazo-coral-gradient);
    color: #fff;
    box-shadow: 0 10px 22px var(--eazo-glow);
  }
  /* The wider-bar ghost :hover flips the bg to white — wrong for the
   * coral mobile button, and it sticks after a tap on touch. Keep coral
   * and just brighten, matching the Remix primary hover. */
  .eazo-banner-cta:hover {
    background: var(--eazo-coral-gradient);
    border-color: transparent;
    filter: brightness(1.06);
  }
  /* Hover doesn't resolve reliably on touch — the CTA still works as a
   * plain link, no popover needed. Belt-and-suspenders to the JS check
   * (the popover render is also gated on the 'open' state, which never
   * flips without mouseenter / focus). */
  .eazo-banner-cta-popover { display: none; }

  .eazo-modal {
    width: calc(100vw - 32px);
    padding: 24px 20px 20px;
    border-radius: 20px;
    gap: 14px;
  }
  .eazo-orbit { width: 220px; height: 220px; }
  .eazo-monolith {
    width: 76px; height: 76px; border-radius: 18px;
    font-size: 32px;
  }
  .eazo-orbit-node {
    width: 28px; height: 28px; border-radius: 8px;
    margin: -14px 0 0 -14px;
  }
  .eazo-modal-title { font-size: 26px; }
  .eazo-modal-sub { font-size: 12px; }

  /* Mobile: the user is already on a phone — no point showing them a QR
   * to scan with their phone, and the "Scan to open" headline + fine
   * print only made sense paired with the QR. Collapse to the primary
   * CTA alone. */
  .eazo-qr-tile { display: none; }
  .eazo-cta-row { flex-direction: column; gap: 10px; }
  .eazo-cta-primary { height: 44px; width: 100%; font-size: 14px; border-radius: 12px; }
  .eazo-cta-headline { display: none; }
  .eazo-cta-fine { display: none; }
}
`;

export function ensureBannerStylesInjected(): void {
  if (typeof document === "undefined") return;
  // Banner CSS only matters in plain-web hosts where the handoff banners
  // actually render. In a mobile WebView or embedded iframe (where the
  // banner-ui mount-gate bails before any rendering happens), this CSS
  // would just sit inert in `document.head` — every selector either
  // \`.eazo-*\` (matches nothing host-side) or \`html.eazo-host-web ...\`
  // (banner-ui never adds that class outside web). Skip the inject so
  // the SDK leaves no banner-related styles in mobile/iframe documents.
  if (getHost() !== "web") return;
  // Always overwrite the textContent rather than early-return on
  // existing tag presence. Next.js Fast Refresh re-imports this module
  // with updated `BANNER_UI_CSS`, but the previously-injected <style>
  // tag survives the React tree's hot reload — so an early-return left
  // the page running stale CSS until a hard refresh. Overwriting is
  // O(short string) and idempotent.
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== BANNER_UI_CSS) existing.textContent = BANNER_UI_CSS;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-eazo-sdk", "banner-ui");
  style.textContent = BANNER_UI_CSS;
  document.head.appendChild(style);
}
