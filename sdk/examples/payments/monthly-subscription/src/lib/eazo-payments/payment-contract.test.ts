import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEazoCheckoutRequest,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus
} from "@eazo/sdk/payments/server";
import {
  EAZO_PAYMENT_CURRENCY,
  EAZO_PAYMENT_MODE,
  defineEazoPaymentProducts,
  getEazoPaymentPriceLimits
} from "@eazo/sdk/payments";
import {
  createEazoCancelSubscriptionRoute,
  createEazoCheckoutRoute,
  createEazoEntitlementRoute,
  createEazoPaymentStatusRoute,
  createEazoResumeSubscriptionRoute,
  createEazoSubscriptionsRoute
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
  mockEazoSubscriptionsResponse
} from "@eazo/sdk/payments/testing";
import { getPaymentProduct, PAYMENT_PRODUCTS } from "./catalog";

const TEST_PRODUCT = PAYMENT_PRODUCTS.premium;
const TEST_PRODUCT_MODE = TEST_PRODUCT.mode || EAZO_PAYMENT_MODE.ONE_TIME;
const TEST_ENTITLEMENT_KEY = TEST_PRODUCT.entitlementKey || TEST_PRODUCT.key;

const originalEnv = { ...process.env };

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    })
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
    const request = buildEazoCheckoutRequest({
      productKey: TEST_PRODUCT.key,
      productName: TEST_PRODUCT.name,
      unitAmount: TEST_PRODUCT.unitAmount,
      currency: TEST_PRODUCT.currency,
      mode: TEST_PRODUCT.mode,
      entitlementKey: TEST_PRODUCT.entitlementKey,
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once"
    });

    expect(request).toMatchObject({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: TEST_PRODUCT.key,
      entitlement_key: TEST_ENTITLEMENT_KEY,
      mode: TEST_PRODUCT_MODE,
      unit_amount: TEST_PRODUCT.unitAmount,
      product_name: TEST_PRODUCT.name,
      metadata: {
        product_key: TEST_PRODUCT.key,
        entitlement_key: TEST_ENTITLEMENT_KEY,
        mode: TEST_PRODUCT_MODE,
        app_user_id: "app_user_test"
      }
    });
    assertEazoCheckoutRequestContract(request);
  });

  it("uses SDK payment constants and derives entitlement keys", () => {
    expect(TEST_PRODUCT.mode).toBe(EAZO_PAYMENT_MODE.SUBSCRIPTION);
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
          mode: TEST_PRODUCT.mode
        }
      } as const)
    ).toThrow("must be at least");

    expect(() =>
      defineEazoPaymentProducts({
        above_maximum: {
          key: "above_maximum",
          name: "Above maximum",
          unitAmount: limits.maximumUnitAmount + 1,
          currency: TEST_PRODUCT.currency,
          mode: TEST_PRODUCT.mode
        }
      } as const)
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
          mode: EAZO_PAYMENT_MODE.ONE_TIME
        }
      } as const)
    ).toThrow("Invalid Eazo payment product key");

    expect(() =>
      defineEazoPaymentProducts({
        premium: {
          key: "premium",
          name: "Premium unlock",
          unitAmount: 499,
          currency: EAZO_PAYMENT_CURRENCY.USD,
          mode: "monthly" as never
        }
      } as const)
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
      idempotencyKey: "checkout-once"
    });

    assertCreateEazoCheckoutResultContract(result);
    expect(result).toEqual({
      checkoutSessionId: "cs_test_eazo",
      checkoutUrl: expect.stringContaining("checkout.stripe.com"),
      paymentId: "cap_test_eazo"
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/checkout-sessions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer eazo_private_test"
        }
      })
    );
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    assertEazoCheckoutRequestContract(body);
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
        app_user_id: "app_user_test"
      },
      idempotency_key: "checkout-once"
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
        cancelUrl: "https://app.example.com/payment/cancel"
      })
    ).rejects.toMatchObject({
      status: 422,
      message: "Field required"
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
        "https://dev1.eazo.ai/api/open/payments/cap_test_eazo/status?app_id=app_test",
        {
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store"
        }
      );
    }
  );

  it.each(["inactive", "pending", "active", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s entitlement status from the Eazo ledger",
    async (status) => {
      const platformResponse = mockEazoEntitlement(status, { product_key: TEST_PRODUCT.key });
      assertEazoEntitlementContract(platformResponse);
      mockPlatformResponse(200, platformResponse);
      const result = await getEazoEntitlementStatus(TEST_PRODUCT.key, {
        appUserId: "app_user_test"
      });
      assertEazoEntitlementContract(result);
      expect(result.status).toBe(status);
      expect(result.active).toBe(status === "active");
      expect(fetch).toHaveBeenCalledWith(
        `https://dev1.eazo.ai/api/open/payments/entitlements?app_id=app_test&product_key=${TEST_PRODUCT.key}&app_user_id=app_user_test`,
        {
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store"
        }
      );
    }
  );

  it("handles local checkout/status/entitlement route contracts", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getProduct: getPaymentProduct,
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null }
      })
    });

    const checkoutResponse = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ productKey: TEST_PRODUCT.key })
    }));

    expect(checkoutResponse.status).toBe(200);
    assertCreateEazoCheckoutResultContract(await checkoutResponse.json());
    const [, checkoutRequest] = vi.mocked(fetch).mock.calls[0];
    const checkoutBody = JSON.parse(String(checkoutRequest?.body));
    assertEazoCheckoutRequestContract(checkoutBody);
    expect(checkoutBody.success_url).toBe(`https://app.example.com/payment/success?product=${TEST_PRODUCT.key}`);
    expect(checkoutBody.cancel_url).toBe(`https://app.example.com/payment/cancel?product=${TEST_PRODUCT.key}`);

    mockPlatformResponse(200, mockEazoPaymentStatus("succeeded"));
    const statusGET = createEazoPaymentStatusRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null }
      })
    });
    const statusResponse = await statusGET(
      new Request("https://app.example.com/api/payments/status?paymentId=cap_test_eazo")
    );
    expect(statusResponse.status).toBe(200);
    assertEazoPaymentStatusContract(await statusResponse.json());

    mockPlatformResponse(200, mockEazoPaymentStatus("succeeded"));
    const stripeStyleStatusResponse = await statusGET(
      new Request("https://app.example.com/api/payments/status?payment_id=cap_test_eazo")
    );
    expect(stripeStyleStatusResponse.status).toBe(200);
    assertEazoPaymentStatusContract(await stripeStyleStatusResponse.json());

    mockPlatformResponse(200, mockEazoEntitlement("active", { product_key: TEST_PRODUCT.key }));
    const entitlementGET = createEazoEntitlementRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null }
      })
    });
    const entitlementResponse = await entitlementGET(
      new Request(`https://app.example.com/api/payments/entitlements?productKey=${TEST_PRODUCT.key}`)
    );
    expect(entitlementResponse.status).toBe(200);
    assertEazoEntitlementContract(await entitlementResponse.json());

    for (const paramName of ["product_key", "key"] as const) {
      mockPlatformResponse(200, mockEazoEntitlement("active", { product_key: TEST_PRODUCT.key }));
      const aliasResponse = await entitlementGET(
        new Request(`https://app.example.com/api/payments/entitlements?${paramName}=${TEST_PRODUCT.key}`)
      );
      expect(aliasResponse.status).toBe(200);
      assertEazoEntitlementContract(await aliasResponse.json());
    }
  });

  it("handles local subscription list/cancel/resume route contracts", async () => {
    const getUser = () => ({
      ok: true as const,
      user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null }
    });

    mockPlatformResponse(200, mockEazoSubscriptionsResponse());
    const subscriptionsGET = createEazoSubscriptionsRoute({ getUser });
    const listResponse = await subscriptionsGET(
      new Request("https://app.example.com/api/payments/subscriptions")
    );
    expect(listResponse.status).toBe(200);
    assertEazoSubscriptionsResponseContract(await listResponse.json());
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions?app_id=app_test&app_user_id=app_user_test&limit=50&offset=0",
      {
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store"
      }
    );

    mockPlatformResponse(200, {
      subscription: mockEazoSubscription({ id: "cas_test_eazo", cancel_at_period_end: true })
    });
    const cancelPOST = createEazoCancelSubscriptionRoute({ getUser });
    const cancelResponse = await cancelPOST(
      new Request("https://app.example.com/api/payments/subscriptions/cas_test_eazo/cancel"),
      { params: Promise.resolve({ subscriptionId: "cas_test_eazo" }) }
    );
    expect(cancelResponse.status).toBe(200);
    assertEazoSubscriptionContract((await cancelResponse.json()).subscription);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions/cas_test_eazo/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" })
      })
    );

    mockPlatformResponse(200, {
      subscription: mockEazoSubscription({ id: "cas_test_eazo", cancel_at_period_end: false })
    });
    const resumePOST = createEazoResumeSubscriptionRoute({ getUser });
    const resumeResponse = await resumePOST(
      new Request("https://app.example.com/api/payments/subscriptions/cas_test_eazo/resume"),
      { params: Promise.resolve({ subscriptionId: "cas_test_eazo" }) }
    );
    expect(resumeResponse.status).toBe(200);
    assertEazoSubscriptionContract((await resumeResponse.json()).subscription);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions/cas_test_eazo/resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" })
      })
    );
  });

  it("uses public proxy headers for Stripe return URLs in E2B previews", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getProduct: getPaymentProduct,
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null }
      })
    });

    const checkoutResponse = await POST(new Request("http://0.0.0.0:3000/api/payments/checkout", {
      method: "POST",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "3000-preview.e2b.app"
      },
      body: JSON.stringify({ productKey: TEST_PRODUCT.key })
    }));

    expect(checkoutResponse.status).toBe(200);
    const [, checkoutRequest] = vi.mocked(fetch).mock.calls[0];
    const checkoutBody = JSON.parse(String(checkoutRequest?.body));
    assertEazoCheckoutRequestContract(checkoutBody);
    expect(checkoutBody.success_url).toBe(`https://3000-preview.e2b.app/payment/success?product=${TEST_PRODUCT.key}`);
    expect(checkoutBody.cancel_url).toBe(`https://3000-preview.e2b.app/payment/cancel?product=${TEST_PRODUCT.key}`);
    expect(checkoutBody.success_url).not.toContain("0.0.0.0");
    expect(checkoutBody.cancel_url).not.toContain("0.0.0.0");
  });
});
