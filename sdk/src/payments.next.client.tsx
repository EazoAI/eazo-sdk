"use client";

import * as React from "react";

import {
  clearRememberedEazoPaymentId,
  getEazoPaymentErrorMessage,
  readEazoPaymentIdFromUrl,
  readRememberedEazoPaymentId,
  type EazoPaymentApiErrorBody,
  type EazoPaymentStatus,
} from "./payments";
import { getEazoPaymentSessionHeaders, refreshEazoEntitlement } from "./payments.react";

const POLLABLE_STATUSES = new Set(["pending", "processing"]);

export type EazoPaymentSuccessPageProps = {
  homeHref?: string;
  continueLabel?: React.ReactNode;
  homeLabel?: React.ReactNode;
  maxAttempts?: number;
  pollIntervalMs?: number;
  className?: string;
};

export function EazoPaymentSuccessPage({
  homeHref = "/",
  continueLabel = "Continue",
  homeLabel = "Return home",
  maxAttempts = 15,
  pollIntervalMs = 1500,
  className,
}: EazoPaymentSuccessPageProps) {
  const [status, setStatus] = React.useState<EazoPaymentStatus | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const paymentId = readEazoPaymentIdFromUrl() || readRememberedEazoPaymentId();
    if (!paymentId) {
      setError("We could not find this payment. Please return to the app and try again.");
      return;
    }
    const confirmedPaymentId = paymentId;

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      const headers = await getEazoPaymentSessionHeaders();
      const response = await fetch(`/api/payments/status?paymentId=${encodeURIComponent(confirmedPaymentId)}`, {
        headers,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;

      if (!response.ok) {
        setError(getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Payment status failed"));
        return;
      }

      const nextStatus = data as EazoPaymentStatus;
      setStatus(nextStatus);
      if (nextStatus.paid) {
        const productKey =
          nextStatus.entitlement?.product_key ||
          nextStatus.metadata?.product_key ||
          new URLSearchParams(window.location.search).get("product") ||
          "premium";
        await refreshEazoEntitlement(productKey);
        clearRememberedEazoPaymentId();
        return;
      }

      if (POLLABLE_STATUSES.has(nextStatus.status)) {
        if (attempts < maxAttempts) {
          window.setTimeout(poll, pollIntervalMs);
          return;
        }
        setError("Payment is still processing. Please return to the app and refresh in a moment.");
      }
    }

    poll().catch((err) => {
      setError(err instanceof Error ? err.message : "Payment status failed");
    });
    return () => {
      cancelled = true;
    };
  }, [maxAttempts, pollIntervalMs]);

  if (error) {
    return (
      <PaymentStateShell
        className={className}
        tone="attention"
        eyebrow="Payment"
        title="Payment needs attention"
        description={error}
        actionHref={homeHref}
        actionLabel={homeLabel}
      />
    );
  }

  if (status?.paid) {
    return (
      <PaymentStateShell
        className={className}
        tone="success"
        eyebrow="Payment"
        title="Access ready"
        description="Your payment is complete."
        actionHref={homeHref}
        actionLabel={continueLabel}
        detail={status.product_name}
      />
    );
  }

  if (status && !POLLABLE_STATUSES.has(status.status)) {
    return (
      <PaymentStateShell
        className={className}
        tone="failed"
        eyebrow="Checkout"
        title="Payment was not completed"
        description={`Status: ${status.status}`}
        actionHref={homeHref}
        actionLabel="Try again"
        detail={status.product_name}
      />
    );
  }

  return (
    <PaymentStateShell
      className={className}
      tone="processing"
      eyebrow="Payment"
      title="Confirming payment"
      description="This usually takes a few seconds."
    />
  );
}

export type EazoPaymentCancelPageProps = {
  homeHref?: string;
  homeLabel?: React.ReactNode;
  className?: string;
};

export function EazoPaymentCancelPage({
  homeHref = "/",
  homeLabel = "Return home",
  className,
}: EazoPaymentCancelPageProps) {
  React.useEffect(() => {
    clearRememberedEazoPaymentId();
  }, []);

  return (
    <PaymentStateShell
      className={className}
      tone="neutral"
      eyebrow="Checkout"
      title="Checkout cancelled"
      description="No payment was collected. You can return to the app and try again whenever you are ready."
      actionHref={homeHref}
      actionLabel={homeLabel}
    />
  );
}

type PaymentStateTone = "processing" | "success" | "attention" | "failed" | "neutral";

type PaymentStateShellProps = {
  tone: PaymentStateTone;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  actionHref?: string;
  actionLabel?: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
};

const toneStyles: Record<PaymentStateTone, { bg: string; fg: string; ring: string; icon: React.ReactNode }> = {
  processing: { bg: "#fff7ed", fg: "#c2410c", ring: "#fed7aa", icon: null },
  success: { bg: "#ecfdf5", fg: "#047857", ring: "#bbf7d0", icon: "✓" },
  attention: { bg: "#fff7ed", fg: "#c2410c", ring: "#fed7aa", icon: "!" },
  failed: { bg: "#fef2f2", fg: "#b91c1c", ring: "#fecaca", icon: "×" },
  neutral: { bg: "#f8fafc", fg: "#475569", ring: "#e2e8f0", icon: "↩" },
};

function PaymentStateShell({
  tone,
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  detail,
  className,
}: PaymentStateShellProps) {
  const visual = toneStyles[tone];
  return (
    <main className={className} style={paymentPageStyles.shell}>
      <style>{paymentStateCss}</style>
      <section style={paymentPageStyles.card} aria-live="polite">
        <div style={{ ...paymentPageStyles.iconWrap, background: visual.bg, color: visual.fg, borderColor: visual.ring }}>
          {tone === "processing" ? <span style={paymentPageStyles.spinner} aria-hidden="true" /> : visual.icon}
        </div>
        <p style={{ ...paymentPageStyles.eyebrow, color: visual.fg }}>{eyebrow}</p>
        <h1 style={paymentPageStyles.title}>{title}</h1>
        <p style={paymentPageStyles.description}>{description}</p>
        {detail ? <p style={paymentPageStyles.detail}>{detail}</p> : null}
        {actionHref && actionLabel ? (
          <a href={actionHref} style={paymentPageStyles.action}>
            {actionLabel}
          </a>
        ) : null}
      </section>
    </main>
  );
}

const paymentStateCss = `
@keyframes eazo-payment-spin {
  to { transform: rotate(360deg); }
}
`;

const paymentPageStyles = {
  shell: {
    minHeight: "100svh",
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "#f9fafb",
    color: "#111827",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  } satisfies React.CSSProperties,
  card: {
    width: "min(100%, 420px)",
    boxSizing: "border-box",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: "28px 22px",
    background: "#fff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
    textAlign: "center",
  } satisfies React.CSSProperties,
  iconWrap: {
    width: 48,
    height: 48,
    margin: "0 auto 16px",
    border: "1px solid",
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    fontSize: 22,
    fontWeight: 800,
  } satisfies React.CSSProperties,
  spinner: {
    width: 24,
    height: 24,
    borderRadius: "999px",
    border: "3px solid rgba(194, 65, 12, 0.18)",
    borderTopColor: "#c2410c",
    animation: "eazo-payment-spin 0.9s linear infinite",
  } satisfies React.CSSProperties,
  eyebrow: {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 750,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  } satisfies React.CSSProperties,
  title: {
    margin: 0,
    fontSize: "clamp(24px, 7vw, 32px)",
    lineHeight: 1.12,
    letterSpacing: 0,
  } satisfies React.CSSProperties,
  description: {
    margin: "12px auto 0",
    maxWidth: 330,
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 1.55,
  } satisfies React.CSSProperties,
  detail: {
    margin: "18px auto 0",
    width: "fit-content",
    maxWidth: "100%",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#f3f4f6",
    color: "#4b5563",
    fontSize: 13,
    fontWeight: 700,
  } satisfies React.CSSProperties,
  action: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 24,
    padding: "0 22px",
    borderRadius: 12,
    background: "#111827",
    color: "#fff",
    textDecoration: "none",
    fontSize: 15,
    fontWeight: 750,
  } satisfies React.CSSProperties,
};
