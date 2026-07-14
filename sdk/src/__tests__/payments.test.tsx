import { act, render, screen, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scaffoldPayments } from "../cli";
import {
  defineEazoPaymentProducts,
  EAZO_PAYMENT_CURRENCY,
  EAZO_PAYMENT_MODE,
  clearRememberedEazoPaymentId,
  normalizeEazoCheckoutResult,
  readEazoPaymentIdFromUrl,
  readRememberedEazoPaymentId,
  rememberEazoPaymentId,
  startEazoCheckout,
} from "../payments";
import {
  buildEazoCheckoutRequest,
  cancelEazoSubscription,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
  listEazoSubscriptions,
  resumeEazoSubscription,
} from "../payments.server";
import {
  createEazoCancelSubscriptionRoute,
  createEazoCheckoutRoute,
  createEazoEntitlementRoute,
  createEazoPaymentStatusRoute,
  createEazoResumeSubscriptionRoute,
  createEazoSubscriptionsRoute,
} from "../payments.next";
import { EazoPaymentSuccessPage } from "../payments.next.client";
import {
  EazoEntitlementGate,
  EazoPaymentLifecycle,
  EazoPaymentButton,
  EazoSubscriptionManagementPanel,
  EazoPaymentUnlockPanel,
  readCachedEazoEntitlement,
  refreshEazoEntitlement,
  rememberEazoEntitlement,
} from "../payments.react";
import {
  assertCreateEazoCheckoutResultContract,
  assertEazoCheckoutRequestContract,
  assertEazoCheckoutResponseContract,
  assertEazoEntitlementContract,
  assertEazoPaymentStatusContract,
  assertEazoSubscriptionContract,
  assertEazoSubscriptionsResponseContract,
  assertLocalCheckoutBodyContract,
  assertNoLegacyPaymentFlowSource,
  mockEazoCheckoutResponse,
  mockEazoEntitlement,
  mockEazoPaymentStatus,
  mockEazoSubscription,
  mockEazoSubscriptionsResponse,
} from "../payments.testing";
import { auth } from "../internal/capabilities/auth";
import { CHANNEL, VERSION } from "../internal/bridge/protocol";
import { store } from "../internal/store";
import { __dispatchHostMessage, __resetSDK } from "../testing";

const originalEnv = { ...process.env };

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function seedWebSession() {
  const session = { userId: "app_user_test", email: "test@example.com" };
  window.localStorage.setItem("eazo.session", JSON.stringify(session));
  return JSON.stringify(session);
}

function installMobileHost(session: unknown) {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = {
    postMessage: (payload: string) => {
      const message = JSON.parse(payload) as {
        t: string;
        id?: string;
        fn?: string;
      };
      if (message.t === "ready") {
        __dispatchHostMessage({
          ch: CHANNEL,
          v: VERSION,
          t: "hello",
          session: {
            authenticated: true,
            user: {
              id: "app_user_mobile",
              email: "mobile@example.com",
              name: "Mobile user",
              avatarUrl: null,
            },
            token: "mobile_token",
          },
          device: { platform: "mobile", locale: "en-US" },
          capabilities: ["auth.getSession"],
        });
      }
      if (message.t === "req" && message.fn === "auth.getSession") {
        __dispatchHostMessage({
          ch: CHANNEL,
          v: VERSION,
          t: "res",
          id: message.id,
          ok: true,
          data: { session },
        });
      }
    },
  };
}

function removeMobileHost() {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

describe("Eazo Payments SDK", () => {
  beforeEach(() => {
    __resetSDK();
    removeMobileHost();
    process.env.EAZO_API_BASE = "https://dev1.eazo.ai";
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY = "eazo_private_test";
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    __resetSDK();
    removeMobileHost();
    store.reset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("builds the exact checkout DTO and forbids drifted fields", () => {
    const request = buildEazoCheckoutRequest({
      productKey: "premium",
      productName: "Premium unlock",
      unitAmount: 499,
      currency: "usd",
      mode: "one_time",
      entitlementKey: "premium",
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once",
    });

    expect(request).toMatchObject({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: "premium",
      entitlement_key: "premium",
      mode: "one_time",
      unit_amount: 499,
      product_name: "Premium unlock",
      metadata: {
        product_key: "premium",
        entitlement_key: "premium",
        mode: "one_time",
        app_user_id: "app_user_test",
      },
    });
    assertEazoCheckoutRequestContract(request);
  });

  it("builds subscription checkout DTO without exposing interval", () => {
    const request = buildEazoCheckoutRequest({
      productKey: "premium",
      productName: "Premium monthly subscription",
      unitAmount: 499,
      currency: "usd",
      mode: EAZO_PAYMENT_MODE.SUBSCRIPTION,
      entitlementKey: "premium",
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-subscription",
    });

    assertEazoCheckoutRequestContract(request);
    expect(request.mode).toBe("subscription");
    expect(request.metadata.mode).toBe("subscription");
    expect(request).not.toHaveProperty("interval");
    expect(JSON.stringify(request)).not.toContain("interval");
  });

  it("defines products with SDK constants and derives entitlement keys", () => {
    const products = defineEazoPaymentProducts({
      premium: {
        key: "premium",
        name: "Premium unlock",
        unitAmount: 499,
        currency: EAZO_PAYMENT_CURRENCY.USD,
        mode: EAZO_PAYMENT_MODE.ONE_TIME,
      },
    } as const);

    expect(products.premium.mode).toBe(EAZO_PAYMENT_MODE.ONE_TIME);
    expect(products.premium.currency).toBe(EAZO_PAYMENT_CURRENCY.USD);
    expect(products.premium.entitlementKey).toBe("premium");
  });

  it("accepts non-USD currencies from the SDK enum", () => {
    const products = defineEazoPaymentProducts({
      premium_cny: {
        key: "premium_cny",
        name: "Premium unlock CNY",
        unitAmount: 1999,
        currency: EAZO_PAYMENT_CURRENCY.CNY,
        mode: EAZO_PAYMENT_MODE.ONE_TIME,
      },
    } as const);

    const request = buildEazoCheckoutRequest({
      productKey: products.premium_cny.key,
      productName: products.premium_cny.name,
      unitAmount: products.premium_cny.unitAmount,
      currency: products.premium_cny.currency,
      mode: products.premium_cny.mode,
      entitlementKey: products.premium_cny.entitlementKey,
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
    });

    assertEazoCheckoutRequestContract(request);
    expect(request.currency).toBe(EAZO_PAYMENT_CURRENCY.CNY);
    expect(request.unit_amount).toBe(1999);
  });

  it("rejects invalid product catalog values before checkout", () => {
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

  it("rejects invalid checkout request values at runtime", () => {
    expect(() =>
      buildEazoCheckoutRequest({
        productKey: "premium",
        productName: "Premium unlock",
        unitAmount: 499,
        currency: EAZO_PAYMENT_CURRENCY.USD,
        mode: "monthly" as never,
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).toThrow("Invalid Eazo payment mode");

    expect(() =>
      buildEazoCheckoutRequest({
        productKey: "Premium",
        productName: "Premium unlock",
        unitAmount: 499,
        currency: EAZO_PAYMENT_CURRENCY.USD,
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).toThrow("Invalid Eazo payment product key");
  });

  it("normalizes checkout creation and preserves platform failures", async () => {
    const platformResponse = mockEazoCheckoutResponse();
    assertEazoCheckoutResponseContract(platformResponse);
    mockPlatformResponse(200, platformResponse);
    const result = await createEazoCheckoutSession({
        productKey: "premium",
        productName: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
        mode: "one_time",
        entitlementKey: "premium",
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
      "https://dev1.eazo.ai/api/open/payments/checkout-sessions",
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
    expect(body).toEqual({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: "premium",
      entitlement_key: "premium",
      mode: "one_time",
      unit_amount: 499,
      currency: "usd",
      product_name: "Premium unlock",
      success_url: "https://app.example.com/payment/success",
      cancel_url: "https://app.example.com/payment/cancel",
      quantity: 1,
      metadata: {
        product_key: "premium",
        entitlement_key: "premium",
        mode: "one_time",
        app_user_id: "app_user_test",
      },
      idempotency_key: "checkout-once",
    });

    mockPlatformResponse(422, { detail: [{ msg: "Field required" }] });
    await expect(
      createEazoCheckoutSession({
        productKey: "premium",
        productName: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Field required",
    });
  });

  it.each(["pending", "succeeded", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s payment status",
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
          cache: "no-store",
        },
      );
    },
  );

  it.each(["inactive", "pending", "active", "canceling", "past_due", "canceled", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s entitlement status",
    async (status) => {
      const platformResponse = mockEazoEntitlement(status);
      assertEazoEntitlementContract(platformResponse);
      mockPlatformResponse(200, platformResponse);
      const result = await getEazoEntitlementStatus("premium", { appUserId: "app_user_test" });
      assertEazoEntitlementContract(result);
      expect(result.status).toBe(status);
      expect(result.active).toBe(status === "active");
      expect(fetch).toHaveBeenCalledWith(
        "https://dev1.eazo.ai/api/open/payments/entitlements?app_id=app_test&product_key=premium&app_user_id=app_user_test",
        {
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store",
        },
      );
    },
  );

  it("lists, cancels, and resumes subscriptions through the platform API", async () => {
    const subscriptionsResponse = mockEazoSubscriptionsResponse();
    assertEazoSubscriptionsResponseContract(subscriptionsResponse);
    mockPlatformResponse(200, subscriptionsResponse);

    const subscriptions = await listEazoSubscriptions({ appUserId: "app_user_test" });
    assertEazoSubscriptionsResponseContract(subscriptions);
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions?app_id=app_test&app_user_id=app_user_test&limit=50&offset=0",
      {
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      },
    );

    const subscription = mockEazoSubscription({ cancel_at_period_end: true });
    mockPlatformResponse(200, { subscription });
    const canceled = await cancelEazoSubscription("cas_test_eazo", { appUserId: "app_user_test" });
    assertEazoSubscriptionContract(canceled.subscription);
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions/cas_test_eazo/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" }),
      }),
    );

    mockPlatformResponse(200, { subscription: mockEazoSubscription({ cancel_at_period_end: false }) });
    const resumed = await resumeEazoSubscription("cas_test_eazo", { appUserId: "app_user_test" });
    assertEazoSubscriptionContract(resumed.subscription);
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions/cas_test_eazo/resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" }),
      }),
    );
  });

  it("starts checkout through the local route and remembers payment id", async () => {
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, {
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      paymentId: "cap_test_eazo",
    });
    const redirect = vi.fn();

    await startEazoCheckout("premium", redirect);

    expect(fetch).toHaveBeenCalledWith("/api/payments/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eazo-session": expect.any(String),
      },
      body: JSON.stringify({ productKey: "premium" }),
    });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    assertLocalCheckoutBodyContract(JSON.parse(String(request?.body)));
    expect(readRememberedEazoPaymentId()).toBe("cap_test_eazo");
    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("normalizes local checkout responses from snake_case or camelCase fields", async () => {
    expect(
      normalizeEazoCheckoutResult({
        checkout_session_id: "cs_test_snake",
        checkout_url: "https://checkout.stripe.com/c/pay/cs_test_snake",
        payment_id: "cap_snake",
      }),
    ).toEqual({
      checkoutSessionId: "cs_test_snake",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_snake",
      paymentId: "cap_snake",
    });

    expect(
      normalizeEazoCheckoutResult({
        checkoutSessionId: "cs_test_camel",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_camel",
        paymentId: "cap_camel",
      }),
    ).toEqual({
      checkoutSessionId: "cs_test_camel",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_camel",
      paymentId: "cap_camel",
    });

    expect(normalizeEazoCheckoutResult({ checkoutUrl: "https://checkout.stripe.com" })).toBeNull();
  });

  it("starts checkout when the local route returns platform-shaped snake_case fields", async () => {
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, mockEazoCheckoutResponse({
      checkout_session_id: "cs_test_snake",
      checkout_url: "https://checkout.stripe.com/c/pay/cs_test_snake",
      payment_id: "cap_snake",
    }));
    const redirect = vi.fn();

    await startEazoCheckout("premium", redirect);

    expect(readRememberedEazoPaymentId()).toBe("cap_snake");
    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_snake");
  });

  it("requires login before starting checkout", async () => {
    const login = vi.spyOn(auth, "login").mockResolvedValue({
      id: "user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, {
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      paymentId: "cap_test_eazo",
    });

    await startEazoCheckout("premium", vi.fn());

    expect(login).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(login.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0],
    );
  });

  it("recovers payment id from return URL before storage fallback", async () => {
    rememberEazoPaymentId("cap_stored");
    seedWebSession();
    window.history.pushState({}, "", "/payment/success?payment_id=cap_url");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoPaymentStatus("succeeded")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("active")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;

    render(<EazoPaymentSuccessPage />);

    expect(await screen.findByText("Access ready")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/payments/status?paymentId=cap_url", {
      headers: { "x-eazo-session": expect.any(String) },
      cache: "no-store",
    });
    expect(fetch).toHaveBeenCalledWith("/api/payments/entitlements?productKey=premium", {
      headers: { "x-eazo-session": expect.any(String) },
      cache: "no-store",
    });
    clearRememberedEazoPaymentId();
    expect(readRememberedEazoPaymentId()).toBeNull();
    expect(readEazoPaymentIdFromUrl("?payment_id=cap_url")).toBe("cap_url");
    expect(readEazoPaymentIdFromUrl("?paymentId=cap_camel")).toBe("cap_camel");
    expect(readEazoPaymentIdFromUrl("?payment_id=cap_snake&paymentId=cap_camel")).toBe("cap_snake");
  });

  it("waits for mobile host session before polling payment success status", async () => {
    const mobileSession = { encryptedData: "ciphertext", encryptedKey: "key", iv: "iv", authTag: "tag" };
    installMobileHost(mobileSession);
    window.history.pushState({}, "", "/payment/success?payment_id=cap_mobile");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoPaymentStatus("succeeded")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("active")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;

    render(<EazoPaymentSuccessPage />);

    expect(await screen.findByText("Access ready")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/payments/status?paymentId=cap_mobile", {
      headers: { "x-eazo-session": JSON.stringify(mobileSession) },
      cache: "no-store",
    });
  });

  it("shows an attention state when payment remains processing after the polling limit", async () => {
    vi.useFakeTimers();
    try {
      seedWebSession();
      window.history.pushState({}, "", "/payment/success?payment_id=cap_processing");
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockEazoPaymentStatus("processing")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ) as unknown as typeof fetch;

      render(<EazoPaymentSuccessPage maxAttempts={2} pollIntervalMs={10} />);

      const title = screen.getByText("Confirming payment");
      expect(title).toBeTruthy();
      expect(title.closest("main")?.getAttribute("style")).toContain("place-items: center");
      expect(title.closest("section")?.getAttribute("style")).toContain("border-radius: 16px");
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(10);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("Payment needs attention")).toBeTruthy();
      expect(screen.getByText(/still processing/i)).toBeTruthy();
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes entitlement from the app-local route and caches active state", async () => {
    seedWebSession();
    mockPlatformResponse(200, mockEazoEntitlement("active"));

    await expect(refreshEazoEntitlement("premium")).resolves.toMatchObject({
      status: "active",
      active: true,
    });
    expect(window.localStorage.getItem("eazo:paymentEntitlement:premium")).toContain("active");
  });

  it("does not treat stale active cache flags as unlocked for inactive statuses", () => {
    rememberEazoEntitlement({
      ...mockEazoEntitlement("refunded"),
      product_key: "premium",
      active: true,
    });

    expect(readCachedEazoEntitlement("premium")).toMatchObject({
      status: "refunded",
      active: false,
    });
  });

  it("renders the paid branch through the entitlement gate", async () => {
    seedWebSession();
    mockPlatformResponse(200, mockEazoEntitlement("active"));

    render(
      <EazoEntitlementGate
        productKey="premium"
        loading={<span>Checking</span>}
        paid={<span>Pro is active</span>}
        free={<span>Upgrade</span>}
      />,
    );

    expect(await screen.findByText("Pro is active")).toBeTruthy();
  });

  it("renders subscription management and resumes canceling subscriptions", async () => {
    seedWebSession();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoSubscriptionsResponse({
          items: [mockEazoSubscription({ cancel_at_period_end: true })],
        })), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          subscription: mockEazoSubscription({ cancel_at_period_end: false }),
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoSubscriptionsResponse({
          items: [mockEazoSubscription({ cancel_at_period_end: false })],
        })), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;

    render(<EazoSubscriptionManagementPanel />);

    expect(await screen.findByText("Test app")).toBeTruthy();
    expect(screen.getByText("Canceling")).toBeTruthy();
    const resumeButton = screen.getByRole("button", { name: "Resume" });
    expect(resumeButton.getAttribute("style")).toContain("border-radius: 10px");
    resumeButton.click();

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/payments/subscriptions/cas_test_eazo/resume",
      expect.objectContaining({
        method: "POST",
        headers: { "x-eazo-session": expect.any(String) },
      }),
    ));
  });

  it("payment button starts checkout only after entitlement check and login", async () => {
    seedWebSession();
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "app_user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("inactive")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
          paymentId: "cap_test_eazo",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    render(<EazoPaymentButton productKey="premium">Upgrade</EazoPaymentButton>);
    const button = await screen.findByRole("button", { name: "Upgrade" });
    expect(button.getAttribute("style")).toContain("border-radius: 12px");
    expect(button.getAttribute("style")).toContain("background: #111827");
    button.click();

    await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test"));
  });

  it("keeps abandoned pending entitlements retryable", async () => {
    seedWebSession();
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "app_user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("pending")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_retry",
          paymentId: "cap_retry",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    const { container } = render(<EazoPaymentUnlockPanel productKey="premium" />);

    await screen.findByRole("button", { name: "Continue payment" });
    expect(container.querySelector("section")?.getAttribute("style")).toContain("border-radius: 16px");
    expect(screen.getByText("Payment pending")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Continue payment" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("style")).toContain("background: #111827");
    button.click();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_retry"));
  });

  it("exposes a full checkout lifecycle render prop for app UI", async () => {
    seedWebSession();
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "app_user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("inactive")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
          paymentId: "cap_test_eazo",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    const { getByRole, findByText } = render(
      <EazoPaymentLifecycle productKey="premium">
        {(payment) => (
          <button type="button" onClick={() => void payment.checkout()}>
            {payment.active ? "Lifecycle active" : "Lifecycle upgrade"}
          </button>
        )}
      </EazoPaymentLifecycle>,
    );

    await findByText("Lifecycle upgrade");
    getByRole("button", { name: "Lifecycle upgrade" }).click();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test"));
    expect(readRememberedEazoPaymentId()).toBe("cap_test_eazo");
  });

  it("creates Next route handlers without handwritten platform bodies", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
      getProduct: () => ({
        key: "premium",
        name: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
      }),
    });
    const sessionHeader = seedWebSession();

    const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      headers: { "x-eazo-session": sessionHeader },
      body: JSON.stringify({ productKey: "premium" }),
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
    expect(body).toHaveProperty("unit_amount", 499);
    expect(body).toHaveProperty("product_name", "Premium unlock");
    expect(body).toHaveProperty("app_user_id", "app_user_test");
    expect(body).toHaveProperty("entitlement_key", "premium");
    expect(body).toHaveProperty("success_url", "https://app.example.com/payment/success?product=premium");
    expect(body).toHaveProperty("cancel_url", "https://app.example.com/payment/cancel?product=premium");
    expect(body).not.toHaveProperty("amount");
    expect(body).not.toHaveProperty("title");
  });

  it("derives checkout return URLs from proxy headers instead of E2B local listener origins", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
      getProduct: () => ({
        key: "premium",
        name: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
      }),
    });

    const response = await POST(new Request("http://0.0.0.0:3000/api/payments/checkout", {
      method: "POST",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "3000-i3oy5n5r1j67jd3jn609o.e2b.app",
      },
      body: JSON.stringify({ productKey: "premium" }),
    }));

    expect(response.status).toBe(200);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    assertEazoCheckoutRequestContract(body);
    expect(body.success_url).toBe("https://3000-i3oy5n5r1j67jd3jn609o.e2b.app/payment/success?product=premium");
    expect(body.cancel_url).toBe("https://3000-i3oy5n5r1j67jd3jn609o.e2b.app/payment/cancel?product=premium");
    expect(body.success_url).not.toContain("0.0.0.0");
    expect(body.cancel_url).not.toContain("0.0.0.0");
  });

  it("creates Next status route handlers with exact request and response contract", async () => {
    mockPlatformResponse(200, mockEazoPaymentStatus("succeeded"));
    const GET = createEazoPaymentStatusRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });
    const sessionHeader = seedWebSession();

    const response = await GET(new Request("https://app.example.com/api/payments/status?paymentId=cap_test_eazo", {
      headers: { "x-eazo-session": sessionHeader },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    assertEazoPaymentStatusContract(body);
    expect(body).toEqual(mockEazoPaymentStatus("succeeded"));
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/cap_test_eazo/status?app_id=app_test&app_user_id=app_user_test",
      expect.objectContaining({
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      }),
    );
  });

  it("accepts Stripe-style payment_id on the local status route", async () => {
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
      "https://dev1.eazo.ai/api/open/payments/cap_test_eazo/status?app_id=app_test&app_user_id=app_user_test",
      expect.objectContaining({
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      }),
    );
  });

  it("creates Next entitlement route handlers that require app user session", async () => {
    mockPlatformResponse(200, mockEazoEntitlement("active"));
    const GET = createEazoEntitlementRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });
    const sessionHeader = seedWebSession();

    const response = await GET(new Request("https://app.example.com/api/payments/entitlements?productKey=premium", {
      headers: { "x-eazo-session": sessionHeader },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    assertEazoEntitlementContract(body);
    expect(body).toEqual(mockEazoEntitlement("active"));
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/entitlements?app_id=app_test&product_key=premium&app_user_id=app_user_test",
      expect.objectContaining({
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      }),
    );
  });

  it.each(["productKey", "product_key", "key"] as const)(
    "accepts %s on the local entitlement route",
    async (paramName) => {
      mockPlatformResponse(200, mockEazoEntitlement("active"));
      const GET = createEazoEntitlementRoute({
        getUser: () => ({
          ok: true,
          user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
        }),
      });

      const response = await GET(
        new Request(`https://app.example.com/api/payments/entitlements?${paramName}=premium`),
      );

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledWith(
        "https://dev1.eazo.ai/api/open/payments/entitlements?app_id=app_test&product_key=premium&app_user_id=app_user_test",
        expect.objectContaining({
          headers: { Authorization: "Bearer eazo_private_test" },
          cache: "no-store",
        }),
      );
    },
  );

  it("creates subscription management route handlers", async () => {
    const getUser = () => ({
      ok: true as const,
      user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
    });
    mockPlatformResponse(200, mockEazoSubscriptionsResponse());

    const GET = createEazoSubscriptionsRoute({ getUser });
    const listResponse = await GET(new Request("https://app.example.com/api/payments/subscriptions"));
    expect(listResponse.status).toBe(200);
    assertEazoSubscriptionsResponseContract(await listResponse.json());
    expect(fetch).toHaveBeenCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions?app_id=app_test&app_user_id=app_user_test&limit=50&offset=0",
      expect.objectContaining({
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      }),
    );

    mockPlatformResponse(200, { subscription: mockEazoSubscription({ cancel_at_period_end: true }) });
    const cancelPOST = createEazoCancelSubscriptionRoute({ getUser });
    const cancelResponse = await cancelPOST(
      new Request("https://app.example.com/api/payments/subscriptions/cas_test_eazo/cancel"),
      { params: Promise.resolve({ subscriptionId: "cas_test_eazo" }) },
    );
    expect(cancelResponse.status).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions/cas_test_eazo/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" }),
      }),
    );

    mockPlatformResponse(200, { subscription: mockEazoSubscription({ cancel_at_period_end: false }) });
    const resumePOST = createEazoResumeSubscriptionRoute({ getUser });
    const resumeResponse = await resumePOST(
      new Request("https://app.example.com/api/payments/subscriptions/cas_test_eazo/resume"),
      { params: Promise.resolve({ subscriptionId: "cas_test_eazo" }) },
    );
    expect(resumeResponse.status).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://dev1.eazo.ai/api/open/payments/subscriptions/cas_test_eazo/resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ app_id: "app_test", app_user_id: "app_user_test" }),
      }),
    );
  });

  it("returns clear local payment route validation errors", async () => {
    const statusGET = createEazoPaymentStatusRoute();
    const entitlementGET = createEazoEntitlementRoute();

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

  it("scaffolds thin Next payment files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-"));
    const result = scaffoldPayments({ cwd });

    expect(result.files).toContain("src/lib/eazo-payments/catalog.ts");
    expect(result.files).toContain("src/lib/eazo-payments/payment-ui-contract.test.tsx");
    expect(result.files).toContain("src/components/eazo-payments/PaymentUnlockPanel.tsx");
    expect(result.files).toContain("src/app/api/payments/checkout/route.ts");
    expect(result.files).toContain("src/app/api/payments/entitlements/route.ts");
    const route = fs.readFileSync(
      path.join(cwd, "src/app/api/payments/checkout/route.ts"),
      "utf8",
    );
    expect(route).toContain("@eazo/sdk/payments/next");
    expect(route).not.toContain("/api/open/payments/checkout-sessions");
    expect(route).not.toContain("unit_amount");
    const successPage = fs.readFileSync(
      path.join(cwd, "src/app/payment/success/page.tsx"),
      "utf8",
    );
    const cancelPage = fs.readFileSync(
      path.join(cwd, "src/app/payment/cancel/page.tsx"),
      "utf8",
    );
    expect(successPage).toContain("@eazo/sdk/payments/next/client");
    expect(cancelPage).toContain("@eazo/sdk/payments/next/client");
    const panel = fs.readFileSync(
      path.join(cwd, "src/components/eazo-payments/PaymentUnlockPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("EazoPaymentUnlockPanel");
    assertNoLegacyPaymentFlowSource(panel, "PaymentUnlockPanel.tsx");
    const uiTest = fs.readFileSync(
      path.join(cwd, "src/lib/eazo-payments/payment-ui-contract.test.tsx"),
      "utf8",
    );
    assertNoLegacyPaymentFlowSource(uiTest, "payment-ui-contract.test.tsx");
  });

  it("scaffolds monthly subscription files without exposing interval", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-subscription-"));
    const result = scaffoldPayments({ cwd, recipe: "monthly-subscription" });

    expect(result.files).toContain("src/components/eazo-payments/SubscriptionManagementPanel.tsx");
    expect(result.files).toContain("src/app/api/payments/subscriptions/route.ts");
    expect(result.files).toContain("src/app/api/payments/subscriptions/[subscriptionId]/cancel/route.ts");
    expect(result.files).toContain("src/app/api/payments/subscriptions/[subscriptionId]/resume/route.ts");

    const catalog = fs.readFileSync(path.join(cwd, "src/lib/eazo-payments/catalog.ts"), "utf8");
    expect(catalog).toContain("EAZO_PAYMENT_MODE.SUBSCRIPTION");
    expect(catalog).not.toContain("interval");

    const subscriptionsRoute = fs.readFileSync(
      path.join(cwd, "src/app/api/payments/subscriptions/route.ts"),
      "utf8",
    );
    expect(subscriptionsRoute).toContain("createEazoSubscriptionsRoute");
    expect(subscriptionsRoute).not.toContain("/api/open/payments/subscriptions");

    const managementPanel = fs.readFileSync(
      path.join(cwd, "src/components/eazo-payments/SubscriptionManagementPanel.tsx"),
      "utf8",
    );
    expect(managementPanel).toContain("EazoSubscriptionManagementPanel");
    assertNoLegacyPaymentFlowSource(managementPanel, "SubscriptionManagementPanel.tsx");
  });

  it("ships a complete one-time unlock example with SDK-owned lifecycle code", () => {
    const exampleDir = path.join(__dirname, "../../examples/payments/one-time-unlock");
    const requiredFiles = [
      "README.md",
      ".env.example",
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "src/app/page.tsx",
      "src/lib/eazo-payments/catalog.ts",
      "src/lib/eazo-payments/payment-contract.test.ts",
      "src/lib/eazo-payments/payment-ui-contract.test.tsx",
      "src/components/eazo-payments/PaymentUnlockPanel.tsx",
      "src/app/api/payments/checkout/route.ts",
      "src/app/api/payments/status/route.ts",
      "src/app/api/payments/entitlements/route.ts",
      "src/app/payment/success/page.tsx",
      "src/app/payment/cancel/page.tsx",
    ];

    for (const file of requiredFiles) {
      expect(fs.existsSync(path.join(exampleDir, file)), file).toBe(true);
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(exampleDir, "package.json"), "utf8"));
    expect(packageJson.dependencies["@eazo/sdk"]).toBeDefined();

    const catalog = fs.readFileSync(path.join(exampleDir, "src/lib/eazo-payments/catalog.ts"), "utf8");
    expect(catalog).toContain("defineEazoPaymentProducts");
    expect(catalog).toContain("EAZO_PAYMENT_MODE.ONE_TIME");
    expect(catalog).toContain("EAZO_PAYMENT_CURRENCY.USD");

    const homePage = fs.readFileSync(path.join(exampleDir, "src/app/page.tsx"), "utf8");
    expect(homePage).toContain("PaymentUnlockPanel");
    expect(homePage).toContain("PremiumEntitlementGate");
    expect(homePage).toContain("Access active");
    expect(homePage).toContain("Free experience");
    expect(homePage).toContain("working payment reference");

    const checkoutRoute = fs.readFileSync(
      path.join(exampleDir, "src/app/api/payments/checkout/route.ts"),
      "utf8",
    );
    expect(checkoutRoute).toContain("createEazoCheckoutRoute");
    expect(checkoutRoute).not.toContain("/api/open/payments/checkout-sessions");
    expect(checkoutRoute).not.toContain("unit_amount");

    const sourceFiles = [
      "src/app/page.tsx",
      "src/lib/eazo-payments/catalog.ts",
      "src/components/eazo-payments/PaymentUnlockPanel.tsx",
      "src/app/api/payments/checkout/route.ts",
      "src/app/api/payments/status/route.ts",
      "src/app/api/payments/entitlements/route.ts",
      "src/app/payment/success/page.tsx",
      "src/app/payment/cancel/page.tsx",
    ];
    for (const file of sourceFiles) {
      const source = fs.readFileSync(path.join(exampleDir, file), "utf8");
      assertNoLegacyPaymentFlowSource(source, file);
    }
  });

  it("ships a simple monthly subscription example with access and management states", () => {
    const exampleDir = path.join(__dirname, "../../examples/payments/monthly-subscription");
    const homePage = fs.readFileSync(path.join(exampleDir, "src/app/page.tsx"), "utf8");
    const panel = fs.readFileSync(
      path.join(exampleDir, "src/components/eazo-payments/PaymentUnlockPanel.tsx"),
      "utf8",
    );
    const managementPanel = fs.readFileSync(
      path.join(exampleDir, "src/components/eazo-payments/SubscriptionManagementPanel.tsx"),
      "utf8",
    );

    expect(homePage).toContain("Paid access");
    expect(homePage).toContain("Access active");
    expect(homePage).toContain("SubscriptionManagementPanel");
    expect(homePage).toContain("working subscription reference");
    expect(panel).toContain("EazoPaymentUnlockPanel");
    expect(managementPanel).toContain("EazoSubscriptionManagementPanel");
    assertNoLegacyPaymentFlowSource(homePage, "monthly-subscription/src/app/page.tsx");
  });

  it.each([
    "startEazoCheckout('premium')",
    "fetch('/api/payments/checkout')",
    "fetch('/api/payments/status?paymentId=cap_test')",
    "fetch('/api/payments/entitlements?productKey=premium')",
    "stripe.webhooks.constructEvent",
    "stripe.checkout.sessions.create",
  ])("rejects hand-written payment lifecycle source: %s", (source) => {
    expect(() => assertNoLegacyPaymentFlowSource(source, "bad.tsx")).toThrow(
      "legacy Eazo payment flow detected",
    );
  });

  it("does not use popup checkout", () => {
    const source = fs.readFileSync(path.join(__dirname, "../payments.ts"), "utf8");
    expect(source).toContain("window.location.assign");
    expect(source).not.toContain("window.open");
  });
});
