#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";

type ScaffoldOptions = {
  cwd?: string;
  recipe?: string;
  force?: boolean;
  dryRun?: boolean;
};

type TemplateFile = {
  filePath: string;
  content: string;
  /** Shared with other recipes: kept when it exists, with this edit to make instead. */
  existingHint?: string;
};

const DEFAULT_RECIPE = "one-time-unlock";
const SUPPORTED_RECIPES = new Set(["one-time-unlock", "monthly-subscription", "one-time-items"]);
export const EAZO_PAYMENTS_MIN_SDK_VERSION = "0.22.3";
// Recipes added after the Payment SDK baseline need a newer declared SDK.
const RECIPE_MIN_SDK_VERSION: Record<string, string> = {
  "one-time-items": "0.23.0",
};
export const EAZO_PAYMENTS_REQUIRED_EXPORTS = [
  "./payments",
  "./payments/react",
  "./payments/server",
  "./payments/next",
  "./payments/next/client",
  "./payments/testing",
] as const;

type PackageJson = {
  version?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type PaymentsDoctorOptions = {
  cwd?: string;
  minimumVersion?: string;
};

export type PaymentsDoctorReport = {
  ok: boolean;
  cwd: string;
  minimumVersion: string;
  declaredSpec: string | null;
  installedVersion: string | null;
  lockfiles: string[];
  missingExports: string[];
  issues: string[];
};

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: boolean;
};

function readJsonFile(filePath: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function parseSemver(value: string): ParsedSemver | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Boolean(match[4]),
  };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease === right.prerelease) return 0;
  return left.prerelease ? -1 : 1;
}

function isVersionAtLeast(version: string, minimumVersion: string): boolean {
  const parsedVersion = parseSemver(version);
  const parsedMinimum = parseSemver(minimumVersion);
  if (!parsedVersion || !parsedMinimum) return false;
  return compareSemver(parsedVersion, parsedMinimum) >= 0;
}

function declaredSdkSpec(packageJson: PackageJson | null): string | null {
  if (!packageJson) return null;
  for (const dependencies of [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ]) {
    const spec = dependencies?.["@eazo/sdk"]?.trim();
    if (spec) return spec;
  }
  return null;
}

function declaredRegistryVersion(spec: string | null): string | null {
  if (!spec || /^(?:https?:|file:|git(?:\+|:)|github:|workspace:|link:)/.test(spec)) {
    return null;
  }
  const match = spec.match(/(?:^|[~^<>=\s])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return match?.[1] ?? null;
}

export function inspectPaymentsInstallation(
  options: PaymentsDoctorOptions = {},
): PaymentsDoctorReport {
  const cwd = path.resolve(options.cwd || process.cwd());
  const minimumVersion = options.minimumVersion || EAZO_PAYMENTS_MIN_SDK_VERSION;
  const projectPackage = readJsonFile(path.join(cwd, "package.json"));
  const installedPackage = readJsonFile(
    path.join(cwd, "node_modules", "@eazo", "sdk", "package.json"),
  );
  const declaredSpec = declaredSdkSpec(projectPackage);
  const installedVersion = installedPackage?.version?.trim() || null;
  const lockfiles = [
    "bun.lock",
    "bun.lockb",
    "pnpm-lock.yaml",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
  ].filter((filename) => fs.existsSync(path.join(cwd, filename)));
  const installedExports = new Set(Object.keys(installedPackage?.exports || {}));
  const missingExports = EAZO_PAYMENTS_REQUIRED_EXPORTS.filter(
    (exportPath) => !installedExports.has(exportPath),
  );
  const issues: string[] = [];

  if (!projectPackage) {
    issues.push("Missing or unreadable package.json.");
  }
  if (!declaredSpec) {
    issues.push("package.json must declare @eazo/sdk.");
  }
  const declaredVersion = declaredRegistryVersion(declaredSpec);
  if (declaredVersion && !isVersionAtLeast(declaredVersion, minimumVersion)) {
    issues.push(
      `package.json declares @eazo/sdk ${declaredSpec}, below the Payment SDK minimum ${minimumVersion}.`,
    );
  }
  if (!installedPackage || !installedVersion) {
    issues.push("Install @eazo/sdk before running the Payment SDK scaffold.");
  } else if (!isVersionAtLeast(installedVersion, minimumVersion)) {
    issues.push(
      `Installed @eazo/sdk ${installedVersion} is below the Payment SDK minimum ${minimumVersion}.`,
    );
  }
  if (missingExports.length > 0) {
    issues.push(`Installed @eazo/sdk is missing exports: ${missingExports.join(", ")}.`);
  }
  if (lockfiles.length === 0) {
    issues.push("No package-manager lockfile found; install dependencies and commit the lockfile.");
  }

  return {
    ok: issues.length === 0,
    cwd,
    minimumVersion,
    declaredSpec,
    installedVersion,
    lockfiles,
    missingExports,
    issues,
  };
}

export function formatPaymentsDoctorReport(report: PaymentsDoctorReport): string {
  if (report.ok) {
    return [
      "Eazo Payments SDK doctor passed.",
      `- minimum: ${report.minimumVersion}`,
      `- declared: ${report.declaredSpec}`,
      `- installed: ${report.installedVersion}`,
      `- lockfile: ${report.lockfiles.join(", ")}`,
    ].join("\n");
  }
  return [
    "Eazo Payments SDK doctor failed:",
    ...report.issues.map((issue) => `- ${issue}`),
    "Install the canonical sdk_package_spec, update the lockfile, and run this command again.",
  ].join("\n");
}

function normalizeNewline(content: string) {
  return content.trimStart().replace(/\s+$/, "") + "\n";
}

function paymentCatalogTemplate(recipe: string) {
  const isSubscription = recipe === "monthly-subscription";
  return normalizeNewline(`
import {
  EAZO_PAYMENT_CURRENCY,
  EAZO_PAYMENT_MODE,
  defineEazoPaymentProducts,
} from "@eazo/sdk/payments";
import type { EazoPaymentProduct } from "@eazo/sdk/payments";

export const PAYMENT_PRODUCTS = defineEazoPaymentProducts({
  premium: {
    key: "premium",
    name: "${isSubscription ? "Premium monthly subscription" : "Premium unlock"}",
    unitAmount: 499,
    currency: EAZO_PAYMENT_CURRENCY.USD,
    mode: ${isSubscription ? "EAZO_PAYMENT_MODE.SUBSCRIPTION" : "EAZO_PAYMENT_MODE.ONE_TIME"},
  },
} as const);

export type PaymentProductKey = keyof typeof PAYMENT_PRODUCTS;

export function getPaymentProduct(productKey: string): EazoPaymentProduct | null {
  return PAYMENT_PRODUCTS[productKey as PaymentProductKey] ?? null;
}
`);
}

function checkoutRouteTemplate() {
  return normalizeNewline(`
import { createEazoCheckoutRoute } from "@eazo/sdk/payments/next";
import { getPaymentProduct } from "@/lib/eazo-payments/catalog";

export const POST = createEazoCheckoutRoute({ getProduct: getPaymentProduct });
`);
}

function statusRouteTemplate() {
  return normalizeNewline(`
import { createEazoPaymentStatusRoute } from "@eazo/sdk/payments/next";

export const GET = createEazoPaymentStatusRoute();
`);
}

function entitlementRouteTemplate() {
  return normalizeNewline(`
import { createEazoEntitlementRoute } from "@eazo/sdk/payments/next";

export const GET = createEazoEntitlementRoute();
`);
}

function subscriptionsRouteTemplate() {
  return normalizeNewline(`
import { createEazoSubscriptionsRoute } from "@eazo/sdk/payments/next";

export const GET = createEazoSubscriptionsRoute();
`);
}

function cancelSubscriptionRouteTemplate() {
  return normalizeNewline(`
import { createEazoCancelSubscriptionRoute } from "@eazo/sdk/payments/next";

export const POST = createEazoCancelSubscriptionRoute();
`);
}

function resumeSubscriptionRouteTemplate() {
  return normalizeNewline(`
import { createEazoResumeSubscriptionRoute } from "@eazo/sdk/payments/next";

export const POST = createEazoResumeSubscriptionRoute();
`);
}

function successPageTemplate() {
  return normalizeNewline(`
"use client";

import { EazoPaymentSuccessPage } from "@eazo/sdk/payments/next/client";

export default function PaymentSuccessPage() {
  return <EazoPaymentSuccessPage />;
}
`);
}

function cancelPageTemplate() {
  return normalizeNewline(`
"use client";

import { EazoPaymentCancelPage } from "@eazo/sdk/payments/next/client";

export default function PaymentCancelPage() {
  return <EazoPaymentCancelPage />;
}
`);
}

function paymentUnlockPanelTemplate() {
  return normalizeNewline(`
"use client";

import * as React from "react";
import {
  EazoPaymentUnlockPanel,
  type EazoPaymentUnlockPanelProps,
} from "@eazo/sdk/payments/react";
import { EazoPaymentLifecycle } from "@eazo/sdk/payments/react";

export type PaymentUnlockPanelProps = EazoPaymentUnlockPanelProps;

export function PaymentUnlockPanel(props: PaymentUnlockPanelProps) {
  return (
    <EazoPaymentUnlockPanel
      title="Paid access"
      description="Sign in and pay securely with Eazo."
      ctaLabel="Continue to payment"
      activeLabel="Access active"
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
  productKey = "premium",
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
`);
}

function subscriptionManagementPanelTemplate() {
  return normalizeNewline(`
"use client";

import * as React from "react";
import {
  EazoSubscriptionManagementPanel,
  type EazoSubscriptionsState,
} from "@eazo/sdk/payments/react";

export type SubscriptionManagementPanelProps = {
  children?: (subscriptions: EazoSubscriptionsState) => React.ReactNode;
};

export function SubscriptionManagementPanel({ children }: SubscriptionManagementPanelProps) {
  return (
    <EazoSubscriptionManagementPanel
      title="Subscriptions"
      emptyLabel="No subscriptions yet"
      cancelLabel="Cancel"
      resumeLabel="Resume"
    >
      {children}
    </EazoSubscriptionManagementPanel>
  );
}
`);
}

function paymentContractTestTemplate() {
  return normalizeNewline(`
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEazoCheckoutRequest,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
} from "@eazo/sdk/payments/server";
import {
  EAZO_PAYMENT_CURRENCY,
  EAZO_PAYMENT_MODE,
  defineEazoPaymentProducts,
  getEazoPaymentPriceLimits,
} from "@eazo/sdk/payments";
import {
  createEazoCancelSubscriptionRoute,
  createEazoCheckoutRoute,
  createEazoEntitlementRoute,
  createEazoPaymentStatusRoute,
  createEazoResumeSubscriptionRoute,
  createEazoSubscriptionsRoute,
} from "@eazo/sdk/payments/next";
import {
  assertCreateEazoCheckoutResultContract,
  assertEazoCheckoutRequestContract,
  assertEazoCheckoutResponseContract,
  assertEazoEntitlementContract,
  assertEazoPaymentStatusContract,
  assertEazoSubscriptionContract,
  assertEazoSubscriptionsResponseContract,
  mockEazoCheckoutResponse,
  mockEazoEntitlement,
  mockEazoPaymentStatus,
  mockEazoSubscription,
  mockEazoSubscriptionsResponse,
} from "@eazo/sdk/payments/testing";
import { getPaymentProduct, PAYMENT_PRODUCTS } from "./catalog";

const TEST_PRODUCT = PAYMENT_PRODUCTS.premium;
const TEST_PRODUCT_MODE = TEST_PRODUCT.mode || "one_time";
const TEST_ENTITLEMENT_KEY = TEST_PRODUCT.entitlementKey || TEST_PRODUCT.key;

const originalEnv = { ...process.env };

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("Eazo Payments integration contract", () => {
  beforeEach(() => {
    process.env.EAZO_API_BASE = "https://dev1.eazo.ai";
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY = "eazo_private_test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("builds the platform checkout DTO from the product catalog", () => {
    const product = TEST_PRODUCT;
    const request = buildEazoCheckoutRequest({
      productKey: product.key,
      productName: product.name,
      unitAmount: product.unitAmount,
      currency: product.currency,
      mode: product.mode,
      entitlementKey: product.entitlementKey,
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once",
    });

    expect(request).toMatchObject({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: product.key,
      entitlement_key: TEST_ENTITLEMENT_KEY,
      mode: TEST_PRODUCT_MODE,
      unit_amount: product.unitAmount,
      product_name: product.name,
      metadata: {
        product_key: product.key,
        entitlement_key: TEST_ENTITLEMENT_KEY,
        mode: TEST_PRODUCT_MODE,
        app_user_id: "app_user_test",
      },
    });
    assertEazoCheckoutRequestContract(request);
  });

  it("uses SDK payment constants and derives entitlement keys", () => {
    expect([EAZO_PAYMENT_MODE.ONE_TIME, EAZO_PAYMENT_MODE.SUBSCRIPTION]).toContain(TEST_PRODUCT.mode);
    expect(TEST_PRODUCT.currency).toBe(EAZO_PAYMENT_CURRENCY.USD);
    expect(TEST_PRODUCT.entitlementKey).toBe(TEST_PRODUCT.key);
  });

  it("keeps the catalog price inside the SDK legal range", () => {
    const limits = getEazoPaymentPriceLimits(TEST_PRODUCT.currency);
    expect(TEST_PRODUCT.unitAmount).toBeGreaterThanOrEqual(limits.minimumUnitAmount);
    expect(TEST_PRODUCT.unitAmount).toBeLessThanOrEqual(limits.maximumUnitAmount);
    expect(TEST_PRODUCT.unitAmount % limits.unitAmountMultiple).toBe(0);

    expect(() =>
      defineEazoPaymentProducts({
        below_minimum: {
          key: "below_minimum",
          name: "Below minimum",
          unitAmount: limits.minimumUnitAmount - 1,
          currency: TEST_PRODUCT.currency,
          mode: TEST_PRODUCT.mode,
        },
      } as const),
    ).toThrow("must be at least");

    expect(() =>
      defineEazoPaymentProducts({
        above_maximum: {
          key: "above_maximum",
          name: "Above maximum",
          unitAmount: limits.maximumUnitAmount + 1,
          currency: TEST_PRODUCT.currency,
          mode: TEST_PRODUCT.mode,
        },
      } as const),
    ).toThrow("must not exceed");
  });

  it("rejects invalid product keys and modes", () => {
    expect(() =>
      defineEazoPaymentProducts({
        Premium: {
          key: "Premium",
          name: "Premium unlock",
          unitAmount: 499,
          currency: EAZO_PAYMENT_CURRENCY.USD,
          mode: EAZO_PAYMENT_MODE.ONE_TIME,
        },
      } as const),
    ).toThrow("Invalid Eazo payment product key");

    expect(() =>
      defineEazoPaymentProducts({
        premium: {
          key: "premium",
          name: "Premium unlock",
          unitAmount: 499,
          currency: EAZO_PAYMENT_CURRENCY.USD,
          mode: "monthly" as never,
        },
      } as const),
    ).toThrow("Invalid Eazo payment mode");
  });

  it("creates checkout through Eazo platform and normalizes the result", async () => {
    const platformResponse = mockEazoCheckoutResponse();
    assertEazoCheckoutResponseContract(platformResponse);
    mockPlatformResponse(200, platformResponse);

    const result = await createEazoCheckoutSession({
      productKey: TEST_PRODUCT.key,
      productName: TEST_PRODUCT.name,
      unitAmount: TEST_PRODUCT.unitAmount,
      currency: TEST_PRODUCT.currency,
      mode: TEST_PRODUCT.mode,
      entitlementKey: TEST_PRODUCT.entitlementKey,
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once",
    });

    assertCreateEazoCheckoutResultContract(result);
    expect(result).toEqual({
      checkoutSessionId: "cs_test_eazo",
      checkoutUrl: expect.stringContaining("checkout.stripe.com"),
      paymentId: "cap_test_eazo",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/creator/api/open/payments/checkout-sessions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer eazo_private_test",
        },
      }),
    );
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    assertEazoCheckoutRequestContract(body);
    expect(body).not.toHaveProperty("interval");
    expect(body).toEqual({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: TEST_PRODUCT.key,
      entitlement_key: TEST_ENTITLEMENT_KEY,
      mode: TEST_PRODUCT_MODE,
      unit_amount: TEST_PRODUCT.unitAmount,
      currency: TEST_PRODUCT.currency,
      product_name: TEST_PRODUCT.name,
      success_url: "https://app.example.com/payment/success",
      cancel_url: "https://app.example.com/payment/cancel",
      quantity: 1,
      metadata: {
        product_key: TEST_PRODUCT.key,
        entitlement_key: TEST_ENTITLEMENT_KEY,
        mode: TEST_PRODUCT_MODE,
        app_user_id: "app_user_test",
      },
      idempotency_key: "checkout-once",
    });
  });

  it("preserves platform checkout failure status and body", async () => {
    mockPlatformResponse(422, { detail: [{ msg: "Field required" }] });

    await expect(
      createEazoCheckoutSession({
        productKey: TEST_PRODUCT.key,
        productName: TEST_PRODUCT.name,
        unitAmount: TEST_PRODUCT.unitAmount,
        currency: TEST_PRODUCT.currency,
        mode: TEST_PRODUCT.mode,
        entitlementKey: TEST_PRODUCT.entitlementKey,
        appUserId: "app_user_test",
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Field required",
    });
  });

  it.each(["pending", "succeeded", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s payment status from the Eazo ledger",
    async (status) => {
      const platformResponse = mockEazoPaymentStatus(status);
      assertEazoPaymentStatusContract(platformResponse);
      mockPlatformResponse(200, platformResponse);
      const result = await getEazoPaymentStatus("cap_test_eazo");
      assertEazoPaymentStatusContract(result);
      expect(result.status).toBe(status);
      expect(result.paid).toBe(status === "succeeded");
      expect(fetch).toHaveBeenCalledWith(
        "https://dev1.eazo.ai/creator/api/open/payments/cap_test_eazo/status?app_id=app_test",
        {
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store",
        },
      );
    },
  );

  it.each(["inactive", "pending", "active", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s entitlement status from the Eazo ledger",
    async (status) => {
      const platformResponse = mockEazoEntitlement(status, { product_key: TEST_PRODUCT.key });
      assertEazoEntitlementContract(platformResponse);
      mockPlatformResponse(200, platformResponse);
      const result = await getEazoEntitlementStatus(TEST_PRODUCT.key, {
        appUserId: "app_user_test",
      });
      assertEazoEntitlementContract(result);
      expect(result.status).toBe(status);
      expect(result.active).toBe(status === "active");
      expect(fetch).toHaveBeenCalledWith(
        \`https://dev1.eazo.ai/creator/api/open/payments/entitlements?app_id=app_test&product_key=\${TEST_PRODUCT.key}&app_user_id=app_user_test\`,
        {
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store",
        },
      );
    },
  );

  it("handles the local checkout route request and response contract", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getProduct: getPaymentProduct,
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });

    const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ productKey: TEST_PRODUCT.key }),
    }));

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    assertCreateEazoCheckoutResultContract(responseBody);
    expect(responseBody).toEqual({
      checkoutSessionId: "cs_test_eazo",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_eazo",
      paymentId: "cap_test_eazo",
    });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    assertEazoCheckoutRequestContract(body);
    expect(body).not.toHaveProperty("interval");
    expect(body.product_key).toBe(TEST_PRODUCT.key);
    expect(body.app_user_id).toBe("app_user_test");
  });

  it("handles the local payment status route request and response contract", async () => {
    mockPlatformResponse(200, mockEazoPaymentStatus("succeeded"));
    const GET = createEazoPaymentStatusRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });

    const response = await GET(new Request("https://app.example.com/api/payments/status?paymentId=cap_test_eazo"));

    expect(response.status).toBe(200);
    const body = await response.json();
    assertEazoPaymentStatusContract(body);
    expect(body).toEqual(mockEazoPaymentStatus("succeeded"));
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/creator/api/open/payments/cap_test_eazo/status?app_id=app_test&app_user_id=app_user_test",
      {
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      },
    );
  });

  it("accepts Stripe return payment_id on the local status route", async () => {
    mockPlatformResponse(200, mockEazoPaymentStatus("succeeded"));
    const GET = createEazoPaymentStatusRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });

    const response = await GET(new Request("https://app.example.com/api/payments/status?payment_id=cap_test_eazo"));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/creator/api/open/payments/cap_test_eazo/status?app_id=app_test&app_user_id=app_user_test",
      {
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      },
    );
  });

  it("handles the local entitlement route request and response contract", async () => {
    mockPlatformResponse(200, mockEazoEntitlement("active", { product_key: TEST_PRODUCT.key }));
    const GET = createEazoEntitlementRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });

    const response = await GET(new Request(\`https://app.example.com/api/payments/entitlements?productKey=\${TEST_PRODUCT.key}\`));

    expect(response.status).toBe(200);
    const body = await response.json();
    assertEazoEntitlementContract(body);
    expect(body).toEqual(mockEazoEntitlement("active", { product_key: TEST_PRODUCT.key }));
    expect(fetch).toHaveBeenCalledWith(
      \`https://dev1.eazo.ai/creator/api/open/payments/entitlements?app_id=app_test&product_key=\${TEST_PRODUCT.key}&app_user_id=app_user_test\`,
      {
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      },
    );
  });

  it.each(["productKey", "product_key", "key"] as const)(
    "accepts %s on the local entitlement route",
    async (paramName) => {
      mockPlatformResponse(200, mockEazoEntitlement("active", { product_key: TEST_PRODUCT.key }));
      const GET = createEazoEntitlementRoute({
        getUser: () => ({
          ok: true,
          user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
        }),
      });

      const response = await GET(new Request(\`https://app.example.com/api/payments/entitlements?\${paramName}=\${TEST_PRODUCT.key}\`));

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledWith(
        \`https://dev1.eazo.ai/creator/api/open/payments/entitlements?app_id=app_test&product_key=\${TEST_PRODUCT.key}&app_user_id=app_user_test\`,
        {
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store",
        },
      );
    },
  );

  it("handles subscription list, cancel, and resume routes through SDK helpers", async () => {
    const getUser = () => ({
      ok: true as const,
      user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
    });

    mockPlatformResponse(200, mockEazoSubscriptionsResponse());
    const subscriptionsGET = createEazoSubscriptionsRoute({ getUser });
    const listResponse = await subscriptionsGET(new Request("https://app.example.com/api/payments/subscriptions"));
    expect(listResponse.status).toBe(200);
    assertEazoSubscriptionsResponseContract(await listResponse.json());
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/creator/api/open/payments/subscriptions?app_id=app_test&app_user_id=app_user_test&limit=50&offset=0",
      {
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      },
    );

    mockPlatformResponse(200, {
      subscription: mockEazoSubscription({ id: "cas_test", cancel_at_period_end: true }),
    });
    const cancelPOST = createEazoCancelSubscriptionRoute({ getUser });
    const cancelResponse = await cancelPOST(
      new Request("https://app.example.com/api/payments/subscriptions/cas_test/cancel"),
      { params: Promise.resolve({ subscriptionId: "cas_test" }) },
    );
    expect(cancelResponse.status).toBe(200);
    assertEazoSubscriptionContract((await cancelResponse.json()).subscription);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/creator/api/open/payments/subscriptions/cas_test/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" }),
      }),
    );

    mockPlatformResponse(200, {
      subscription: mockEazoSubscription({ id: "cas_test", cancel_at_period_end: false }),
    });
    const resumePOST = createEazoResumeSubscriptionRoute({ getUser });
    const resumeResponse = await resumePOST(
      new Request("https://app.example.com/api/payments/subscriptions/cas_test/resume"),
      { params: Promise.resolve({ subscriptionId: "cas_test" }) },
    );
    expect(resumeResponse.status).toBe(200);
    assertEazoSubscriptionContract((await resumeResponse.json()).subscription);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/creator/api/open/payments/subscriptions/cas_test/resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" }),
      }),
    );
  });

  it("rejects malformed local payment route requests", async () => {
    const checkoutPOST = createEazoCheckoutRoute({ getProduct: getPaymentProduct });
    const statusGET = createEazoPaymentStatusRoute();
    const entitlementGET = createEazoEntitlementRoute();

    await expect(
      checkoutPOST(new Request("https://app.example.com/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ productKey: "missing" }),
      })).then((response) => response.json().then((body) => ({ status: response.status, body }))),
    ).resolves.toEqual({ status: 400, body: { error: "Unknown product" } });

    await expect(
      statusGET(new Request("https://app.example.com/api/payments/status"))
        .then((response) => response.json().then((body) => ({ status: response.status, body }))),
    ).resolves.toEqual({
      status: 400,
      body: { error: "Missing paymentId", accepted: ["paymentId", "payment_id"] },
    });

    await expect(
      entitlementGET(new Request("https://app.example.com/api/payments/entitlements"))
        .then((response) => response.json().then((body) => ({ status: response.status, body }))),
    ).resolves.toEqual({
      status: 400,
      body: { error: "Missing productKey", accepted: ["productKey", "product_key", "key"] },
    });
  });

  it("fails clearly when server env is missing", () => {
    delete process.env.EAZO_APP_ID;
    expect(() =>
      buildEazoCheckoutRequest({
        productKey: "premium",
        productName: TEST_PRODUCT.name,
        unitAmount: TEST_PRODUCT.unitAmount,
        currency: TEST_PRODUCT.currency,
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).toThrow("Missing EAZO_APP_ID");
  });
});
`);
}

function paymentUiContractTestTemplate() {
  return normalizeNewline(`
import { render, screen } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { assertNoLegacyPaymentFlowSource } from "@eazo/sdk/payments/testing";
import { PaymentUnlockPanel, PremiumEntitlementGate } from "../../components/eazo-payments/PaymentUnlockPanel";

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
}));

vi.mock("@eazo/sdk/payments/react", () => ({
  EazoPaymentUnlockPanel: ({
    title = "Paid access",
    ctaLabel = "Continue to payment",
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
        metadata: {},
      },
      status: "inactive",
      active: false,
      checking: false,
      starting: false,
      pending: false,
      error: null,
      refresh: vi.fn(),
      checkout: mocks.checkout,
    }),
}));

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (/\\.test\\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

describe("Eazo payment UI contract", () => {
  it("uses the SDK lifecycle panel for checkout UI", () => {
    render(<PaymentUnlockPanel />);

    expect(screen.getByText("Paid access")).toBeTruthy();
    screen.getByRole("button", { name: "Continue to payment" }).click();
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
`);
}

function itemsTemplate() {
  return normalizeNewline(`
import {
  EAZO_PAYMENT_CURRENCY,
  type EazoCheckoutItem,
  type EazoCheckoutLine,
} from "@eazo/sdk/payments";
import type { EazoItemsFulfill, EazoItemsResolution } from "@eazo/sdk/payments/next";

export const PAYMENT_CURRENCY = EAZO_PAYMENT_CURRENCY.USD;

// What can be paid for, keyed by the id the browser sends in lines. Replace
// with the app's own server-side data. unitAmount is integer minor units.
// entitlementKey: Eazo grants it when paid (quantity 1); read it with
// useEazoEntitlement(key). Lines without it are granted by fulfillPayment.
export const PAYMENT_ITEMS: Record<string, { name: string; unitAmount: number; entitlementKey?: string }> = {
  item_a: { name: "Item A", unitAmount: 499, entitlementKey: "item_a" },
  item_b: { name: "Item B", unitAmount: 199 },
};

// Prices the browser's lines on the server. Return null to reject the request.
// Never trust prices or amounts from the browser; a discount, if any, is
// computed here and returned as discountAmount / discountLabel.
export async function resolveItems({ lines }: { lines: EazoCheckoutLine[]; data?: Record<string, string> }): Promise<EazoItemsResolution | null> {
  if (new Set(lines.map((line) => line.id)).size !== lines.length) return null;
  const items: EazoCheckoutItem[] = [];
  for (const line of lines) {
    const item = PAYMENT_ITEMS[line.id];
    if (!item) return null;
    if (item.entitlementKey && line.quantity !== 1) return null;
    items.push({
      name: item.name,
      unitAmount: item.unitAmount,
      quantity: line.quantity,
      metadata: { item_id: line.id },
      ...(item.entitlementKey ? { entitlementKey: item.entitlementKey } : {}),
    });
  }
  return { currency: PAYMENT_CURRENCY, items };
}

// Grants the paid lines that have no entitlement_key to user.id. Called only for
// paid payments with line items, possibly more than once per payment. Record the payment
// in a table whose primary key is payment_id, in the same transaction:
//
//   await db.transaction(async (tx) => {
//     const inserted = await tx.insert(paymentFulfillments)
//       .values({ paymentId: payment.payment_id, userId: user.id })
//       .onConflictDoNothing({ target: paymentFulfillments.paymentId })
//       .returning();
//     if (inserted.length === 0) return; // already granted
//     // grant each remaining line to user.id
//   });
export const fulfillPayment: EazoItemsFulfill = async (payment, { user }) => {
  const lines = payment.line_items.filter((line) => !line.entitlement_key);
  if (lines.length === 0) return; // Entitlement lines are granted by Eazo.
  void user;
  throw new Error("Implement fulfillPayment in lib/eazo-payments/items.ts");
};
`);
}

function itemsCheckoutRouteTemplate() {
  return normalizeNewline(`
import { createEazoCheckoutRoute } from "@eazo/sdk/payments/next";
import { resolveItems } from "@/lib/eazo-payments/items";

export const POST = createEazoCheckoutRoute({ resolveItems });
`);
}

function itemsStatusRouteTemplate() {
  return normalizeNewline(`
import { createEazoPaymentStatusRoute } from "@eazo/sdk/payments/next";
import { fulfillPayment } from "@/lib/eazo-payments/items";

export const GET = createEazoPaymentStatusRoute({ fulfill: fulfillPayment });
`);
}

function paymentSyncRouteTemplate() {
  return normalizeNewline(`
import { createEazoPaymentSyncRoute } from "@eazo/sdk/payments/next";
import { fulfillPayment } from "@/lib/eazo-payments/items";

export const POST = createEazoPaymentSyncRoute({ fulfill: fulfillPayment });
`);
}

function itemsCheckoutButtonTemplate() {
  return normalizeNewline(`
"use client";

import * as React from "react";
import { startEazoItemsCheckout, type EazoCheckoutLine } from "@eazo/sdk/payments";

export type ItemsCheckoutButtonProps = {
  lines: EazoCheckoutLine[];
  children?: React.ReactNode;
  className?: string;
};

// Lines can live in React state or localStorage; payment state never does.
// The button only starts checkout; granting happens on the server.
export function ItemsCheckoutButton({ lines, children = "Checkout", className }: ItemsCheckoutButtonProps) {
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function checkout() {
    setStarting(true);
    setError("");
    try {
      await startEazoItemsCheckout(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setStarting(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} disabled={starting || lines.length === 0} onClick={checkout}>
        {children}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
`);
}

function paymentSyncTemplate() {
  return normalizeNewline(`
"use client";

import { EazoPaymentSync } from "@eazo/sdk/payments/next/client";

// Mount once in the root layout so paid payments are granted even when the buyer
// closed the page before returning from checkout.
export function PaymentSync() {
  return <EazoPaymentSync />;
}
`);
}

function itemsContractTestTemplate() {
  return normalizeNewline(`
import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEazoItemsCheckoutRequest } from "@eazo/sdk/payments/server";
import { createEazoPaymentStatusRoute } from "@eazo/sdk/payments/next";
import {
  assertEazoItemsCheckoutRequestContract,
  assertNoLegacyPaymentFlowSource,
  mockEazoItemsPayment,
  mockEazoItemsPaymentFromResolution,
} from "@eazo/sdk/payments/testing";
import { fulfillPayment, resolveItems, PAYMENT_ITEMS } from "./items";

const TEST_USER = { id: "app_user_test", email: null, name: null, avatarUrl: null };
const originalEnv = { ...process.env };

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (/\\.test\\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

describe("Eazo items checkout contract", () => {
  beforeEach(() => {
    process.env.EAZO_API_BASE = "https://dev1.eazo.ai";
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY = "eazo_private_test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function allItemLines() {
    return Object.entries(PAYMENT_ITEMS).map(([id, item]) => ({ id, quantity: item.entitlementKey ? 1 : 2 }));
  }

  it("prices every item on the server into a valid platform request", async () => {
    const resolved = await resolveItems({ lines: allItemLines(), data: {} });
    expect(resolved).not.toBeNull();

    const request = buildEazoItemsCheckoutRequest({
      appUserId: TEST_USER.id,
      currency: resolved!.currency,
      items: resolved!.items,
      discountAmount: resolved!.discountAmount,
      discountLabel: resolved!.discountLabel,
      metadata: resolved!.metadata,
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
    });
    assertEazoItemsCheckoutRequestContract(request);
  });

  it("rejects unknown items", async () => {
    await expect(resolveItems({ lines: [{ id: "unknown_item", quantity: 1 }], data: {} })).resolves.toBeNull();
  });

  it("fulfills a paid payment of every item and tolerates repeated delivery", async () => {
    const resolved = await resolveItems({ lines: allItemLines(), data: {} });
    const payment = mockEazoItemsPaymentFromResolution(resolved!);
    await fulfillPayment(payment, { user: TEST_USER });
    await fulfillPayment(payment, { user: TEST_USER });
    // Add assertions on the app's own storage: each line was granted once.
  });

  it("only fulfills payments that are paid", async () => {
    const fulfill = vi.fn();
    const GET = createEazoPaymentStatusRoute({
      fulfill,
      getUser: () => ({ ok: true, user: TEST_USER }),
    });

    mockPlatformResponse(200, mockEazoItemsPayment("pending"));
    const pending = await GET(new Request("https://app.example.com/api/payments/status?paymentId=cap_test_items"));
    expect((await pending.json()).fulfilled).toBe(false);
    expect(fulfill).not.toHaveBeenCalled();

    mockPlatformResponse(200, mockEazoItemsPayment("succeeded"));
    const paid = await GET(new Request("https://app.example.com/api/payments/status?paymentId=cap_test_items"));
    expect((await paid.json()).fulfilled).toBe(true);
    expect(fulfill).toHaveBeenCalledTimes(1);
  });

  it("does not contain legacy hand-written checkout flow code", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    for (const filePath of listSourceFiles(srcDir)) {
      const source = fs.readFileSync(filePath, "utf8");
      assertNoLegacyPaymentFlowSource(source, path.relative(process.cwd(), filePath));
    }
  });
});
`);
}

function itemsTemplateFiles(): TemplateFile[] {
  return [
    { filePath: "src/lib/eazo-payments/items.ts", content: itemsTemplate() },
    { filePath: "src/lib/eazo-payments/items-contract.test.ts", content: itemsContractTestTemplate() },
    { filePath: "src/components/eazo-payments/ItemsCheckoutButton.tsx", content: itemsCheckoutButtonTemplate() },
    { filePath: "src/components/eazo-payments/PaymentSync.tsx", content: paymentSyncTemplate() },
    {
      filePath: "src/app/api/payments/checkout/route.ts",
      content: itemsCheckoutRouteTemplate(),
      existingHint: "add `resolveItems` (from @/lib/eazo-payments/items) to its createEazoCheckoutRoute options",
    },
    {
      filePath: "src/app/api/payments/status/route.ts",
      content: itemsStatusRouteTemplate(),
      existingHint: "add `fulfill: fulfillPayment` (from @/lib/eazo-payments/items) to its createEazoPaymentStatusRoute options",
    },
    { filePath: "src/app/api/payments/sync/route.ts", content: paymentSyncRouteTemplate() },
    {
      filePath: "src/app/api/payments/entitlements/route.ts",
      content: entitlementRouteTemplate(),
      existingHint: "keep it",
    },
    { filePath: "src/app/payment/success/page.tsx", content: successPageTemplate(), existingHint: "keep it" },
    { filePath: "src/app/payment/cancel/page.tsx", content: cancelPageTemplate(), existingHint: "keep it" },
  ];
}

function templateFiles(recipe: string): TemplateFile[] {
  if (recipe === "one-time-items") return itemsTemplateFiles();
  const files: TemplateFile[] = [
    {
      filePath: "src/lib/eazo-payments/catalog.ts",
      content: paymentCatalogTemplate(recipe),
    },
    {
      filePath: "src/lib/eazo-payments/payment-contract.test.ts",
      content: paymentContractTestTemplate(),
    },
    {
      filePath: "src/lib/eazo-payments/payment-ui-contract.test.tsx",
      content: paymentUiContractTestTemplate(),
    },
    {
      filePath: "src/components/eazo-payments/PaymentUnlockPanel.tsx",
      content: paymentUnlockPanelTemplate(),
    },
    {
      filePath: "src/app/api/payments/checkout/route.ts",
      content: checkoutRouteTemplate(),
    },
    {
      filePath: "src/app/api/payments/status/route.ts",
      content: statusRouteTemplate(),
    },
    {
      filePath: "src/app/api/payments/entitlements/route.ts",
      content: entitlementRouteTemplate(),
    },
    {
      filePath: "src/app/payment/success/page.tsx",
      content: successPageTemplate(),
    },
    {
      filePath: "src/app/payment/cancel/page.tsx",
      content: cancelPageTemplate(),
    },
  ];

  if (recipe === "monthly-subscription") {
    files.splice(4, 0, {
      filePath: "src/components/eazo-payments/SubscriptionManagementPanel.tsx",
      content: subscriptionManagementPanelTemplate(),
    });
    files.push(
      {
        filePath: "src/app/api/payments/subscriptions/route.ts",
        content: subscriptionsRouteTemplate(),
      },
      {
        filePath: "src/app/api/payments/subscriptions/[subscriptionId]/cancel/route.ts",
        content: cancelSubscriptionRouteTemplate(),
      },
      {
        filePath: "src/app/api/payments/subscriptions/[subscriptionId]/resume/route.ts",
        content: resumeSubscriptionRouteTemplate(),
      },
    );
  }

  return files;
}

const SRC_SCAN_SNIPPET = `const srcDir = path.resolve(process.cwd(), "src");
    for (const filePath of listSourceFiles(srcDir)) {`;
const ROOT_SCAN_SNIPPET = `const sourceFiles = ["app", "lib", "components"].flatMap((dir) =>
      listSourceFiles(path.resolve(process.cwd(), dir)),
    );
    for (const filePath of sourceFiles) {`;

/**
 * Next-style apps keep routes in either `src/app` or a root `app/`; the
 * framework ignores the other one, so scaffolded files must follow the app.
 */
export function detectPaymentsSourceRoot(cwd: string): "src" | "" {
  if (fs.existsSync(path.join(cwd, "src", "app"))) return "src";
  if (fs.existsSync(path.join(cwd, "app"))) return "";
  return "src";
}

function placeTemplateFiles(files: TemplateFile[], sourceRoot: "src" | ""): TemplateFile[] {
  if (sourceRoot === "src") return files;
  return files.map((file) => ({
    ...file,
    filePath: file.filePath.replace(/^src\//, ""),
    content: file.content.replace(SRC_SCAN_SNIPPET, ROOT_SCAN_SNIPPET),
  }));
}

export function scaffoldPayments(options: ScaffoldOptions = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const recipe = options.recipe || DEFAULT_RECIPE;

  if (!SUPPORTED_RECIPES.has(recipe)) {
    throw new Error(`Unsupported payments recipe: ${recipe}`);
  }

  const allFiles = placeTemplateFiles(templateFiles(recipe), detectPaymentsSourceRoot(cwd));
  const exists = (file: TemplateFile) => fs.existsSync(path.join(cwd, file.filePath));
  // Shared routes may already hold another recipe's options, so even --force keeps them.
  const kept = allFiles.filter((file) => file.existingHint && exists(file));
  const files = allFiles.filter((file) => !kept.includes(file));
  const existing = files
    .map((file) => path.join(cwd, file.filePath))
    .filter((filePath) => fs.existsSync(filePath));

  if (existing.length > 0 && !options.force) {
    throw new Error(
      `Refusing to overwrite existing payment files:\n${existing.map((file) => `- ${file}`).join("\n")}\nRun again with --force to overwrite.`,
    );
  }

  if (!options.dryRun) {
    for (const file of files) {
      const absolutePath = path.join(cwd, file.filePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content, "utf8");
    }
  }

  return {
    recipe,
    cwd,
    files: files.map((file) => file.filePath),
    kept: kept.map((file) => ({ filePath: file.filePath, hint: file.existingHint as string })),
  };
}

function printUsage() {
  console.log(`Usage:
  eazo-sdk payments doctor [--minimum-version <version>] [--cwd <path>]
  eazo-sdk payments init --recipe one-time-unlock [--minimum-version <version>] [--force] [--cwd <path>]
  eazo-sdk payments init --recipe monthly-subscription [--minimum-version <version>] [--force] [--cwd <path>]
  eazo-sdk payments init --recipe one-time-items [--minimum-version <version>] [--force] [--cwd <path>]

Commands:
  payments doctor Validate the declared, installed, and exported Payment SDK contract.
  payments init   Scaffold Eazo marketplace payment files for a Next.js app.
`);
}

function readOption(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

export function main(argv = process.argv.slice(2)) {
  const [domain, command] = argv;
  if (domain !== "payments" || !["doctor", "init"].includes(command || "")) {
    printUsage();
    return domain ? 1 : 0;
  }

  const cwd = readOption(argv, "--cwd") || process.cwd();
  const recipe = readOption(argv, "--recipe") || DEFAULT_RECIPE;
  const requestedMinimum = readOption(argv, "--minimum-version") || EAZO_PAYMENTS_MIN_SDK_VERSION;
  const recipeMinimum = command === "init" ? RECIPE_MIN_SDK_VERSION[recipe] : undefined;
  const doctor = inspectPaymentsInstallation({
    cwd,
    minimumVersion:
      recipeMinimum && !isVersionAtLeast(requestedMinimum, recipeMinimum) ? recipeMinimum : requestedMinimum,
  });
  console.log(formatPaymentsDoctorReport(doctor));
  if (!doctor.ok) return 1;
  if (command === "doctor") return 0;

  const result = scaffoldPayments({
    recipe,
    cwd,
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  });

  console.log(`Eazo Payments scaffolded (${result.recipe}):`);
  for (const file of result.files) {
    console.log(`- ${file}`);
  }
  if (result.kept.length > 0) {
    console.log("Kept existing files; edit them instead:");
    for (const file of result.kept) {
      console.log(`- ${file.filePath}: ${file.hint}`);
    }
  }
  if (result.recipe === "one-time-items") {
    console.log("Next: implement resolveItems and fulfillPayment in lib/eazo-payments/items.ts");
    console.log("(items-contract.test.ts fails until fulfillPayment is implemented),");
    console.log("and mount <PaymentSync /> once in the root layout.");
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
