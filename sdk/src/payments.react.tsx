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
          <section className={className} data-eazo-payment-status={payment.status}>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <button
              type="button"
              disabled={disabled}
              aria-busy={payment.checking || payment.starting}
              onClick={() => {
                void payment.checkout();
              }}
            >
              {label}
            </button>
            {payment.error ? <p role="alert">{payment.error}</p> : null}
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
        onClick={handleClick}
      >
        {payment.active ? unlockedChildren : payment.starting ? "Opening checkout..." : children}
      </button>
      {payment.error ? (
        <p role="alert">{payment.error}</p>
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
    <section className={className}>
      <h2>{title}</h2>
      {state.loading ? <p>Loading subscriptions...</p> : null}
      {state.error ? <p role="alert">{state.error}</p> : null}
      {!state.loading && state.subscriptions.length === 0 ? <p>{emptyLabel}</p> : null}
      {state.subscriptions.map((subscription) => {
        const isCanceling = subscription.cancel_at_period_end || subscription.status === "canceling";
        const canCancel = subscription.status === "active" && !isCanceling;
        const canResume = isCanceling;
        return (
          <article key={subscription.id} data-eazo-subscription-status={subscription.status}>
            <strong>{subscription.app_title || subscription.product_name || subscription.product_key}</strong>
            <span>{subscription.product_name || subscription.product_key}</span>
            {canCancel ? (
              <button type="button" onClick={() => { void state.cancel(subscription.id); }}>
                {cancelLabel}
              </button>
            ) : null}
            {canResume ? (
              <button type="button" onClick={() => { void state.resume(subscription.id); }}>
                {resumeLabel}
              </button>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
