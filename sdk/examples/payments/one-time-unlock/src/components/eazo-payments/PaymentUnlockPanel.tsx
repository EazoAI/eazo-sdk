"use client";

import * as React from "react";
import {
  EazoPaymentUnlockPanel,
  type EazoPaymentUnlockPanelProps,
  EazoPaymentLifecycle
} from "@eazo/sdk/payments/react";

export type PaymentUnlockPanelProps = EazoPaymentUnlockPanelProps;

export function PaymentUnlockPanel(props: PaymentUnlockPanelProps) {
  return (
    <EazoPaymentUnlockPanel
      title="Premium unlock"
      description="Unlock the paid experience for this app."
      ctaLabel="Unlock premium"
      activeLabel="Premium active"
      pendingLabel="Continue payment"
      {...props}
    />
  );
}

export type PremiumEntitlementGateProps = {
  paid: React.ReactNode;
  free: React.ReactNode;
  checking?: React.ReactNode;
  productKey?: string;
};

export function PremiumEntitlementGate({
  paid,
  free,
  checking = null,
  productKey = "premium"
}: PremiumEntitlementGateProps) {
  return (
    <EazoPaymentLifecycle productKey={productKey}>
      {(payment) => {
        if (payment.checking) return <>{checking}</>;
        if (payment.active) return <>{paid}</>;
        return <>{free}</>;
      }}
    </EazoPaymentLifecycle>
  );
}
