import { waitForBootstrap, getBridge } from "../bootstrap";
import {
  BridgeErrorObject,
  NOTIFICATIONS_IS_SUBSCRIBED,
  NOTIFICATIONS_REQUEST_SUBSCRIPTION,
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

export type NotificationSystemPermission =
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable";

export type NotificationsSubscriptionResult = {
  /**
   * Whether the current user is subscribed to push notifications from this
   * app *after* the call resolves. On the mobile path this reflects the
   * Host-owned per-user, per-App authorization state. On the plain-web path
   * (no Host) the SDK returns `false` and does not throw.
   */
  subscribed: boolean;
  /** Current OS-level notification permission reported by the host. */
  systemPermission: NotificationSystemPermission;
};

/**
 * Per-app push-notification authorization, mediated by the Host. The Host
 * derives the current app and signed-in user from its trusted App context and
 * owns the authorization state and any permission UI. The embedded app does
 * not re-assert either identity or talk to the platform directly here.
 *
 * **Backend publishing** (the path that actually delivers a notification to
 * users) is a different surface — see `@eazo/sdk/server`'s
 * `notifications.publish(...)`. That helper is the one the app's serverless
 * handler calls (signed with `EAZO_PRIVATE_KEY`) when something interesting
 * happens; authorized subscribers then receive a system push.
 */
export const notifications = {
  /** Returns the current subscription state without changing it. */
  async isSubscribed(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_IS_SUBSCRIBED);
  },

  /**
   * Ask the host to authorize push notifications for this app. Call only
   * from a direct user action; the host owns permission and confirmation UI.
   */
  async requestSubscription(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_REQUEST_SUBSCRIPTION);
  },

  /**
   * @deprecated Use `requestSubscription()` from a direct user action.
   */
  async subscribe(): Promise<NotificationsSubscriptionResult> {
    return notifications.requestSubscription();
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
  const fallback: NotificationsSubscriptionResult = {
    subscribed: false,
    systemPermission: "unavailable",
  };
  const hello = await waitForBootstrap();
  const bridge = getBridge();
  if (hello && bridge?.getStatus().ready) {
    try {
      const result = await bridge.request<NotificationsSubscriptionResult>(fn);
      return {
        subscribed: !!result?.subscribed,
        systemPermission: normalizeSystemPermission(result?.systemPermission),
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
  }
  return fallback;
}

function normalizeSystemPermission(
  value: NotificationSystemPermission | undefined,
): NotificationSystemPermission {
  return value === "granted" ||
    value === "denied" ||
    value === "blocked" ||
    value === "unavailable"
    ? value
    : "unavailable";
}
