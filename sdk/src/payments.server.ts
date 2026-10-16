import {
  assertEazoCheckoutItems,
  assertEazoPaymentCurrency,
  assertEazoPaymentMode,
  assertEazoPaymentProductKey,
  assertEazoPaymentUnitAmount,
  EAZO_DISCOUNT_LABEL_MAX_LENGTH,
  EAZO_PAYMENT_MODE,
  EazoPaymentApiError,
  getEazoPaymentPriceLimits,
  normalizeEazoCheckoutResult,
  type EazoAppSubscription,
  type EazoAppSubscriptionsResponse,
  type CreateEazoItemsCheckoutInput,
  type CreateEazoCheckoutInput,
  type CreateEazoCheckoutResult,
  type EazoItemsCheckoutSessionRequest,
  type EazoItemsPaymentsResponse,
  type EazoCheckoutSessionRequest,
  type EazoCheckoutSessionResponse,
  type EazoEntitlement,
  type EazoPaymentApiErrorBody,
  type EazoPaymentStatus,
  type EazoPaymentStatusValue,
} from "./payments";

export type EazoPaymentEnv = {
  apiBase: string;
  appId: string;
  privateKey: string;
};

function readEnvByNames(names: readonly string[]): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function deriveEazoCreatorApiBase(apiBase: string): string {
  let url: URL;
  try {
    url = new URL(apiBase);
  } catch {
    throw new Error("Invalid EAZO_API_BASE");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid EAZO_API_BASE");
  }

  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  const usesCreatorSubdomain = url.hostname.toLowerCase().startsWith("creator.");
  const alreadyUsesCreatorPath = path === "/creator" || path.endsWith("/creator");

  if (!usesCreatorSubdomain && !alreadyUsesCreatorPath) {
    url.pathname = `${path}/creator`;
  } else {
    url.pathname = path || "/";
  }
  return url.toString().replace(/\/$/, "");
}

export function requireEazoPaymentEnv(): EazoPaymentEnv {
  const platformApiBase = readEnvByNames(["EAZO_API_BASE"]);
  const appId = readEnvByNames(["EAZO_APP_ID"]);
  const privateKey = readEnvByNames(["EAZO_PRIVATE_KEY"]);

  if (!platformApiBase) throw new Error("Missing EAZO_API_BASE");
  if (!appId) throw new Error("Missing EAZO_APP_ID");
  if (!privateKey) throw new Error("Missing EAZO_PRIVATE_KEY");

  return {
    apiBase: deriveEazoCreatorApiBase(platformApiBase),
    appId,
    privateKey,
  };
}

export function createStableCheckoutIdempotencyKey(
  appId: string,
  productKey: string,
  userId?: string,
) {
  const actor = userId || "anonymous";
  return `${appId}:${productKey}:${actor}:${Date.now()}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function buildEazoCheckoutRequest(
  input: CreateEazoCheckoutInput,
): EazoCheckoutSessionRequest {
  const { appId } = requireEazoPaymentEnv();
  const productKey = input.productKey;
  const entitlementKey = input.entitlementKey || productKey;
  const mode = input.mode || EAZO_PAYMENT_MODE.ONE_TIME;

  assertEazoPaymentProductKey(productKey, "product key");
  assertEazoPaymentProductKey(entitlementKey, "entitlement key");
  assertEazoPaymentMode(mode);
  assertEazoPaymentCurrency(input.currency);
  assertEazoPaymentUnitAmount(input.unitAmount, input.currency);
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity <= 0)) {
    throw new Error("quantity must be a positive integer");
  }
  const quantity = input.quantity || 1;
  const maximumUnitAmount = getEazoPaymentPriceLimits(input.currency).maximumUnitAmount;
  if (input.unitAmount * quantity > maximumUnitAmount) {
    throw new Error(
      `checkout total for ${input.currency.toUpperCase()} must not exceed ${maximumUnitAmount} in minor currency units`,
    );
  }
  if (!input.productName || typeof input.productName !== "string") {
    throw new Error("productName is required");
  }

  return {
    app_id: appId,
    ...(input.appUserId ? { app_user_id: input.appUserId } : {}),
    product_key: productKey,
    entitlement_key: entitlementKey,
    mode,
    unit_amount: input.unitAmount,
    currency: input.currency,
    product_name: input.productName,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    quantity,
    metadata: {
      product_key: productKey,
      entitlement_key: entitlementKey,
      mode,
      ...(input.appUserId ? { app_user_id: input.appUserId } : {}),
      ...(input.metadata || {}),
    },
    idempotency_key:
      input.idempotencyKey ||
      createStableCheckoutIdempotencyKey(appId, productKey, input.appUserId || input.metadata?.user_id),
  };
}

export async function createEazoCheckoutSession(
  input: CreateEazoCheckoutInput,
): Promise<CreateEazoCheckoutResult> {
  return postCheckoutSession(buildEazoCheckoutRequest(input));
}

export function buildEazoItemsCheckoutRequest(
  input: CreateEazoItemsCheckoutInput,
): EazoItemsCheckoutSessionRequest {
  const { appId } = requireEazoPaymentEnv();
  if (!input.appUserId || typeof input.appUserId !== "string") {
    throw new Error("appUserId is required for checkout with items");
  }
  const totals = assertEazoCheckoutItems(input.items, input.currency, { discountAmount: input.discountAmount });
  // A label without an amount (e.g. a coupon that did not apply) is ignored.
  const discountLabel = input.discountLabel?.trim();

  return {
    app_id: appId,
    app_user_id: input.appUserId,
    mode: EAZO_PAYMENT_MODE.ONE_TIME,
    currency: input.currency,
    items: input.items.map((item) => ({
      name: item.name.trim(),
      unit_amount: item.unitAmount,
      quantity: item.quantity ?? 1,
      metadata: item.metadata || {},
      ...(item.entitlementKey ? { entitlement_key: item.entitlementKey } : {}),
    })),
    ...(totals.discountAmount > 0
      ? {
        discount_amount: totals.discountAmount,
        ...(discountLabel ? { discount_label: discountLabel.slice(0, EAZO_DISCOUNT_LABEL_MAX_LENGTH) } : {}),
      }
      : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata || {},
    idempotency_key:
      input.idempotencyKey ||
      createStableCheckoutIdempotencyKey(appId, "items", input.appUserId),
  };
}

async function postCheckoutSession(
  requestBody: EazoCheckoutSessionRequest | EazoItemsCheckoutSessionRequest,
): Promise<CreateEazoCheckoutResult> {
  const { apiBase, privateKey } = requireEazoPaymentEnv();
  const response = await fetch(`${apiBase}/api/open/payments/checkout-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${privateKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await readJson(response)) as EazoCheckoutSessionResponse & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Checkout failed");
  }

  const checkout = normalizeEazoCheckoutResult(data);
  if (!checkout) {
    throw new EazoPaymentApiError(response.status, data, "Checkout response missing checkoutUrl or paymentId");
  }

  return checkout;
}

export async function createEazoItemsCheckoutSession(
  input: CreateEazoItemsCheckoutInput,
): Promise<CreateEazoCheckoutResult> {
  return postCheckoutSession(buildEazoItemsCheckoutRequest(input));
}

export async function listEazoItemsPayments(options: {
  appUserId?: string;
  status?: EazoPaymentStatusValue;
  updatedAfter?: Date | string;
  limit?: number;
  offset?: number;
} = {}): Promise<EazoItemsPaymentsResponse> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const query = new URLSearchParams({
    app_id: appId,
    mode: EAZO_PAYMENT_MODE.ONE_TIME,
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });
  if (options.appUserId) query.set("app_user_id", options.appUserId);
  if (options.status) query.set("status", options.status);
  if (options.updatedAfter) {
    const updatedAfter = options.updatedAfter instanceof Date
      ? options.updatedAfter.toISOString()
      : options.updatedAfter;
    query.set("updated_after", updatedAfter);
  }

  const response = await fetch(`${apiBase}/api/open/payments?${query.toString()}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
    cache: "no-store",
  });

  const data = (await readJson(response)) as EazoItemsPaymentsResponse & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Payment list failed");
  }
  // Single-product one-time payments share the mode; keep those with line items.
  return { ...data, items: data.items.filter((payment) => Array.isArray(payment.line_items)) };
}

export async function getEazoPaymentStatus(
  paymentId: string,
  options: { appUserId?: string } = {},
): Promise<EazoPaymentStatus> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const query = new URLSearchParams({ app_id: appId });
  if (options.appUserId) query.set("app_user_id", options.appUserId);
  const response = await fetch(
    `${apiBase}/api/open/payments/${encodeURIComponent(paymentId)}/status?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${privateKey}` },
      cache: "no-store",
    },
  );

  const data = (await readJson(response)) as EazoPaymentStatus & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Payment status failed");
  }
  return data;
}

export async function getEazoEntitlementStatus(
  productKey: string,
  options: { appUserId?: string } = {},
): Promise<EazoEntitlement> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const query = new URLSearchParams({
    app_id: appId,
    product_key: productKey,
  });
  if (options.appUserId) query.set("app_user_id", options.appUserId);

  const response = await fetch(`${apiBase}/api/open/payments/entitlements?${query.toString()}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
    cache: "no-store",
  });

  const data = (await readJson(response)) as EazoEntitlement & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Payment entitlement failed");
  }
  return data;
}

export async function listEazoSubscriptions(
  options: { appUserId: string; limit?: number; offset?: number },
): Promise<EazoAppSubscriptionsResponse> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const query = new URLSearchParams({
    app_id: appId,
    app_user_id: options.appUserId,
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });

  const response = await fetch(`${apiBase}/api/open/payments/subscriptions?${query.toString()}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
    cache: "no-store",
  });

  const data = (await readJson(response)) as EazoAppSubscriptionsResponse & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Subscription list failed");
  }
  return data;
}

async function updateEazoSubscription(
  subscriptionId: string,
  action: "cancel" | "resume",
  options: { appUserId: string },
): Promise<{ subscription: EazoAppSubscription }> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const response = await fetch(
    `${apiBase}/api/open/payments/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${privateKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        app_user_id: options.appUserId,
      }),
    },
  );

  const data = (await readJson(response)) as { subscription: EazoAppSubscription } & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(
      response.status,
      data,
      action === "cancel" ? "Subscription cancel failed" : "Subscription resume failed",
    );
  }
  return data;
}

export function cancelEazoSubscription(
  subscriptionId: string,
  options: { appUserId: string },
) {
  return updateEazoSubscription(subscriptionId, "cancel", options);
}

export function resumeEazoSubscription(
  subscriptionId: string,
  options: { appUserId: string },
) {
  return updateEazoSubscription(subscriptionId, "resume", options);
}

export type {
  CreateEazoItemsCheckoutInput,
  CreateEazoCheckoutInput,
  EazoItemsCheckoutSessionRequest,
  EazoCheckoutItem,
  EazoPaymentLineItem,
  EazoItemsPayment,
  EazoItemsPaymentsResponse,
  EazoItemsTotals,
  CreateEazoCheckoutResult,
  EazoCheckoutSessionRequest,
  EazoCheckoutSessionResponse,
  EazoEntitlement,
  EazoEntitlementStatusValue,
  EazoAppSubscription,
  EazoAppSubscriptionStatus,
  EazoAppSubscriptionsResponse,
  EazoPaymentMode,
  EazoPaymentApiErrorBody,
  EazoPaymentCurrency,
  EazoPaymentMetadata,
  EazoPaymentProduct,
  EazoPaymentStatus,
  EazoPaymentStatusValue,
} from "./payments";
export { EazoPaymentApiError, getEazoPaymentErrorMessage } from "./payments";
