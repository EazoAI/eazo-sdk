import {
  PaymentUnlockPanel,
  PremiumEntitlementGate
} from "@/components/eazo-payments/PaymentUnlockPanel";
import { SubscriptionManagementPanel } from "@/components/eazo-payments/SubscriptionManagementPanel";

export default function HomePage() {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>SDK-owned subscription lifecycle</p>
        <h1 style={styles.title}>Monthly premium access</h1>
        <p style={styles.copy}>
          The SDK owns checkout, status polling, entitlement refresh, cancel/resume actions,
          and default subscription UI. The app can focus on product copy and styling.
        </p>
      </section>

      <PaymentUnlockPanel
        productKey="premium"
        title="Subscribe to Premium"
        description="Monthly subscription through the Eazo marketplace connector."
        ctaLabel="Subscribe monthly"
        activeLabel="Premium subscription active"
      />

      <SubscriptionManagementPanel />

      <PremiumEntitlementGate
        paid={
          <section style={{ ...styles.accessCard, borderColor: "#86efac", background: "#f0fdf4" }}>
            <span style={styles.accessIcon}>✓</span>
            <div>
              <h2 style={styles.accessTitle}>Subscription access is active</h2>
              <p style={styles.accessCopy}>Premium monthly features can render from the platform entitlement state.</p>
            </div>
          </section>
        }
        free={
          <section style={styles.accessCard}>
            <span style={styles.accessIcon}>✦</span>
            <div>
              <h2 style={styles.accessTitle}>Free experience</h2>
              <p style={styles.accessCopy}>Subscribe monthly to unlock premium tools in this app.</p>
            </div>
          </section>
        }
        checking={<p style={styles.copy}>Checking payment status...</p>}
      />
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100svh",
    boxSizing: "border-box" as const,
    display: "grid",
    gap: 22,
    alignContent: "center",
    margin: "0 auto",
    maxWidth: 760,
    padding: "32px 20px",
    background:
      "radial-gradient(circle at 15% 0%, rgba(20, 184, 166, 0.14), transparent 34%), #fffaf4",
    color: "#171717",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  hero: {
    display: "grid",
    gap: 10,
  },
  eyebrow: {
    margin: 0,
    color: "#0f766e",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
  },
  title: {
    margin: 0,
    fontSize: "clamp(36px, 8vw, 60px)",
    lineHeight: 1,
    letterSpacing: 0,
  },
  copy: {
    margin: 0,
    maxWidth: 610,
    color: "#737373",
    fontSize: 17,
    lineHeight: 1.6,
  },
  accessCard: {
    display: "grid",
    gridTemplateColumns: "48px 1fr",
    gap: 14,
    alignItems: "center",
    border: "1px solid rgba(23, 23, 23, 0.08)",
    borderRadius: 22,
    padding: 18,
    background: "#fff",
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.08)",
  },
  accessIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "#f0fdfa",
    color: "#0f766e",
    fontSize: 22,
    fontWeight: 900,
  },
  accessTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.2,
  },
  accessCopy: {
    margin: "6px 0 0",
    color: "#737373",
    fontSize: 15,
    lineHeight: 1.5,
  },
};
