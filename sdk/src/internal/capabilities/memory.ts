import { getBridge, waitForBootstrap } from "../bootstrap";
import { MEMORY_REPORT_ACTION } from "../bridge/protocol";
import { getPlatformApiBase, getAppId } from "../config";
import { getHost } from "../env";
import { resolveSendAnonymousDataEnabled } from "../app-info";
import { auth } from "./auth";

export interface MemoryActionParams {
  /** Readable description, e.g. "User clicked publish on the app editor page" */
  content: string;
  /** ISO 8601 timestamp. Defaults to now when omitted. */
  timestamp?: string;
  /** Gum session ID to associate this action with */
  session_id?: string;
  /** Action category, e.g. "click", "search", "page_view" */
  event_type?: string;
  /** Page identifier where the action occurred, e.g. "app_editor" */
  page?: string;
  /**
   * Structured event data. `appid` is auto-injected from
   * `<EazoProvider appId>` when omitted; supply any event-specific fields
   * here.
   */
  metadata?: Record<string, unknown>;
  device_id?: string;
  app?: string;
  /**
   * Auto-detected when omitted:
   *   "ios"     — RN WebView on iOS
   *   "android" — RN WebView on Android
   *   "web"     — plain browser
   */
  platform?: string;
}

/** "ios" / "android" inside the Eazo Mobile WebView, "web" otherwise. */
function detectPlatform(): string {
  if (typeof window === "undefined") return "web";
  if (getHost() === "eazoMobile") {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "android";
    return "ios";
  }
  return "web";
}

/**
 * Fire-and-forget side-channel to the mobile host. Never throws, never
 * blocks the HTTP report below — that's the durable record. No-op outside
 * the Eazo Mobile WebView.
 */
function notifyMobile(payload: MemoryActionParams): void {
  if (getHost() !== "eazoMobile") return;
  void (async (): Promise<void> => {
    try {
      const hello = await waitForBootstrap();
      const bridge = getBridge();
      if (!hello || !bridge?.getStatus().ready) return;
      await bridge.request(MEMORY_REPORT_ACTION, payload);
    } catch {
      // Best-effort — the HTTP POST below is the durable record.
    }
  })();
}

export const memory = {
  /**
   * Report a user action event to Gum memory service.
   *
   * Requires the user to be authenticated — `x-eazo-session` is forwarded
   * automatically. The app id comes from `<EazoProvider appId>`.
   *
   * @example
   * ```ts
   * await memory.reportAction({
   *   content: "User clicked the publish button on the app editor page",
   *   event_type: "click",
   *   page: "app_editor",
   *   metadata: { type: "click" },
   * });
   * ```
   */
  async reportAction(params: MemoryActionParams): Promise<void> {
    const appId = getAppId();
    if (!appId) {
      throw new Error(
        "@eazo/sdk: app id not configured. Mount <EazoProvider appId={...}> at the root of your app.",
      );
    }

    // Consent gate — only report when the app author opted in to share
    // anonymized usage data. Fails open when the platform is unreachable
    // (see resolveSendAnonymousDataEnabled). Silent no-op when disabled,
    // matching the fire-and-forget contract callers rely on.
    const sendAnonymousDataEnabled =
      await resolveSendAnonymousDataEnabled(appId);
    if (!sendAnonymousDataEnabled) return;

    const session = await auth.getSessionHeader();
    if (!session) {
      throw new Error(
        "@eazo/sdk: user is not authenticated. Call auth.login() before reporting memory actions.",
      );
    }

    // Caller's metadata wins if it sets `appid`; otherwise stamp ours in.
    const metadata: Record<string, unknown> = { appid: appId, ...params.metadata };
    const platform = params.platform ?? detectPlatform();

    const payload: MemoryActionParams = { ...params, metadata, platform };

    notifyMobile(payload);

    const res = await fetch(`${getPlatformApiBase()}/api/open/gum/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eazo-appid": appId,
        "x-eazo-session": session,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let message = `Failed to report memory action: ${res.status}`;
      try {
        const body = await res.json() as { message?: string };
        if (body?.message) message = body.message;
      } catch { /* ignore */ }
      throw new Error(message);
    }
  },
};
