import {
  assertEazoCheckoutItems,
  EAZO_ITEMS_MAX_LINES,
  EAZO_ITEMS_MAX_QUANTITY,
  EazoPaymentApiError,
  type EazoCheckoutItem,
  type EazoCheckoutLine,
  type EazoItemsPayment,
  type EazoPaymentCurrency,
  type EazoPaymentMetadata,
  type EazoPaymentProduct,
} from "./payments";
import {
  cancelEazoSubscription,
  createEazoItemsCheckoutSession,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
  listEazoItemsPayments,
  listEazoSubscriptions,
  resumeEazoSubscription,
} from "./payments.server";
import { requireAuth, type User } from "./server";

type JsonBody = Record<string, unknown>;

export type EazoCheckoutRouteOptions = {
  /** One-time / subscription checkout: body `{ productKey }`, priced from the catalog. */
  getProduct?: (productKey: string) => EazoPaymentProduct | null | undefined;
  /**
   * Several items: body `{ lines: [{ id, quantity }], data? }`. Turn the lines into
   * priced items from the app's own server-side data; return null to reject the
   * request. Never trust prices sent from the browser.
   */
  resolveItems?: EazoResolveItems;
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
};

function jsonResponse(body: JsonBody, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function forwardedHeaderPart(forwarded: string | null, key: string) {
  const first = firstHeaderValue(forwarded);
  if (!first) return null;
  for (const segment of first.split(";")) {
    const [rawName, ...rawValueParts] = segment.split("=");
    if (rawName?.trim().toLowerCase() !== key) continue;
    const value = rawValueParts.join("=").trim().replace(/^"|"$/g, "");
    return value || null;
  }
  return null;
}

function normalizeOriginCandidate(candidate: string | null) {
  if (!candidate) return null;
  try {
    const value = candidate.includes("://") ? candidate : `https://${candidate}`;
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (isLocalCheckoutHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalCheckoutHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "0.0.0.0" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");
}

function envPublicOrigin() {
  if (typeof process === "undefined" || !process.env) return null;
  return normalizeOriginCandidate(
    process.env.EAZO_APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_EAZO_APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    null,
  );
}

function getRequestOrigin(request: { url: string; headers: { get(name: string): string | null } }) {
  const forwardedHost = forwardedHeaderPart(request.headers.get("forwarded"), "host");
  const forwardedProto = forwardedHeaderPart(request.headers.get("forwarded"), "proto");
  const xForwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const xForwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const host = firstHeaderValue(request.headers.get("host"));

  const headerOrigin =
    normalizeOriginCandidate(`${forwardedProto || xForwardedProto || "https"}://${forwardedHost || xForwardedHost || ""}`) ||
    normalizeOriginCandidate(forwardedHost || xForwardedHost) ||
    normalizeOriginCandidate(request.headers.get("origin")) ||
    normalizeOriginCandidate(request.headers.get("referer")) ||
    envPublicOrigin() ||
    normalizeOriginCandidate(host) ||
    normalizeOriginCandidate(request.url);

  if (!headerOrigin) {
    throw new Error(
      "Unable to resolve public app origin for checkout return URL. " +
      "Set EAZO_APP_PUBLIC_URL or ensure x-forwarded-host/x-forwarded-proto reaches the app route.",
    );
  }

  return headerOrigin;
}

function firstSearchParam(params: URLSearchParams, names: readonly string[]) {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

function firstBodyString(body: JsonBody, names: readonly string[]) {
  for (const name of names) {
    const value = body[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function createEazoCheckoutRoute(options: EazoCheckoutRouteOptions) {
  return async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    const bodyRecord = body && typeof body === "object" ? body as JsonBody : {};
    if (bodyRecord.lines !== undefined) {
      if (!options.resolveItems) {
        return jsonResponse({ error: "Checkout with items is not enabled: pass resolveItems" }, { status: 400 });
      }
      return checkoutItems(request, bodyRecord, options.resolveItems, options.getUser);
    }
    if (!options.getProduct) {
      return jsonResponse({ error: "Product checkout is not enabled: pass getProduct" }, { status: 400 });
    }
    const productKey = firstBodyString(bodyRecord, ["productKey", "product_key", "key"]) || "premium";
    const product = options.getProduct(productKey);

    if (!product) {
      return jsonResponse({ error: "Unknown product" }, { status: 400 });
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const origin = getRequestOrigin(request);
      const checkout = await createEazoCheckoutSession({
        productKey: product.key,
        productName: product.name,
        unitAmount: product.unitAmount,
        currency: product.currency,
        mode: product.mode || "one_time",
        entitlementKey: product.entitlementKey || product.key,
        appUserId: authResult.user.id,
        successUrl: `${origin}/payment/success?product=${encodeURIComponent(product.key)}`,
        cancelUrl: `${origin}/payment/cancel?product=${encodeURIComponent(product.key)}`,
        metadata: {
          product_key: product.key,
          entitlement_key: product.entitlementKey || product.key,
          mode: product.mode || "one_time",
        },
      });

      return jsonResponse(checkout);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Checkout failed" },
        { status: 500 },
      );
    }
  };
}

export function createEazoPaymentStatusRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
  /** Payments with line items only: grants lines without entitlement_key once the payment is paid. */
  fulfill?: EazoItemsFulfill;
} = {}) {
  return async function GET(request: Request) {
    const paymentId = firstSearchParam(
      new URL(request.url).searchParams,
      ["paymentId", "payment_id"],
    );

    if (!paymentId) {
      return jsonResponse(
        { error: "Missing paymentId", accepted: ["paymentId", "payment_id"] },
        { status: 400 },
      );
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const status = await getEazoPaymentStatus(paymentId, { appUserId: authResult.user.id });
      if (isItemsPayment(status)) {
        return fulfillItemsStatus(status, authResult.user, options.fulfill);
      }
      return jsonResponse(status as unknown as JsonBody);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Payment status failed" },
        { status: 500 },
      );
    }
  };
}

export function createEazoEntitlementRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: Request) {
    const productKey = firstSearchParam(
      new URL(request.url).searchParams,
      ["productKey", "product_key", "key"],
    );

    if (!productKey) {
      return jsonResponse(
        { error: "Missing productKey", accepted: ["productKey", "product_key", "key"] },
        { status: 400 },
      );
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const entitlement = await getEazoEntitlementStatus(productKey, {
        appUserId: authResult.user.id,
      });
      return jsonResponse(entitlement as unknown as JsonBody);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Payment entitlement failed" },
        { status: 500 },
      );
    }
  };
}

export function createEazoSubscriptionsRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const subscriptions = await listEazoSubscriptions({
        appUserId: authResult.user.id,
        limit: Number(params.get("limit") || 50),
        offset: Number(params.get("offset") || 0),
      });
      return jsonResponse(subscriptions as unknown as JsonBody);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Subscription list failed" },
        { status: 500 },
      );
    }
  };
}

async function subscriptionActionResponse(
  request: Request,
  subscriptionId: string,
  action: "cancel" | "resume",
  getUser?: (request: Request) => ReturnType<typeof requireAuth>,
) {
  const authResult = getUser ? getUser(request) : requireAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const result = action === "cancel"
      ? await cancelEazoSubscription(subscriptionId, { appUserId: authResult.user.id })
      : await resumeEazoSubscription(subscriptionId, { appUserId: authResult.user.id });
    return jsonResponse(result as unknown as JsonBody);
  } catch (error) {
    if (error instanceof EazoPaymentApiError) {
      return jsonResponse(
        { error: error.message, platform: error.body },
        { status: error.status },
      );
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Subscription update failed" },
      { status: 500 },
    );
  }
}

export function createEazoCancelSubscriptionRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ subscriptionId?: string; id?: string }> },
  ) {
    const params = await context.params;
    const subscriptionId = params.subscriptionId || params.id || "";
    if (!subscriptionId) return jsonResponse({ error: "Missing subscriptionId" }, { status: 400 });
    return subscriptionActionResponse(request, subscriptionId, "cancel", options.getUser);
  };
}

export function createEazoResumeSubscriptionRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ subscriptionId?: string; id?: string }> },
  ) {
    const params = await context.params;
    const subscriptionId = params.subscriptionId || params.id || "";
    if (!subscriptionId) return jsonResponse({ error: "Missing subscriptionId" }, { status: 400 });
    return subscriptionActionResponse(request, subscriptionId, "resume", options.getUser);
  };
}

const ITEM_LINE_ID_MAX_LENGTH = 128;
const CHECKOUT_DATA_MAX_KEYS = 20;
const CHECKOUT_DATA_VALUE_MAX_LENGTH = 500;
const SYNC_PAGE_SIZE = 100;
const SYNC_MAX_PAGES = 50;
const SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type EazoItemsResolution = {
  currency: EazoPaymentCurrency;
  items: EazoCheckoutItem[];
  /** Amount off the subtotal, computed here on the server (e.g. from the app's own coupon). */
  discountAmount?: number;
  /** Shown next to the discount on the Stripe checkout page. */
  discountLabel?: string;
  /** Returned on the paid payment, e.g. { coupon_id } so fulfill can mark it used. */
  metadata?: EazoPaymentMetadata;
};

export type EazoItemsFulfill = (
  payment: EazoItemsPayment,
  context: { user: User },
) => void | Promise<void>;

export type EazoResolveItems = (input: {
  lines: EazoCheckoutLine[];
  /** Untrusted string values from startEazoItemsCheckout({ data }), e.g. a coupon code. */
  data: Record<string, string>;
  user: User;
  request: Request;
}) => EazoItemsResolution | null | undefined | Promise<EazoItemsResolution | null | undefined>;

export type EazoPaymentSyncRouteOptions = {
  /**
   * Grants what a paid payment bought. Called only for paid payments with line items, and may be
   * called more than once for the same payment, so it must be idempotent by
   * `payment.payment_id`.
   */
  fulfill: EazoItemsFulfill;
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
};

function platformErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof EazoPaymentApiError) {
    return jsonResponse(
      { error: error.message, platform: error.body },
      { status: error.status },
    );
  }
  return jsonResponse(
    { error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 },
  );
}

function parseItemLines(body: JsonBody): EazoCheckoutLine[] | null {
  const lines = body.lines;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > EAZO_ITEMS_MAX_LINES) {
    return null;
  }
  const parsed: EazoCheckoutLine[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") return null;
    const { id, quantity } = line as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || id.length > ITEM_LINE_ID_MAX_LENGTH) return null;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > EAZO_ITEMS_MAX_QUANTITY) {
      return null;
    }
    parsed.push({ id, quantity: quantity as number });
  }
  return parsed;
}

function parseCheckoutData(body: JsonBody): Record<string, string> | null {
  const data = body.data;
  if (data === undefined) return {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > CHECKOUT_DATA_MAX_KEYS) return null;
  const parsed: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.length > CHECKOUT_DATA_VALUE_MAX_LENGTH) return null;
    parsed[key] = value;
  }
  return parsed;
}

async function checkoutItems(
  request: Request,
  body: JsonBody,
  resolveItems: EazoResolveItems,
  getUser?: (request: Request) => ReturnType<typeof requireAuth>,
) {
  const lines = parseItemLines(body);
  const data = parseCheckoutData(body);
  if (!data) {
    return jsonResponse(
      { error: `Invalid checkout data: send at most ${CHECKOUT_DATA_MAX_KEYS} string values` },
      { status: 400 },
    );
  }
  if (!lines) {
    return jsonResponse(
      { error: `Invalid items: send lines as [{ id, quantity }] with 1-${EAZO_ITEMS_MAX_LINES} entries` },
      { status: 400 },
    );
  }

  const authResult = getUser ? getUser(request) : requireAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const resolved = await resolveItems({ lines, data, user: authResult.user, request });
    if (!resolved) {
      return jsonResponse({ error: "Invalid items" }, { status: 400 });
    }
    try {
      assertEazoCheckoutItems(resolved.items, resolved.currency, { discountAmount: resolved.discountAmount });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Invalid items" }, { status: 400 });
    }
    const origin = getRequestOrigin(request);
    const checkout = await createEazoItemsCheckoutSession({
      appUserId: authResult.user.id,
      currency: resolved.currency,
      items: resolved.items,
      discountAmount: resolved.discountAmount,
      discountLabel: resolved.discountLabel,
      metadata: resolved.metadata,
      successUrl: `${origin}/payment/success`,
      cancelUrl: `${origin}/payment/cancel`,
    });
    return jsonResponse(checkout);
  } catch (error) {
    return platformErrorResponse(error, "Checkout failed");
  }
}

function isItemsPayment(payment: { line_items?: unknown }): payment is EazoItemsPayment {
  return Array.isArray(payment.line_items);
}

async function fulfillItemsStatus(payment: EazoItemsPayment, user: User, fulfill?: EazoItemsFulfill) {
  if (!payment.paid) {
    return jsonResponse({ ...payment, fulfilled: false } as unknown as JsonBody);
  }
  if (!fulfill) {
    // Entitlement lines are granted by Eazo; any other line needs the app's fulfill.
    const fulfilled = (payment.line_items || []).every((line) => Boolean(line.entitlement_key));
    return jsonResponse({ ...payment, fulfilled } as unknown as JsonBody);
  }
  try {
    await fulfill(payment, { user });
  } catch (error) {
    return jsonResponse(
      {
        ...payment,
        error: error instanceof Error ? error.message : "Fulfillment failed",
        fulfilled: false,
      } as unknown as JsonBody,
      { status: 500 },
    );
  }
  return jsonResponse({ ...payment, fulfilled: true } as unknown as JsonBody);
}

export function createEazoPaymentSyncRoute(options: EazoPaymentSyncRouteOptions) {
  return async function POST(request: Request) {
    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    // Only recent payments can still be waiting to be granted; this bounds the
    // replay on every app open. fulfill is idempotent, so replays are safe.
    const updatedAfter = new Date(Date.now() - SYNC_WINDOW_MS);
    let processed = 0;
    let failed = 0;
    try {
      for (let page = 0; page < SYNC_MAX_PAGES; page += 1) {
        const result = await listEazoItemsPayments({
          appUserId: authResult.user.id,
          status: "succeeded",
          updatedAfter,
          limit: SYNC_PAGE_SIZE,
          offset: page * SYNC_PAGE_SIZE,
        });
        for (const payment of result.items) {
          try {
            await options.fulfill(payment, { user: authResult.user });
            processed += 1;
          } catch {
            // One bad payment must not block the rest; the next sync retries it.
            failed += 1;
          }
        }
        if (!result.has_more) break;
      }
    } catch (error) {
      const response = platformErrorResponse(error, "Payment sync failed");
      const body = await response.json();
      return jsonResponse({ ...body, processed, failed }, { status: response.status });
    }
    return jsonResponse({ processed, failed });
  };
}
