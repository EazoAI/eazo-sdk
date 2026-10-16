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
    if (/\.test\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath];
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
