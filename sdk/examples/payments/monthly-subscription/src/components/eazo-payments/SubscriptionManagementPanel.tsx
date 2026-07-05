"use client";

import * as React from "react";
import {
  EazoSubscriptionManagementPanel,
  type EazoSubscriptionsState
} from "@eazo/sdk/payments/react";

export type SubscriptionManagementPanelProps = {
  children?: (subscriptions: EazoSubscriptionsState) => React.ReactNode;
};

export function SubscriptionManagementPanel({ children }: SubscriptionManagementPanelProps) {
  return (
    <EazoSubscriptionManagementPanel
      title="Your app subscriptions"
      emptyLabel="No subscriptions yet"
      cancelLabel="Cancel renewal"
      resumeLabel="Resume renewal"
    >
      {children}
    </EazoSubscriptionManagementPanel>
  );
}
