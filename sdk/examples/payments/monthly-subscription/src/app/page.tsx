import {
  PaymentUnlockPanel,
  PremiumEntitlementGate
} from "@/components/eazo-payments/PaymentUnlockPanel";
import { SubscriptionManagementPanel } from "@/components/eazo-payments/SubscriptionManagementPanel";

export default function HomePage() {
  return (
    <main style={{ margin: "48px auto", maxWidth: 720, fontFamily: "system-ui, sans-serif" }}>
      <h1>Eazo Monthly Subscription Example</h1>
      <p>
        This page uses the SDK-owned payment lifecycle. The app only chooses
        where to render the upgrade panel and how to style it.
      </p>

      <PaymentUnlockPanel
        productKey="premium"
        title="Subscribe to Premium"
        description="Monthly subscription through the Eazo marketplace connector."
        ctaLabel="Subscribe monthly"
        activeLabel="Premium subscription active"
      />

      <SubscriptionManagementPanel />

      <PremiumEntitlementGate
        paid={<section><h2>Premium content</h2><p>You have access.</p></section>}
        free={<section><h2>Free content</h2><p>Unlock premium to continue.</p></section>}
        checking={<p>Checking payment status...</p>}
      />
    </main>
  );
}
