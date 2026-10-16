import { render, screen, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectPaymentsSourceRoot, scaffoldPayments } from "../cli";
import {
  assertEazoCheckoutItems,
  EAZO_ITEMS_MAXIMUM_AMOUNT_BY_CURRENCY,
  EAZO_PAYMENT_MAXIMUM_UNIT_AMOUNT_BY_CURRENCY,
  getEazoItemsMaximumAmount,
  readRememberedEazoPaymentId,
  startEazoItemsCheckout,
} from "../payments";
import {
  buildEazoItemsCheckoutRequest,
  createEazoItemsCheckoutSession,
  listEazoItemsPayments,
} from "../payments.server";
import {
  createEazoCheckoutRoute,
  createEazoPaymentStatusRoute,
  createEazoPaymentSyncRoute,
} from "../payments.next";
import { EazoPaymentSuccessPage } from "../payments.next.client";
import {
  assertEazoItemsCheckoutRequestContract,
  assertLocalItemsCheckoutBodyContract,
  assertNoLegacyPaymentFlowSource,
  mockEazoItemsPayment,
  mockEazoItemsPaymentFromResolution,
  mockEazoCheckoutResponse,
} from "../payments.testing";
import { auth } from "../internal/capabilities/auth";
import { store } from "../internal/store";
import { __resetSDK } from "../testing";

const originalEnv = { ...process.env };
const TEST_USER = { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null };
const getUser = () => ({ ok: true as const, user: TEST_USER });
const ITEMS = [
  { name: "Item B", unitAmount: 199, quantity: 2, metadata: { item_id: "item_b" } },
  { name: "Item A", unitAmount: 499 },
];

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function mockPlatformResponses(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }
  global.fetch = fetchMock as unknown as typeof fetch;
}

function lastRequestBody() {
  const [, request] = vi.mocked(fetch).mock.calls.at(-1)!;
  return JSON.parse(String(request?.body));
}

describe("Eazo items checkout SDK", () => {
  beforeEach(() => {
    __resetSDK();
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
    store.reset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("scales the items ceiling to USD 5,000 for every SDK currency", () => {
    expect(Object.keys(EAZO_ITEMS_MAXIMUM_AMOUNT_BY_CURRENCY).sort())
      .toEqual(Object.keys(EAZO_PAYMENT_MAXIMUM_UNIT_AMOUNT_BY_CURRENCY).sort());
    expect(getEazoItemsMaximumAmount("usd")).toBe(500_000);
    expect(getEazoItemsMaximumAmount("cny")).toBe(3_394_300);
    expect(getEazoItemsMaximumAmount("jpy")).toBe(811_550);
    expect(getEazoItemsMaximumAmount("huf")).toBe(99_999_999);
  });

  it("validates lines against the items total instead of the single-product ceiling", () => {
    expect(assertEazoCheckoutItems(ITEMS, "usd")).toEqual({ subtotal: 897, discountAmount: 0, total: 897 });
    expect(assertEazoCheckoutItems([{ name: "Bundle", unitAmount: 450_000 }], "usd").total).toBe(450_000);
    expect(() => assertEazoCheckoutItems([], "usd")).toThrow("non-empty");
    expect(() => assertEazoCheckoutItems([{ name: "Bundle", unitAmount: 300_000, quantity: 2 }], "usd"))
      .toThrow("items total for USD must not exceed 500000");
    expect(() => assertEazoCheckoutItems([{ name: "Cheap", unitAmount: 10 }], "usd")).toThrow("at least 50");
    expect(() => assertEazoCheckoutItems([{ name: "Many", unitAmount: 50, quantity: 1000 }], "usd"))
      .toThrow("quantity must be an integer from 1 to 999");
    expect(() => assertEazoCheckoutItems([{ name: " ", unitAmount: 100 }], "usd")).toThrow("name is required");
    expect(() => assertEazoCheckoutItems([{ name: "Odd", unitAmount: 150 }], "isk")).toThrow("multiple of 100");
  });

  it("validates unlock items and discounts", () => {
    expect(assertEazoCheckoutItems(
      [{ name: "Item A", unitAmount: 500, entitlementKey: "item_a" }, { name: "Item B", unitAmount: 400, quantity: 2 }],
      "usd",
      { discountAmount: 300 },
    )).toEqual({ subtotal: 1300, discountAmount: 300, total: 1000 });
    expect(() => assertEazoCheckoutItems([{ name: "Item A", unitAmount: 500, quantity: 2, entitlementKey: "item_a" }], "usd"))
      .toThrow("must have quantity 1");
    expect(() => assertEazoCheckoutItems([
      { name: "Item A", unitAmount: 500, entitlementKey: "item_a" },
      { name: "Item A copy", unitAmount: 500, entitlementKey: "item_a" },
    ], "usd")).toThrow("appears more than once");
    expect(() => assertEazoCheckoutItems([{ name: "Item A", unitAmount: 500, entitlementKey: "Bad Key" }], "usd"))
      .toThrow("entitlementKey");
    expect(() => assertEazoCheckoutItems([{ name: "Item B", unitAmount: 500 }], "usd", { discountAmount: 500 }))
      .toThrow("discountAmount");
    expect(() => assertEazoCheckoutItems([{ name: "Item B", unitAmount: 500 }], "usd", { discountAmount: 460 }))
      .toThrow("after discount for USD must be at least 50");
  });

  it("sends unlock keys and the discount only when present", () => {
    const request = buildEazoItemsCheckoutRequest({
      appUserId: "app_user_test",
      currency: "usd",
      items: [{ name: "Item A", unitAmount: 500, entitlementKey: "item_a" }, { name: "Item B", unitAmount: 400, quantity: 2 }],
      discountAmount: 300,
      discountLabel: "Discount",
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
      idempotencyKey: "items-once",
    });
    assertEazoItemsCheckoutRequestContract(request);
    expect(request.items).toEqual([
      { name: "Item A", unit_amount: 500, quantity: 1, metadata: {}, entitlement_key: "item_a" },
      { name: "Item B", unit_amount: 400, quantity: 2, metadata: {} },
    ]);
    expect(request).toMatchObject({ discount_amount: 300, discount_label: "Discount" });
    const noDiscount = buildEazoItemsCheckoutRequest({
      appUserId: "app_user_test",
      currency: "usd",
      items: ITEMS,
      discountAmount: 0,
      discountLabel: "Coupon did not apply",
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
    });
    expect(noDiscount).not.toHaveProperty("discount_amount");
    expect(noDiscount).not.toHaveProperty("discount_label");
  });

  it("builds the exact items checkout DTO", () => {
    const request = buildEazoItemsCheckoutRequest({
      appUserId: "app_user_test",
      currency: "usd",
      items: ITEMS,
      metadata: { order_id: "order_9" },
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "items-once",
    });

    assertEazoItemsCheckoutRequestContract(request);
    expect(request).toEqual({
      app_id: "app_test",
      app_user_id: "app_user_test",
      mode: "one_time",
      currency: "usd",
      items: [
        { name: "Item B", unit_amount: 199, quantity: 2, metadata: { item_id: "item_b" } },
        { name: "Item A", unit_amount: 499, quantity: 1, metadata: {} },
      ],
      success_url: "https://app.example.com/payment/success",
      cancel_url: "https://app.example.com/payment/cancel",
      metadata: { order_id: "order_9" },
      idempotency_key: "items-once",
    });
    expect(() =>
      buildEazoItemsCheckoutRequest({
        appUserId: "",
        currency: "usd",
        items: ITEMS,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).toThrow("appUserId is required");
  });

  it("creates items checkout sessions through the platform checkout endpoint", async () => {
    mockPlatformResponse(200, { ...mockEazoCheckoutResponse(), amount_total: 897, line_items: [] });

    const result = await createEazoItemsCheckoutSession({
      appUserId: "app_user_test",
      currency: "usd",
      items: ITEMS,
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
    });

    expect(result.paymentId).toBe("cap_test_eazo");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://dev1.eazo.ai/creator/api/open/payments/checkout-sessions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer eazo_private_test");
    expect(lastRequestBody().mode).toBe("one_time");
  });

  it("rejects invalid items before calling the platform", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    await expect(
      createEazoItemsCheckoutSession({
        appUserId: "app_user_test",
        currency: "usd",
        items: [{ name: "Bundle", unitAmount: 300_000, quantity: 2 }],
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow("items total");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists one-time payments that have line items", async () => {
    const singleProduct = { ...mockEazoItemsPayment("succeeded"), payment_id: "cap_single", line_items: null };
    mockPlatformResponse(200, {
      items: [mockEazoItemsPayment("succeeded"), singleProduct],
      has_more: false,
      limit: 20,
      offset: 0,
    });

    const result = await listEazoItemsPayments({
      appUserId: "app_user_test",
      status: "succeeded",
      updatedAfter: new Date("2026-10-01T00:00:00.000Z"),
      limit: 20,
    });

    // Single-product one-time payments share the mode and are filtered out.
    expect(result.items.map((payment) => payment.payment_id)).toEqual(["cap_test_items"]);
    expect(result.items[0].line_items).toHaveLength(2);
    const [url] = vi.mocked(fetch).mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/creator/api/open/payments");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      app_id: "app_test",
      mode: "one_time",
      limit: "20",
      offset: "0",
      app_user_id: "app_user_test",
      status: "succeeded",
      updated_after: "2026-10-01T00:00:00.000Z",
    });
  });

  it("starts items checkout with item ids only and remembers the payment", async () => {
    vi.spyOn(auth, "login").mockResolvedValue(TEST_USER);
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_items", paymentId: "cap_items" });
    const redirect = vi.fn();

    await startEazoItemsCheckout([{ id: "item_b", quantity: 2 }], { redirect, data: { couponCode: "NEW3" } });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/payments/checkout");
    const body = JSON.parse(String(init?.body));
    assertLocalItemsCheckoutBodyContract(body);
    expect(body).toEqual({ lines: [{ id: "item_b", quantity: 2 }], data: { couponCode: "NEW3" } });
    expect(readRememberedEazoPaymentId()).toBe("cap_items");
    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_items");
  });

  it("prices items on the server through resolveItems", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const resolveItems = vi.fn(({ lines, data }) => ({
      currency: "usd" as const,
      items: lines.map((line: { id: string; quantity: number }) => ({
        name: line.id,
        unitAmount: 300,
        quantity: line.quantity,
      })),
      ...(data.couponCode === "NEW3" ? { discountAmount: 100, discountLabel: "New user" } : {}),
    }));
    const POST = createEazoCheckoutRoute({ resolveItems, getUser });

    const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "item_b", quantity: 3 }], data: { couponCode: "NEW3" } }),
    }));

    expect(response.status).toBe(200);
    expect(resolveItems).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ id: "item_b", quantity: 3 }],
      data: { couponCode: "NEW3" },
      user: TEST_USER,
    }));
    const body = lastRequestBody();
    assertEazoItemsCheckoutRequestContract(body);
    expect(body.items).toEqual([{ name: "item_b", unit_amount: 300, quantity: 3, metadata: {} }]);
    expect(body).toMatchObject({ discount_amount: 100, discount_label: "New user" });
    expect(body.success_url).toBe("https://app.example.com/payment/success");
    expect(body.cancel_url).toBe("https://app.example.com/payment/cancel");
  });

  it("rejects malformed lines and items resolveItems refuses", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const POST = createEazoCheckoutRoute({ resolveItems: () => null, getUser });

    const badData = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "a", quantity: 1 }], data: { discountAmount: 500 } }),
    }));
    expect(badData.status).toBe(400);
    for (const lines of [undefined, [], [{ id: "", quantity: 1 }], [{ id: "a", quantity: 0 }], [{ id: "a", quantity: 1.5 }]]) {
      const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ lines }),
      }));
      expect(response.status).toBe(400);
    }
    const refused = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "unknown", quantity: 1 }] }),
    }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "Invalid items" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fulfills only paid payments with line items from the status route", async () => {
    const fulfill = vi.fn();
    const GET = createEazoPaymentStatusRoute({ fulfill, getUser });
    const request = () => new Request("https://app.example.com/api/payments/status?payment_id=cap_test_items");

    mockPlatformResponse(200, mockEazoItemsPayment("processing"));
    expect(await (await GET(request())).json()).toMatchObject({ paid: false, fulfilled: false });
    expect(fulfill).not.toHaveBeenCalled();

    mockPlatformResponse(200, mockEazoItemsPayment("succeeded"));
    expect(await (await GET(request())).json()).toMatchObject({ paid: true, fulfilled: true });
    expect(fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ payment_id: "cap_test_items", mode: "one_time" }),
      { user: TEST_USER },
    );
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("app_user_id=app_user_test");
  });

  it("reports paid-but-ungranted payments when fulfill fails", async () => {
    const GET = createEazoPaymentStatusRoute({
      fulfill: () => {
        throw new Error("inventory service down");
      },
      getUser,
    });
    mockPlatformResponse(200, mockEazoItemsPayment("succeeded"));

    const response = await GET(new Request("https://app.example.com/api/payments/status?paymentId=cap_test_items"));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "inventory service down",
      payment_id: "cap_test_items",
      mode: "one_time",
      paid: true,
      fulfilled: false,
    });
  });

  it("passes single-product payments through the shared status route without fulfilling", async () => {
    const fulfill = vi.fn();
    const GET = createEazoPaymentStatusRoute({ fulfill, getUser });
    mockPlatformResponse(200, { ...mockEazoItemsPayment("succeeded"), line_items: null });

    const response = await GET(new Request("https://app.example.com/api/payments/status?paymentId=cap_1"));

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("fulfilled");
    expect(fulfill).not.toHaveBeenCalled();
  });

  it("without fulfill, reports a paid payment fulfilled only when every line is an entitlement", async () => {
    const GET = createEazoPaymentStatusRoute({ getUser });
    const request = () => new Request("https://app.example.com/api/payments/status?paymentId=cap_test_items");

    mockPlatformResponse(200, mockEazoItemsPayment("succeeded"));
    expect(await (await GET(request())).json()).toMatchObject({ paid: true, fulfilled: false });

    const entitlementOnly = mockEazoItemsPayment("succeeded");
    entitlementOnly.line_items = entitlementOnly.line_items.filter((line) => line.entitlement_key);
    mockPlatformResponse(200, entitlementOnly);
    expect(await (await GET(request())).json()).toMatchObject({ paid: true, fulfilled: true });
  });

  it("rejects invalid resolved items with 400 before calling the platform", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const POST = createEazoCheckoutRoute({
      getUser,
      resolveItems: () => ({ currency: "usd", items: [{ name: "Bundle", unitAmount: 300_000, quantity: 2 }] }),
    });
    const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "a", quantity: 2 }] }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("items total");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps syncing the remaining payments when one fulfill fails", async () => {
    const fulfill = vi.fn(async (payment: { payment_id: string }) => {
      if (payment.payment_id === "cap_bad") throw new Error("unknown item");
    });
    const POST = createEazoPaymentSyncRoute({ fulfill, getUser });
    mockPlatformResponse(200, {
      items: [
        mockEazoItemsPayment("succeeded", { payment_id: "cap_bad" }),
        mockEazoItemsPayment("succeeded", { payment_id: "cap_ok" }),
      ],
      has_more: false,
      limit: 100,
      offset: 0,
    });

    const response = await POST(new Request("https://app.example.com/api/payments/sync", { method: "POST" }));

    expect(await response.json()).toEqual({ processed: 1, failed: 1 });
    expect(fulfill).toHaveBeenCalledTimes(2);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url)).searchParams.get("updated_after")).toBeTruthy();
  });

  it("serves product and items checkout from one route", async () => {
    const POST = createEazoCheckoutRoute({
      getUser,
      getProduct: () => ({ key: "premium", name: "Premium unlock", unitAmount: 499, currency: "usd" }),
      resolveItems: () => ({ currency: "usd", items: [{ name: "A", unitAmount: 300 }] }),
    });

    mockPlatformResponse(200, mockEazoCheckoutResponse());
    await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ productKey: "premium" }),
    }));
    expect(lastRequestBody()).toMatchObject({ product_key: "premium", mode: "one_time" });

    mockPlatformResponse(200, mockEazoCheckoutResponse());
    await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "a", quantity: 1 }] }),
    }));
    expect(lastRequestBody()).toMatchObject({ mode: "one_time" });

    const productOnly = createEazoCheckoutRoute({ getUser, getProduct: () => null });
    const refused = await productOnly(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "a", quantity: 1 }] }),
    }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain("resolveItems");
  });

  it("syncs every paid payment across pages", async () => {
    const fulfill = vi.fn();
    const POST = createEazoPaymentSyncRoute({ fulfill, getUser });
    mockPlatformResponses(
      { items: [mockEazoItemsPayment("succeeded", { payment_id: "cap_1" })], has_more: true, limit: 100, offset: 0 },
      { items: [mockEazoItemsPayment("succeeded", { payment_id: "cap_2" })], has_more: false, limit: 100, offset: 100 },
    );

    const response = await POST(new Request("https://app.example.com/api/payments/sync", { method: "POST" }));

    expect(await response.json()).toEqual({ processed: 2, failed: 0 });
    expect(fulfill.mock.calls.map(([payment]) => payment.payment_id)).toEqual(["cap_1", "cap_2"]);
    const offsets = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).searchParams.get("offset"));
    expect(offsets).toEqual(["0", "100"]);
  });

  it("shows a delivered state once the status route fulfills the payment", async () => {
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    window.history.pushState({}, "", "/payment/success?payment_id=cap_test_items");
    mockPlatformResponse(200, { ...mockEazoItemsPayment("succeeded"), fulfilled: true });

    render(<EazoPaymentSuccessPage />);

    await waitFor(() => expect(screen.getByText("Purchase complete")).toBeTruthy());
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe("/api/payments/status?paymentId=cap_test_items");
    // The entitlement line refreshes its entitlement so gates update.
    expect(urls.some((url) => url.startsWith("/api/payments/entitlements?") && url.includes("item_a"))).toBe(true);
  });

  it("tells the buyer delivery is pending when payment succeeded but fulfill failed", async () => {
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    window.history.pushState({}, "", "/payment/success?payment_id=cap_test_items");
    mockPlatformResponse(500, { error: "down", payment_id: "cap_test_items", paid: true, fulfilled: false });

    render(<EazoPaymentSuccessPage />);

    await waitFor(() => expect(screen.getByText("Payment received")).toBeTruthy());
  });

  it("builds a paid mock payment from resolved items", () => {
    const payment = mockEazoItemsPaymentFromResolution({
      currency: "usd",
      items: [{ name: "Item A", unitAmount: 500, entitlementKey: "item_a" }, { name: "Item B", unitAmount: 400, quantity: 2 }],
      discountAmount: 300,
      metadata: { coupon_id: "c_1" },
    });
    expect(payment).toMatchObject({ paid: true, amount_subtotal: 1300, discount_amount: 300, amount_total: 1000 });
    expect(payment.line_items.map((line) => line.entitlement_key)).toEqual(["item_a", null]);
  });

  it("scaffolds into a root app/ directory when the project has no src/app", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-root-app-"));
    fs.mkdirSync(path.join(cwd, "app"));
    expect(detectPaymentsSourceRoot(cwd)).toBe("");

    const scaffolded = scaffoldPayments({ cwd, recipe: "one-time-items" });
    expect(scaffolded.files).toContain("app/api/payments/checkout/route.ts");
    expect(scaffolded.files).toContain("lib/eazo-payments/items.ts");
    expect(scaffolded.files.some((file) => file.startsWith("src/"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, "src"))).toBe(false);
    const contractTest = fs.readFileSync(path.join(cwd, "lib/eazo-payments/items-contract.test.ts"), "utf8");
    expect(contractTest).toContain('["app", "lib", "components"]');
    expect(contractTest).not.toContain('path.resolve(process.cwd(), "src")');

    const oneTimeCwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-root-app-one-time-"));
    fs.mkdirSync(path.join(oneTimeCwd, "app"));
    const oneTime = scaffoldPayments({ cwd: oneTimeCwd, recipe: "one-time-unlock" });
    expect(oneTime.files).toContain("app/api/payments/checkout/route.ts");
  });

  it("keeps shared payment routes of an existing integration and says what to add", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-existing-"));
    scaffoldPayments({ cwd, recipe: "one-time-unlock" });
    const checkoutBefore = fs.readFileSync(path.join(cwd, "src/app/api/payments/checkout/route.ts"), "utf8");

    const scaffolded = scaffoldPayments({ cwd, recipe: "one-time-items" });

    expect(scaffolded.kept.map((file) => file.filePath)).toEqual([
      "src/app/api/payments/checkout/route.ts",
      "src/app/api/payments/status/route.ts",
      "src/app/api/payments/entitlements/route.ts",
      "src/app/payment/success/page.tsx",
      "src/app/payment/cancel/page.tsx",
    ]);
    expect(scaffolded.kept[0].hint).toContain("resolveItems");
    expect(scaffolded.kept[1].hint).toContain("fulfill: fulfillPayment");
    expect(scaffolded.files).toContain("src/app/api/payments/sync/route.ts");
    expect(fs.readFileSync(path.join(cwd, "src/app/api/payments/checkout/route.ts"), "utf8")).toBe(checkoutBefore);
  });

  it("keeps shared routes in a root app/ project, even with --force", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-root-existing-"));
    fs.mkdirSync(path.join(cwd, "app"));
    scaffoldPayments({ cwd, recipe: "one-time-unlock" });
    const checkoutBefore = fs.readFileSync(path.join(cwd, "app/api/payments/checkout/route.ts"), "utf8");

    const scaffolded = scaffoldPayments({ cwd, recipe: "one-time-items" });
    expect(scaffolded.kept.map((file) => file.filePath)).toEqual([
      "app/api/payments/checkout/route.ts",
      "app/api/payments/status/route.ts",
      "app/api/payments/entitlements/route.ts",
      "app/payment/success/page.tsx",
      "app/payment/cancel/page.tsx",
    ]);
    const again = scaffoldPayments({ cwd, recipe: "one-time-items", force: true });
    expect(again.kept).toHaveLength(5);
    expect(fs.readFileSync(path.join(cwd, "app/api/payments/checkout/route.ts"), "utf8")).toBe(checkoutBefore);
  });

  it("keeps src/ when the project uses src/app or has no app directory yet", () => {
    const withSrc = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-src-app-"));
    fs.mkdirSync(path.join(withSrc, "src", "app"), { recursive: true });
    fs.mkdirSync(path.join(withSrc, "app"));
    expect(detectPaymentsSourceRoot(withSrc)).toBe("src");
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-empty-"));
    expect(detectPaymentsSourceRoot(empty)).toBe("src");
  });

  it("scaffolds the one-time-items recipe with thin routes and an explicit fulfill stub", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-items-"));
    const result = scaffoldPayments({ cwd, recipe: "one-time-items" });

    expect(result.files).toEqual([
      "src/lib/eazo-payments/items.ts",
      "src/lib/eazo-payments/items-contract.test.ts",
      "src/components/eazo-payments/ItemsCheckoutButton.tsx",
      "src/components/eazo-payments/PaymentSync.tsx",
      "src/app/api/payments/checkout/route.ts",
      "src/app/api/payments/status/route.ts",
      "src/app/api/payments/sync/route.ts",
      "src/app/api/payments/entitlements/route.ts",
      "src/app/payment/success/page.tsx",
      "src/app/payment/cancel/page.tsx",
    ]);
    expect(fs.readFileSync(path.join(cwd, "src/app/api/payments/checkout/route.ts"), "utf8"))
      .toContain("createEazoCheckoutRoute({ resolveItems })");
    const itemsSource = fs.readFileSync(path.join(cwd, "src/lib/eazo-payments/items.ts"), "utf8");
    expect(itemsSource).toContain("export async function resolveItems");
    expect(itemsSource).toContain("Implement fulfillPayment");
    expect(itemsSource).toContain("entitlementKey: \"item_a\"");
    expect(itemsSource).toContain("onConflictDoNothing({ target: paymentFulfillments.paymentId })");
    expect(itemsSource).not.toContain("productKey");
    for (const file of result.files) {
      const source = fs.readFileSync(path.join(cwd, file), "utf8");
      expect(source).not.toContain("/api/open/payments");
      if (!file.endsWith(".test.ts")) assertNoLegacyPaymentFlowSource(source, file);
    }
  });
});
