import {
  EazoPaymentApiError,
  type EazoPaymentProduct,
} from "./payments";
import {
  cancelEazoSubscription,
  createEazoCartCheckoutSession,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
  listEazoSubscriptions,
  resumeEazoSubscription,
} from "./payments.server";
import { requireAuth } from "./server";

type JsonBody = Record<string, unknown>;

export type EazoCheckoutRouteOptions = {
  getProduct: (productKey: string) => EazoPaymentProduct | null | undefined;
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

function firstBodyBoolean(body: JsonBody, names: readonly string[]) {
  for (const name of names) {
    const value = body[name];
    if (typeof value === "boolean") return value;
  }
  return false;
}

function readCartItems(body: JsonBody) {
  if (!Array.isArray(body.items)) return [];
  return body.items.map((value) => {
    const item = value && typeof value === "object" ? value as JsonBody : {};
    const productKey = firstBodyString(item, ["productKey", "product_key", "key"]);
    const quantity = item.quantity === undefined ? 1 : item.quantity;
    return { productKey, quantity };
  });
}

export function createEazoCheckoutRoute(options: EazoCheckoutRouteOptions) {
  return async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    const bodyRecord = body && typeof body === "object" ? body as JsonBody : {};
    const hasCartItems = Array.isArray(bodyRecord.items);
    const requestedItems = readCartItems(bodyRecord);
    const productKey = firstBodyString(bodyRecord, ["productKey", "product_key", "key"]) || "premium";

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const origin = getRequestOrigin(request);
      if (hasCartItems && requestedItems.length === 0) {
        return jsonResponse({ error: "Cart must contain at least one product" }, { status: 400 });
      }
      if (requestedItems.length > 0) {
        if (requestedItems.length > 100) {
          return jsonResponse({ error: "Cart supports at most 100 products" }, { status: 400 });
        }
        if (requestedItems.some((item) => !item.productKey)) {
          return jsonResponse({ error: "Every cart item requires productKey" }, { status: 400 });
        }
        if (requestedItems.some((item) => !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 999)) {
          return jsonResponse({ error: "Every cart quantity must be an integer between 1 and 999" }, { status: 400 });
        }
        const requestedProductKeys = requestedItems.map((item) => item.productKey || "");
        if (new Set(requestedProductKeys).size !== requestedProductKeys.length) {
          return jsonResponse({ error: "Cart product keys must be unique" }, { status: 400 });
        }
        const products = requestedItems.map((item) => options.getProduct(item.productKey || ""));
        if (products.some((product) => !product)) {
          return jsonResponse({ error: "Unknown product" }, { status: 400 });
        }
        const resolvedProducts = products as EazoPaymentProduct[];
        if (resolvedProducts.some((product) => (product.mode || "one_time") !== "one_time")) {
          return jsonResponse(
            { error: "Cart checkout supports one-time products only" },
            { status: 400 },
          );
        }
        const currencies = new Set(resolvedProducts.map((product) => product.currency));
        if (currencies.size !== 1) {
          return jsonResponse(
            { error: "All cart products must use the same currency" },
            { status: 400 },
          );
        }
        const promotionCode = firstBodyString(
          bodyRecord,
          ["promotionCode", "promotion_code"],
        );
        const allowPromotionCodes = firstBodyBoolean(
          bodyRecord,
          ["allowPromotionCodes", "allow_promotion_codes"],
        );
        if (promotionCode && allowPromotionCodes) {
          return jsonResponse(
            { error: "promotionCode and allowPromotionCodes are mutually exclusive" },
            { status: 400 },
          );
        }
        const checkout = await createEazoCartCheckoutSession({
          items: resolvedProducts.map((product, index) => ({
            productKey: product.key,
            productName: product.name,
            unitAmount: product.unitAmount,
            entitlementKey: product.entitlementKey || product.key,
            quantity: Number(requestedItems[index]?.quantity || 1),
          })),
          currency: resolvedProducts[0].currency,
          appUserId: authResult.user.id,
          successUrl: `${origin}/payment/success`,
          cancelUrl: `${origin}/payment/cancel`,
          ...(promotionCode ? { promotionCode } : {}),
          ...(allowPromotionCodes ? { allowPromotionCodes: true } : {}),
          metadata: { mode: "one_time" },
        });
        return jsonResponse(checkout);
      }

      const product = options.getProduct(productKey);
      if (!product) {
        return jsonResponse({ error: "Unknown product" }, { status: 400 });
      }
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
