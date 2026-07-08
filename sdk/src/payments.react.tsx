"use client";

import * as React from "react";

import { auth } from "./internal/capabilities/auth";
import {
  getEazoPaymentErrorMessage,
  type EazoAppSubscription,
  type EazoAppSubscriptionsResponse,
  type EazoEntitlement,
  type EazoEntitlementStatusValue,
  type EazoPaymentApiErrorBody,
} from "./payments";
import { startEazoCheckout } from "./payments";

const ENTITLEMENT_CACHE_PREFIX = "eazo:paymentEntitlement:";

export type EazoEntitlementState = {
  entitlement: EazoEntitlement;
  status: EazoEntitlementStatusValue;
  active: boolean;
  checking: boolean;
  error: string | null;
  refresh: () => Promise<EazoEntitlement>;
};

export type EazoPaymentButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "children"
> & {
  productKey?: string;
  children?: React.ReactNode;
  unlockedChildren?: React.ReactNode;
  disabled?: boolean;
  onCheckoutError?: (error: Error) => void;
  onUnlockedClick?: () => void;
};

export type EazoEntitlementGateProps = {
  productKey?: string;
  paid: React.ReactNode;
  free: React.ReactNode;
  loading?: React.ReactNode;
  inactiveStatuses?: EazoEntitlementStatusValue[];
};

export type EazoPaymentLifecycleState = EazoEntitlementState & {
  productKey: string;
  starting: boolean;
  pending: boolean;
  checkout: () => Promise<void>;
};

export type EazoPaymentLifecycleProps = {
  productKey?: string;
  children: (payment: EazoPaymentLifecycleState) => React.ReactNode;
};

export type EazoPaymentUnlockPanelProps = {
  productKey?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  ctaLabel?: React.ReactNode;
  activeLabel?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  className?: string;
  children?: (payment: EazoPaymentLifecycleState) => React.ReactNode;
};

export type EazoSubscriptionsState = {
  subscriptions: EazoAppSubscription[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<EazoAppSubscriptionsResponse>;
  cancel: (subscriptionId: string) => Promise<EazoAppSubscription>;
  resume: (subscriptionId: string) => Promise<EazoAppSubscription>;
};

export type EazoSubscriptionManagementPanelProps = {
  title?: React.ReactNode;
  emptyLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  resumeLabel?: React.ReactNode;
  className?: string;
  children?: (subscriptions: EazoSubscriptionsState) => React.ReactNode;
};

function inactiveEntitlement(productKey: string): EazoEntitlement {
  return {
    app_id: "",
    product_key: productKey,
    entitlement_key: productKey,
    status: "inactive",
    active: false,
    payment_id: null,
    metadata: {},
  };
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(productKey: string) {
  return `${ENTITLEMENT_CACHE_PREFIX}${productKey}`;
}

export function rememberEazoEntitlement(entitlement: EazoEntitlement) {
  try {
    storage()?.setItem(cacheKey(entitlement.product_key), JSON.stringify(entitlement));
  } catch {
    // Cache is only an acceleration path; the platform entitlement API is authoritative.
  }
}

export function readCachedEazoEntitlement(productKey: string): EazoEntitlement | null {
  try {
    const raw = storage()?.getItem(cacheKey(productKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EazoEntitlement>;
    if (parsed.product_key === productKey && typeof parsed.status === "string") {
      const activeStatus = parsed.status === "active" || parsed.status === "canceling";
      return {
        ...inactiveEntitlement(productKey),
        ...parsed,
        active: activeStatus && Boolean(parsed.active),
      } as EazoEntitlement;
    }
  } catch {
    // Ignore malformed cache.
  }
  return null;
}

async function readEntitlementJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function getEazoPaymentSessionHeaders(): Promise<Record<string, string>> {
  const sessionHeader = await auth.getSessionHeader();
  return sessionHeader ? { "x-eazo-session": sessionHeader } : {};
}

export async function refreshEazoEntitlement(productKey = "premium"): Promise<EazoEntitlement> {
  const headers = await getEazoPaymentSessionHeaders();
  if (!headers["x-eazo-session"]) {
    const inactive = inactiveEntitlement(productKey);
    rememberEazoEntitlement(inactive);
    return inactive;
  }

  const response = await fetch(
    `/api/payments/entitlements?productKey=${encodeURIComponent(productKey)}`,
    {
      headers,
      cache: "no-store",
    },
  );
  const data = await readEntitlementJson(response);
  if (!response.ok) {
    throw new Error(
      getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Payment entitlement failed"),
    );
  }

  const entitlement = data as EazoEntitlement;
  rememberEazoEntitlement(entitlement);
  return entitlement;
}

async function readSubscriptionJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function refreshEazoSubscriptions(): Promise<EazoAppSubscriptionsResponse> {
  const headers = await getEazoPaymentSessionHeaders();
  if (!headers["x-eazo-session"]) return { items: [], pagination: { total: 0, limit: 50, offset: 0 } };

  const response = await fetch("/api/payments/subscriptions", {
    headers,
    cache: "no-store",
  });
  const data = await readSubscriptionJson(response);
  if (!response.ok) {
    throw new Error(
      getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Subscription list failed"),
    );
  }
  return data as EazoAppSubscriptionsResponse;
}

async function updateEazoSubscription(
  subscriptionId: string,
  action: "cancel" | "resume",
): Promise<EazoAppSubscription> {
  const headers = await getEazoPaymentSessionHeaders();
  if (!headers["x-eazo-session"]) {
    await auth.login();
  }
  const nextHeaders = await getEazoPaymentSessionHeaders();
  const response = await fetch(`/api/payments/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`, {
    method: "POST",
    headers: nextHeaders,
  });
  const data = await readSubscriptionJson(response);
  if (!response.ok) {
    throw new Error(
      getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Subscription update failed"),
    );
  }
  return (data as { subscription: EazoAppSubscription }).subscription;
}

export function useEazoSubscriptions(): EazoSubscriptionsState {
  const [subscriptions, setSubscriptions] = React.useState<EazoAppSubscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await refreshEazoSubscriptions();
      setSubscriptions(response.items || []);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Subscription list failed";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const cancel = React.useCallback(async (subscriptionId: string) => {
    const subscription = await updateEazoSubscription(subscriptionId, "cancel");
    await refresh();
    return subscription;
  }, [refresh]);

  const resume = React.useCallback(async (subscriptionId: string) => {
    const subscription = await updateEazoSubscription(subscriptionId, "resume");
    await refresh();
    return subscription;
  }, [refresh]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshEazoSubscriptions()
      .then((response) => {
        if (!cancelled) setSubscriptions(response.items || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Subscription list failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { subscriptions, loading, error, refresh, cancel, resume };
}

export function useEazoEntitlement(productKey = "premium"): EazoEntitlementState {
  const cached = readCachedEazoEntitlement(productKey);
  const [entitlement, setEntitlement] = React.useState<EazoEntitlement>(
    cached || inactiveEntitlement(productKey),
  );
  const [checking, setChecking] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const next = await refreshEazoEntitlement(productKey);
      setEntitlement(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment entitlement failed";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setChecking(false);
    }
  }, [productKey]);

  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setError(null);
    refreshEazoEntitlement(productKey)
      .then((next) => {
        if (!cancelled) setEntitlement(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Payment entitlement failed");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productKey]);

  return {
    entitlement,
    status: checking ? "checking" : entitlement.status,
    active: entitlement.active,
    checking,
    error,
    refresh,
  };
}

export function useEazoPaymentLifecycle(productKey = "premium"): EazoPaymentLifecycleState {
  const entitlement = useEazoEntitlement(productKey);
  const [starting, setStarting] = React.useState(false);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

  const checkout = React.useCallback(async () => {
    if (entitlement.active) return;

    setStarting(true);
    setCheckoutError(null);
    try {
      await startEazoCheckout(productKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      setCheckoutError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setStarting(false);
    }
  }, [entitlement.active, productKey]);

  return {
    ...entitlement,
    productKey,
    starting,
    pending: entitlement.status === "pending",
    error: checkoutError || entitlement.error,
    checkout,
  };
}

export function EazoPaymentLifecycle({
  productKey = "premium",
  children,
}: EazoPaymentLifecycleProps) {
  const payment = useEazoPaymentLifecycle(productKey);
  return <>{children(payment)}</>;
}

export function EazoPaymentUnlockPanel({
  productKey = "premium",
  title = "Premium unlock",
  description = "Unlock the paid experience for this app.",
  ctaLabel = "Unlock premium",
  activeLabel = "Premium active",
  pendingLabel = "Continue payment",
  className,
  children,
}: EazoPaymentUnlockPanelProps) {
  return (
    <EazoPaymentLifecycle productKey={productKey}>
      {(payment) => {
        if (children) return children(payment);

        const disabled = payment.active || payment.checking || payment.starting;
        const label = payment.active
          ? activeLabel
          : payment.starting
            ? "Opening checkout..."
            : payment.pending
              ? pendingLabel
              : ctaLabel;

        return (
          <section
            className={className}
            data-eazo-payment-status={payment.status}
            style={paymentUiStyles.unlockPanel}
          >
            <div style={paymentUiStyles.unlockHeader}>
              <div style={paymentUiStyles.unlockIcon} aria-hidden="true">
                {payment.active ? "✓" : payment.pending ? "↻" : "✦"}
              </div>
              <div>
                <p style={paymentUiStyles.eyebrow}>Eazo payments</p>
                <h2 style={paymentUiStyles.unlockTitle}>{title}</h2>
                <p style={paymentUiStyles.unlockDescription}>{description}</p>
              </div>
            </div>
            <div style={paymentUiStyles.statusRow}>
              <span style={{ ...paymentUiStyles.statusBadge, ...statusBadgeStyle(payment.status) }}>
                {paymentStatusLabel(payment)}
              </span>
              {payment.checking ? <span style={paymentUiStyles.statusHint}>Checking access...</span> : null}
            </div>
            <button
              type="button"
              disabled={disabled}
              aria-busy={payment.checking || payment.starting}
              style={{
                ...paymentUiStyles.primaryButton,
                ...(disabled ? paymentUiStyles.disabledButton : {}),
                ...(payment.active ? paymentUiStyles.activeButton : {}),
              }}
              onClick={() => {
                void payment.checkout();
              }}
            >
              {label}
            </button>
            {payment.error ? <p role="alert" style={paymentUiStyles.errorText}>{payment.error}</p> : null}
          </section>
        );
      }}
    </EazoPaymentLifecycle>
  );
}

export function EazoPaymentButton({
  productKey = "premium",
  children = "Unlock premium",
  unlockedChildren = "Unlocked",
  disabled,
  onCheckoutError,
  onUnlockedClick,
  ...buttonProps
}: EazoPaymentButtonProps) {
  const payment = useEazoPaymentLifecycle(productKey);

  async function handleClick() {
    if (payment.active) {
      onUnlockedClick?.();
      return;
    }
    try {
      await payment.checkout();
    } catch (err) {
      const checkoutError = err instanceof Error ? err : new Error("Checkout failed");
      onCheckoutError?.(checkoutError);
    }
  }

  const isDisabled = Boolean(disabled || payment.starting || payment.checking);

  return (
    <>
      <button
        {...buttonProps}
        type={buttonProps.type || "button"}
        disabled={isDisabled}
        aria-busy={payment.starting || payment.checking}
        data-eazo-payment-status={payment.status}
        style={{
          ...paymentUiStyles.primaryButton,
          ...(isDisabled ? paymentUiStyles.disabledButton : {}),
          ...(payment.active ? paymentUiStyles.activeButton : {}),
          ...(buttonProps.style || {}),
        }}
        onClick={handleClick}
      >
        {payment.active ? unlockedChildren : payment.starting ? "Opening checkout..." : children}
      </button>
      {payment.error ? (
        <p role="alert" style={paymentUiStyles.errorText}>{payment.error}</p>
      ) : null}
    </>
  );
}

export function EazoEntitlementGate({
  productKey = "premium",
  paid,
  free,
  loading = null,
  inactiveStatuses = ["inactive", "pending", "failed", "expired", "refunded", "disputed"],
}: EazoEntitlementGateProps) {
  const entitlement = useEazoEntitlement(productKey);
  if (entitlement.checking) return <>{loading}</>;
  if (entitlement.active) return <>{paid}</>;
  if (inactiveStatuses.includes(entitlement.status)) return <>{free}</>;
  return <>{loading ?? free}</>;
}

export function EazoSubscriptionManagementPanel({
  title = "Subscriptions",
  emptyLabel = "No subscriptions yet",
  cancelLabel = "Cancel",
  resumeLabel = "Resume",
  className,
  children,
}: EazoSubscriptionManagementPanelProps) {
  const state = useEazoSubscriptions();
  if (children) return <>{children(state)}</>;

  return (
    <section className={className} style={paymentUiStyles.subscriptionPanel}>
      <div style={paymentUiStyles.subscriptionHeader}>
        <div>
          <p style={paymentUiStyles.eyebrow}>Account access</p>
          <h2 style={paymentUiStyles.subscriptionTitle}>{title}</h2>
        </div>
        <button type="button" onClick={() => { void state.refresh(); }} style={paymentUiStyles.secondaryButton}>
          Refresh
        </button>
      </div>
      {state.loading ? <p style={paymentUiStyles.mutedText}>Loading subscriptions...</p> : null}
      {state.error ? <p role="alert" style={paymentUiStyles.errorText}>{state.error}</p> : null}
      {!state.loading && state.subscriptions.length === 0 ? (
        <div style={paymentUiStyles.emptyBox}>
          <strong>{emptyLabel}</strong>
          <span>Subscriptions you buy in Eazo apps will appear here.</span>
        </div>
      ) : null}
      {state.subscriptions.map((subscription) => {
        const isCanceling = subscription.cancel_at_period_end || subscription.status === "canceling";
        const canCancel = subscription.status === "active" && !isCanceling;
        const canResume = isCanceling;
        return (
          <article key={subscription.id} data-eazo-subscription-status={subscription.status} style={paymentUiStyles.subscriptionItem}>
            <div style={paymentUiStyles.subscriptionMeta}>
              <strong style={paymentUiStyles.subscriptionApp}>
                {subscription.app_title || subscription.product_name || subscription.product_key}
              </strong>
              <span style={paymentUiStyles.subscriptionProduct}>
                {subscription.product_name || subscription.product_key}
              </span>
              <span style={{ ...paymentUiStyles.statusBadge, ...subscriptionBadgeStyle(subscription) }}>
                {subscriptionStatusLabel(subscription)}
              </span>
              <span style={paymentUiStyles.subscriptionDate}>
                {subscriptionRenewalLabel(subscription)}
              </span>
            </div>
            <div style={paymentUiStyles.subscriptionActions}>
              <strong style={paymentUiStyles.subscriptionPrice}>
                {formatMoney(subscription.amount_total, subscription.currency)}
                <span style={paymentUiStyles.priceCadence}> / month</span>
              </strong>
              {canCancel ? (
                <button type="button" style={paymentUiStyles.secondaryButton} onClick={() => { void state.cancel(subscription.id); }}>
                  {cancelLabel}
                </button>
              ) : null}
              {canResume ? (
                <button type="button" style={paymentUiStyles.primarySmallButton} onClick={() => { void state.resume(subscription.id); }}>
                  {resumeLabel}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function paymentStatusLabel(payment: EazoPaymentLifecycleState) {
  if (payment.active) return "Access active";
  if (payment.starting) return "Opening checkout";
  if (payment.checking) return "Checking access";
  if (payment.pending) return "Payment pending";
  return "Ready to unlock";
}

function statusBadgeStyle(status: EazoEntitlementStatusValue): React.CSSProperties {
  if (status === "active" || status === "canceling") {
    return { background: "#ecfdf5", color: "#047857", borderColor: "#bbf7d0" };
  }
  if (status === "pending" || status === "checking") {
    return { background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" };
  }
  if (status === "failed" || status === "refunded" || status === "disputed" || status === "expired") {
    return { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" };
  }
  return { background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" };
}

function subscriptionBadgeStyle(subscription: EazoAppSubscription): React.CSSProperties {
  if (subscription.cancel_at_period_end || subscription.status === "canceling") {
    return { background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" };
  }
  if (subscription.status === "active" || subscription.status === "trialing") {
    return { background: "#ecfdf5", color: "#047857", borderColor: "#bbf7d0" };
  }
  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" };
  }
  return { background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" };
}

function subscriptionStatusLabel(subscription: EazoAppSubscription) {
  if (subscription.cancel_at_period_end || subscription.status === "canceling") return "Canceling";
  if (subscription.status === "active") return "Active";
  if (subscription.status === "past_due") return "Past due";
  if (subscription.status === "canceled") return "Canceled";
  return subscription.status.replace(/_/g, " ");
}

function subscriptionRenewalLabel(subscription: EazoAppSubscription) {
  const date = formatDate(subscription.current_period_end);
  if (!date) return "";
  if (subscription.cancel_at_period_end || subscription.status === "canceling") {
    return `Access until ${date}`;
  }
  if (subscription.status === "active" || subscription.status === "trialing") {
    return `Renews ${date}`;
  }
  return `Period ends ${date}`;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(epochSeconds?: number | null) {
  if (!epochSeconds) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(epochSeconds * 1000));
  } catch {
    return "";
  }
}

const paymentUiStyles = {
  unlockPanel: {
    boxSizing: "border-box",
    width: "100%",
    border: "1px solid rgba(23, 23, 23, 0.08)",
    borderRadius: 24,
    padding: 20,
    background:
      "linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(255, 247, 237, 0.92))",
    boxShadow: "0 22px 50px rgba(15, 23, 42, 0.10)",
    color: "#171717",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  } satisfies React.CSSProperties,
  unlockHeader: {
    display: "grid",
    gridTemplateColumns: "56px 1fr",
    gap: 14,
    alignItems: "start",
  } satisfies React.CSSProperties,
  unlockIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(234, 88, 12, 0.18)",
    background: "#fff7ed",
    color: "#ea580c",
    fontSize: 26,
    fontWeight: 900,
  } satisfies React.CSSProperties,
  eyebrow: {
    margin: 0,
    color: "#ea580c",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  } satisfies React.CSSProperties,
  unlockTitle: {
    margin: "5px 0 0",
    fontSize: 26,
    lineHeight: 1.1,
    letterSpacing: 0,
  } satisfies React.CSSProperties,
  unlockDescription: {
    margin: "9px 0 0",
    color: "#737373",
    fontSize: 15,
    lineHeight: 1.55,
  } satisfies React.CSSProperties,
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  } satisfies React.CSSProperties,
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    border: "1px solid",
    borderRadius: 999,
    padding: "0 10px",
    fontSize: 13,
    fontWeight: 800,
  } satisfies React.CSSProperties,
  statusHint: {
    color: "#737373",
    fontSize: 13,
    fontWeight: 650,
  } satisfies React.CSSProperties,
  primaryButton: {
    appearance: "none",
    width: "100%",
    minHeight: 52,
    marginTop: 16,
    border: "1px solid rgba(23, 23, 23, 0.12)",
    borderRadius: 999,
    background: "linear-gradient(135deg, #171717, #3f1d14 58%, #ea580c)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0,
    boxShadow: "0 16px 32px rgba(234, 88, 12, 0.22)",
  } satisfies React.CSSProperties,
  primarySmallButton: {
    appearance: "none",
    minHeight: 40,
    border: "1px solid rgba(23, 23, 23, 0.12)",
    borderRadius: 999,
    padding: "0 16px",
    background: "#171717",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 850,
  } satisfies React.CSSProperties,
  activeButton: {
    background: "#047857",
    boxShadow: "0 16px 32px rgba(4, 120, 87, 0.18)",
  } satisfies React.CSSProperties,
  disabledButton: {
    cursor: "default",
    opacity: 0.68,
  } satisfies React.CSSProperties,
  secondaryButton: {
    appearance: "none",
    minHeight: 40,
    border: "1px solid rgba(23, 23, 23, 0.12)",
    borderRadius: 999,
    padding: "0 14px",
    background: "#fff",
    color: "#171717",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  } satisfies React.CSSProperties,
  errorText: {
    margin: "12px 0 0",
    border: "1px solid #fecaca",
    borderRadius: 14,
    padding: "10px 12px",
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 1.45,
  } satisfies React.CSSProperties,
  mutedText: {
    margin: "12px 0 0",
    color: "#737373",
    fontSize: 14,
  } satisfies React.CSSProperties,
  subscriptionPanel: {
    boxSizing: "border-box",
    width: "100%",
    border: "1px solid rgba(23, 23, 23, 0.08)",
    borderRadius: 24,
    padding: 18,
    background: "rgba(255, 255, 255, 0.94)",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
    color: "#171717",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  } satisfies React.CSSProperties,
  subscriptionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  } satisfies React.CSSProperties,
  subscriptionTitle: {
    margin: "4px 0 0",
    fontSize: 22,
    lineHeight: 1.12,
    letterSpacing: 0,
  } satisfies React.CSSProperties,
  emptyBox: {
    display: "grid",
    gap: 4,
    border: "1px dashed rgba(23, 23, 23, 0.14)",
    borderRadius: 18,
    padding: 16,
    color: "#737373",
    background: "#fafaf9",
    fontSize: 14,
  } satisfies React.CSSProperties,
  subscriptionItem: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 14,
    alignItems: "center",
    borderTop: "1px solid rgba(23, 23, 23, 0.08)",
    padding: "14px 0 0",
    marginTop: 14,
  } satisfies React.CSSProperties,
  subscriptionMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  } satisfies React.CSSProperties,
  subscriptionApp: {
    flexBasis: "100%",
    fontSize: 16,
    lineHeight: 1.2,
  } satisfies React.CSSProperties,
  subscriptionProduct: {
    color: "#737373",
    fontSize: 14,
    fontWeight: 650,
  } satisfies React.CSSProperties,
  subscriptionDate: {
    color: "#737373",
    fontSize: 13,
  } satisfies React.CSSProperties,
  subscriptionActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  } satisfies React.CSSProperties,
  subscriptionPrice: {
    fontSize: 16,
    whiteSpace: "nowrap",
  } satisfies React.CSSProperties,
  priceCadence: {
    color: "#737373",
    fontSize: 13,
    fontWeight: 650,
  } satisfies React.CSSProperties,
};
