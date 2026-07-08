import {
  PaymentUnlockPanel,
  PremiumEntitlementGate
} from "@/components/eazo-payments/PaymentUnlockPanel";

export default function HomePage() {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>SDK-owned payment lifecycle</p>
        <h1 style={styles.title}>One-time premium access</h1>
        <p style={styles.copy}>
          This example lets the app choose placement and copy while the SDK owns checkout,
          status polling, entitlement refresh, and polished access states.
        </p>
      </section>

      <PaymentUnlockPanel
        productKey="premium"
        title="Unlock Premium"
        description="One-time payment through the Eazo marketplace connector."
        ctaLabel="Unlock premium"
        activeLabel="Premium active"
      />

      <PremiumEntitlementGate
        paid={
          <section style={{ ...styles.accessCard, borderColor: "#86efac", background: "#f0fdf4" }}>
            <span style={styles.accessIcon}>✓</span>
            <div>
              <h2 style={styles.accessTitle}>Premium access is active</h2>
              <p style={styles.accessCopy}>Paid features can render immediately after checkout succeeds.</p>
            </div>
          </section>
        }
        free={
          <section style={styles.accessCard}>
            <span style={styles.accessIcon}>✦</span>
            <div>
              <h2 style={styles.accessTitle}>Free experience</h2>
              <p style={styles.accessCopy}>Unlock premium to reveal paid content and advanced controls.</p>
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
    background: "#fffaf4",
    color: "#171717",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  hero: {
    display: "grid",
    gap: 10,
  },
  eyebrow: {
    margin: 0,
    color: "#ea580c",
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
    maxWidth: 590,
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
    background: "#fff7ed",
    color: "#ea580c",
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
