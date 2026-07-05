import { render, screen } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { assertNoLegacyPaymentFlowSource } from "@eazo/sdk/payments/testing";
import {
  PaymentUnlockPanel,
  PremiumEntitlementGate
} from "../../components/eazo-payments/PaymentUnlockPanel";

const mocks = vi.hoisted(() => ({
  checkout: vi.fn()
}));

vi.mock("@eazo/sdk/payments/react", () => ({
  EazoPaymentUnlockPanel: ({
    title = "Premium unlock",
    ctaLabel = "Unlock premium"
  }: {
    title?: React.ReactNode;
    ctaLabel?: React.ReactNode;
  }) => (
    <section data-eazo-payment-status="inactive">
      <h2>{title}</h2>
      <button type="button" onClick={() => mocks.checkout()}>
        {ctaLabel}
      </button>
    </section>
  ),
  EazoPaymentLifecycle: ({ children }: { children: (payment: unknown) => React.ReactNode }) =>
    children({
      productKey: "premium",
      entitlement: {
        app_id: "app_test",
        product_key: "premium",
        entitlement_key: "premium",
        status: "inactive",
        active: false,
        payment_id: null,
        metadata: {}
      },
      status: "inactive",
      active: false,
      checking: false,
      starting: false,
      pending: false,
      error: null,
      refresh: vi.fn(),
      checkout: mocks.checkout
    })
}));

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (/\.test\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

describe("Eazo payment UI contract", () => {
  it("uses the SDK lifecycle panel for checkout UI", () => {
    render(<PaymentUnlockPanel />);

    expect(screen.getByText("Premium unlock")).toBeTruthy();
    screen.getByRole("button", { name: "Unlock premium" }).click();
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
  });

  it("gates paid UI through the SDK lifecycle state", () => {
    render(<PremiumEntitlementGate paid={<div>Paid</div>} free={<div>Free</div>} />);
    expect(screen.getByText("Free")).toBeTruthy();
  });

  it("does not contain legacy hand-written checkout flow code", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    for (const filePath of listSourceFiles(srcDir)) {
      const source = fs.readFileSync(filePath, "utf8");
      assertNoLegacyPaymentFlowSource(source, path.relative(process.cwd(), filePath));
    }
  });
});
