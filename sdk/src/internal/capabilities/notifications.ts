import { waitForBootstrap, getBridge } from "../bootstrap";
import {
  BridgeErrorObject,
  NOTIFICATIONS_IS_SUBSCRIBED,
  NOTIFICATIONS_SUBSCRIBE,
  NOTIFICATIONS_SYNC_SCHEDULES,
  NOTIFICATIONS_UNSUBSCRIBE,
} from "../bridge/protocol";

/**
 * A fixed-time reminder: fires at `time` (local `HH:mm`) every day, or only
 * on the given ISO weekdays (`1` = Monday … `7` = Sunday).
 */
export interface NotificationTimeSchedule {
  /** Stable id — reuse the same id when editing the same reminder. */
  id: string;
  type: "time";
  /** Local wall-clock time, `HH:mm` (24h). */
  time: string;
  /** User-facing notification body. */
  body?: string;
  /** ISO weekdays (`1` = Monday … `7` = Sunday). Omit / null = every day. */
  weekdays?: number[] | null;
  /** Defaults to true. Disabled schedules are cleared on sync. */
  enabled?: boolean;
}

/**
 * A repeating interval reminder, optionally limited to a daily local-time
 * window (e.g. every 30 minutes between 08:00 and 18:00).
 */
export interface NotificationIntervalSchedule {
  /** Stable id — reuse the same id when editing the same reminder. */
  id: string;
  type: "interval";
  /** Minutes between firings; minimum 1. */
  intervalMinutes: number;
  /** User-facing notification body. */
  body?: string;
  /** Daily local-time window; omit for a plain repeating interval. */
  activeWindow?: { from: string; until: string } | null;
  /** Defaults to true. Disabled schedules are cleared on sync. */
  enabled?: boolean;
}

export type NotificationSchedule =
  | NotificationTimeSchedule
  | NotificationIntervalSchedule;

export interface NotificationScheduleSyncInput {
  /** Short notification title, typically the app name. */
  title: string;
  /**
   * The full desired schedule set — sync is replace-style: schedules omitted
   * here are cancelled. Pass an empty array to clear everything.
   */
  schedules: NotificationSchedule[];
}

export interface NotificationScheduleSyncResult {
  /**
   * True when the host accepted and applied the schedule set. False on the
   * plain-web path (no host → no OS scheduling) and when the user has not
   * granted notification permission — not a fatal error either way.
   */
  synced: boolean;
  /** Number of OS notifications the host scheduled. */
  scheduledCount: number;
  /** Whether OS notification permission is granted. */
  permissionGranted: boolean;
}

export interface NotificationsSubscriptionResult {
  /**
   * Whether the current user is subscribed to push notifications from this
   * app *after* the call resolves. On the mobile path this reflects the
   * `apps_user.flags & APP_FLAG_SUBSCRIBED_PUSH` bit. On the plain-web path
   * (no host) the SDK returns `{ subscribed: false }` and does not throw,
   * so apps can call `isSubscribed()` from a `useEffect` without crashing
   * during local web development.
   */
  subscribed: boolean;
}

/**
 * Per-app push-notification subscription, mediated by the host. The mobile
 * shell (or any host that advertises the `notifications.*` capability) maps
 * these calls onto its `apps-user/toggle-flag` + `apps-user/action/:id`
 * endpoints; the SDK never talks to the platform directly here. That keeps
 * the trust model identical to the existing favorite/like/comment toggles —
 * the host knows which app the user is currently inside and which user is
 * signed in, neither needs to be re-asserted by the embedded app.
 *
 * **Backend publishing** (the path that actually delivers a notification to
 * users) is a different surface — see `@eazo/sdk/server`'s
 * `notifications.publish(...)`. That helper is the one the app's serverless
 * handler calls (signed with `EAZO_PRIVATE_KEY`) when something interesting
 * happens; subscribed users then receive an Expo system push.
 */
export const notifications = {
  /** Returns the current subscription state without changing it. */
  async isSubscribed(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_IS_SUBSCRIBED);
  },

  /**
   * Opt the current user into push notifications from this app. Idempotent
   * (re-subscribing returns `{ subscribed: true }` either way). The user
   * still has to have granted system push permission at the OS level for
   * any actual push to arrive — this method does not prompt for it; the
   * mobile host handles permission once at login.
   */
  async subscribe(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_SUBSCRIBE);
  },

  /** Opt the current user out. Idempotent. */
  async unsubscribe(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_UNSUBSCRIBE);
  },

  /**
   * Replace-style sync of the app's local reminder schedules. Call after
   * every successful schedule create / update / delete / enable / disable so
   * the host (and platform) always hold the full desired set — schedules
   * omitted from `input.schedules` are cancelled.
   *
   * The host owns delivery: Eazo Mobile persists the set platform-side and
   * fires OS notifications even after the WebView is backgrounded or killed.
   * On the plain-web path (no host) this resolves `{ synced: false }` without
   * throwing, so apps can call it unconditionally.
   */
  async syncSchedules(
    input: NotificationScheduleSyncInput,
  ): Promise<NotificationScheduleSyncResult> {
    const fallback: NotificationScheduleSyncResult = {
      synced: false,
      scheduledCount: 0,
      permissionGranted: false,
    };
    const hello = await waitForBootstrap();
    const bridge = getBridge();
    if (!hello || !bridge?.getStatus().ready) {
      return fallback;
    }
    try {
      const result = await bridge.request<Partial<NotificationScheduleSyncResult>>(
        NOTIFICATIONS_SYNC_SCHEDULES,
        {
          replace: true,
          title: input.title,
          schedules: input.schedules,
        },
      );
      return {
        synced: result?.synced === true,
        scheduledCount:
          typeof result?.scheduledCount === "number" ? result.scheduledCount : 0,
        permissionGranted: result?.permissionGranted === true,
      };
    } catch (err) {
      if (
        err instanceof BridgeErrorObject &&
        (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")
      ) {
        return fallback;
      }
      throw err;
    }
  },
};

async function invoke(fn: string): Promise<NotificationsSubscriptionResult> {
  const hello = await waitForBootstrap();
  const bridge = getBridge();
  if (hello && bridge?.getStatus().ready) {
    try {
      const result = await bridge.request<NotificationsSubscriptionResult>(fn);
      return { subscribed: !!result?.subscribed };
    } catch (err) {
      if (
        err instanceof BridgeErrorObject &&
        (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")
      ) {
        // Web fallback: no host means no push channel. Return a falsey state
        // so apps can render the right UI without special-casing.
        return { subscribed: false };
      }
      throw err;
    }
  }
  return { subscribed: false };
}
