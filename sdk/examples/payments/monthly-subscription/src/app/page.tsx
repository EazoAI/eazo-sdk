import {
  PaymentUnlockPanel,
  PremiumEntitlementGate
} from "@/components/eazo-payments/PaymentUnlockPanel";
import { SubscriptionManagementPanel } from "@/components/eazo-payments/SubscriptionManagementPanel";

export default function HomePage() {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>Subscription</p>
        <h1 style={styles.title}>Monthly access</h1>
        <p style={styles.copy}>
          Use this as a working subscription reference. Match the final styling to the app.
        </p>
      </section>

      <PaymentUnlockPanel
        productKey="premium"
        title="Paid access"
        description="Monthly subscription through Eazo."
        ctaLabel="Subscribe"
        activeLabel="Subscription active"
      />

      <SubscriptionManagementPanel />

      <PremiumEntitlementGate
        paid={
          <section style={{ ...styles.accessCard, borderColor: "#86efac", background: "#f0fdf4" }}>
            <span style={styles.accessIcon}>✓</span>
            <div>
              <h2 style={styles.accessTitle}>Access active</h2>
              <p style={styles.accessCopy}>Render subscriber features from the platform entitlement state.</p>
            </div>
          </section>
        }
        free={
          <section style={styles.accessCard}>
            <span style={styles.accessIcon}>$</span>
            <div>
              <h2 style={styles.accessTitle}>Free experience</h2>
              <p style={styles.accessCopy}>Show the subscription CTA until access is active.</p>
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
    gap: 18,
    alignContent: "center",
    margin: "0 auto",
    maxWidth: 680,
    padding: "32px 20px",
    background: "#f9fafb",
    color: "#111827",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  hero: {
    display: "grid",
    gap: 10,
  },
  eyebrow: {
    margin: 0,
    color: "#6b7280",
    fontSize: 12,
    fontWeight: 750,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },
  title: {
    margin: 0,
    fontSize: "clamp(28px, 7vw, 40px)",
    lineHeight: 1.1,
    letterSpacing: 0,
  },
  copy: {
    margin: 0,
    maxWidth: 610,
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 1.5,
  },
  accessCard: {
    display: "grid",
    gridTemplateColumns: "48px 1fr",
    gap: 14,
    alignItems: "center",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
    background: "#fff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },
  accessIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "#f9fafb",
    color: "#111827",
    fontSize: 18,
    fontWeight: 750,
  },
  accessTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.2,
  },
  accessCopy: {
    margin: "6px 0 0",
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 1.5,
  },
};
