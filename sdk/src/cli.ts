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
};

const DEFAULT_RECIPE = "one-time-unlock";
const SUPPORTED_RECIPES = new Set(["one-time-unlock", "monthly-subscription"]);

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

function templateFiles(recipe: string): TemplateFile[] {
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

export function scaffoldPayments(options: ScaffoldOptions = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const recipe = options.recipe || DEFAULT_RECIPE;

  if (!SUPPORTED_RECIPES.has(recipe)) {
    throw new Error(`Unsupported payments recipe: ${recipe}`);
  }

  const files = templateFiles(recipe);
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
  };
}

function printUsage() {
  console.log(`Usage:
  eazo-sdk payments init --recipe one-time-unlock [--force] [--cwd <path>]
  eazo-sdk payments init --recipe monthly-subscription [--force] [--cwd <path>]

Commands:
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
  if (domain !== "payments" || command !== "init") {
    printUsage();
    return domain ? 1 : 0;
  }

  const result = scaffoldPayments({
    recipe: readOption(argv, "--recipe") || DEFAULT_RECIPE,
    cwd: readOption(argv, "--cwd") || process.cwd(),
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  });

  console.log(`Eazo Payments scaffolded (${result.recipe}):`);
  for (const file of result.files) {
    console.log(`- ${file}`);
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
