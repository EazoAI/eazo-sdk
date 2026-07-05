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
  maxAttempts?: number;
  pollIntervalMs?: number;
};

export function EazoPaymentSuccessPage({
  homeHref = "/",
  maxAttempts = 15,
  pollIntervalMs = 1500,
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
      <main>
        <h1>Payment needs attention</h1>
        <p>{error}</p>
        <a href={homeHref}>Return home</a>
      </main>
    );
  }

  if (status?.paid) {
    return (
      <main>
        <h1>Premium unlocked</h1>
        <p>Your payment is complete.</p>
        <a href={homeHref}>Continue</a>
      </main>
    );
  }

  if (status && !POLLABLE_STATUSES.has(status.status)) {
    return (
      <main>
        <h1>Payment was not completed</h1>
        <p>Status: {status.status}</p>
        <a href={homeHref}>Try again</a>
      </main>
    );
  }

  return (
    <main>
      <h1>Confirming payment</h1>
      <p>This usually takes a few seconds.</p>
    </main>
  );
}

export type EazoPaymentCancelPageProps = {
  homeHref?: string;
};

export function EazoPaymentCancelPage({ homeHref = "/" }: EazoPaymentCancelPageProps) {
  React.useEffect(() => {
    clearRememberedEazoPaymentId();
  }, []);

  return (
    <main>
      <h1>Checkout cancelled</h1>
      <p>No payment was collected.</p>
      <a href={homeHref}>Return home</a>
    </main>
  );
}
