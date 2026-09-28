import type {
  CreateEazoCheckoutResult,
  EazoAppSubscription,
  EazoAppSubscriptionsResponse,
  EazoCheckoutSessionRequest,
  EazoCheckoutSessionResponse,
  EazoEntitlement,
  EazoEntitlementStatusValue,
  EazoPaymentCurrency,
  EazoPaymentStatus,
  EazoPaymentStatusValue,
} from "./payments";
import {
  assertEazoPaymentUnitAmount,
  EAZO_PAYMENT_CURRENCY,
  getEazoPaymentPriceLimits,
} from "./payments";

export function mockEazoCheckoutResponse(
  overrides: Partial<EazoCheckoutSessionResponse> = {},
): EazoCheckoutSessionResponse {
  return {
    checkout_session_id: "cs_test_eazo",
    checkout_url: "https://checkout.stripe.com/c/pay/cs_test_eazo",
    payment_id: "cap_test_eazo",
    ...overrides,
  };
}

export function mockEazoPaymentStatus(
  status: EazoPaymentStatusValue,
  paid = status === "succeeded",
): EazoPaymentStatus {
  return {
    payment_id: "cap_test_eazo",
    app_id: "app_test",
    status,
    paid,
    amount_total: 499,
    currency: "usd",
    product_name: "Premium unlock",
    metadata: { product_key: "premium" },
  };
}

export function mockEazoEntitlement(
  status: EazoEntitlementStatusValue,
  overrides: Partial<EazoEntitlement> = {},
): EazoEntitlement {
  return {
    app_id: "app_test",
    app_user_id: "app_user_test",
    product_key: "premium",
    entitlement_key: "premium",
    status,
    active: status === "active",
    payment_id: status === "active" ? "cap_test_eazo" : null,
    source_payment_id: status === "active" ? "cap_test_eazo" : null,
    current_period_end: null,
    metadata: {},
    updated_at: 1_800_000_000_000,
    ...overrides,
  };
}

export function mockEazoSubscription(
  overrides: Partial<EazoAppSubscription> = {},
): EazoAppSubscription {
  return {
    id: "cas_test_eazo",
    app_id: "app_test",
    app_user_id: "app_user_test",
    product_key: "premium",
    entitlement_key: "premium",
    product_name: "Premium monthly subscription",
    app_title: "Test app",
    amount_total: 499,
    currency: "usd",
    status: "active",
    cancel_at_period_end: false,
    current_period_start: 1_800_000_000,
    current_period_end: 1_802_592_000,
    canceled_at: null,
    latest_payment_id: "cap_test_eazo",
    ...overrides,
  };
}

export function mockEazoSubscriptionsResponse(
  overrides: Partial<EazoAppSubscriptionsResponse> = {},
): EazoAppSubscriptionsResponse {
  const items = overrides.items || [mockEazoSubscription()];
  return {
    items,
    pagination: { total: items.length, limit: 50, offset: 0 },
    ...overrides,
  };
}

export function mockFetchJson(status: number, body: unknown) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], name: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} keys mismatch. Expected ${expected.join(", ")}, received ${actual.join(", ")}`);
  }
}

function assertString(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertCurrency(value: unknown, name: string): asserts value is EazoPaymentCurrency {
  if (!Object.values(EAZO_PAYMENT_CURRENCY).includes(value as EazoPaymentCurrency)) {
    throw new Error(`${name} must be a supported Eazo payment currency`);
  }
}

function assertNumber(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function assertBoolean(value: unknown, name: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
}

function assertNullableString(value: unknown, name: string) {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new Error(`${name} must be a string, null, or undefined`);
  }
}

function assertNullableNumber(value: unknown, name: string) {
  if (value !== null && value !== undefined && typeof value !== "number") {
    throw new Error(`${name} must be a number, null, or undefined`);
  }
}

function assertMetadata(value: unknown, name: string) {
  assertRecord(value, name);
  for (const [key, metadataValue] of Object.entries(value)) {
    if (typeof metadataValue !== "string") {
      throw new Error(`${name}.${key} must be a string`);
    }
  }
}

function assertLedgerMetadata(value: unknown, name: string) {
  assertRecord(value, name);
}

export function assertEazoCheckoutRequestContract(request: EazoCheckoutSessionRequest) {
  const body = request as unknown as Record<string, unknown>;
  const serialized = JSON.stringify(body);
  if (Array.isArray(body.items)) {
    const expectedKeys = [
      "app_id",
      ...(body.app_user_id === undefined ? [] : ["app_user_id"]),
      "mode",
      "currency",
      "success_url",
      "cancel_url",
      "items",
      ...(body.promotion_code === undefined ? [] : ["promotion_code"]),
      ...(body.allow_promotion_codes === undefined ? [] : ["allow_promotion_codes"]),
      ...(body.auto_apply_claimed_coupon === undefined ? [] : ["auto_apply_claimed_coupon"]),
      "metadata",
      "idempotency_key",
    ];
    assertExactKeys(body, expectedKeys, "Eazo cart checkout request");
    assertString(body.app_id, "app_id");
    if (body.app_user_id !== undefined) assertString(body.app_user_id, "app_user_id");
    if (body.mode !== "one_time") {
      throw new Error("Eazo cart checkout supports one_time mode only");
    }
    assertCurrency(body.currency, "currency");
    if (body.items.length === 0 || body.items.length > 100) {
      throw new Error("Eazo cart checkout must include 1-100 items");
    }
    let amountSubtotal = 0;
    for (const [index, rawItem] of body.items.entries()) {
      assertRecord(rawItem, `items[${index}]`);
      assertExactKeys(
        rawItem,
        ["product_key", "entitlement_key", "product_name", "unit_amount", "quantity"],
        `items[${index}]`,
      );
      assertString(rawItem.product_key, `items[${index}].product_key`);
      assertString(rawItem.entitlement_key, `items[${index}].entitlement_key`);
      assertString(rawItem.product_name, `items[${index}].product_name`);
      assertNumber(rawItem.unit_amount, `items[${index}].unit_amount`);
      assertNumber(rawItem.quantity, `items[${index}].quantity`);
      assertEazoPaymentUnitAmount(
        rawItem.unit_amount,
        body.currency,
        `items[${index}].unit_amount`,
      );
      amountSubtotal += (rawItem.unit_amount as number) * (rawItem.quantity as number);
    }
    const maximumUnitAmount = getEazoPaymentPriceLimits(body.currency).maximumUnitAmount;
    if (amountSubtotal > maximumUnitAmount) {
      throw new Error(
        `checkout total for ${body.currency.toUpperCase()} must not exceed ${maximumUnitAmount} in minor currency units`,
      );
    }
    if (body.promotion_code !== undefined) assertString(body.promotion_code, "promotion_code");
    if (body.allow_promotion_codes !== undefined) {
      assertBoolean(body.allow_promotion_codes, "allow_promotion_codes");
    }
    if (body.auto_apply_claimed_coupon !== undefined) {
      assertBoolean(body.auto_apply_claimed_coupon, "auto_apply_claimed_coupon");
    }
    if (body.promotion_code !== undefined && body.allow_promotion_codes === true) {
      throw new Error("promotion_code and allow_promotion_codes are mutually exclusive");
    }
    assertString(body.success_url, "success_url");
    assertString(body.cancel_url, "cancel_url");
    assertMetadata(body.metadata, "metadata");
    assertString(body.idempotency_key, "idempotency_key");
    return;
  }
  const expectedKeys = [
    "app_id",
    ...(body.app_user_id === undefined ? [] : ["app_user_id"]),
    "product_key",
    "entitlement_key",
    "mode",
    "unit_amount",
    "currency",
    "product_name",
    "success_url",
    "cancel_url",
    "quantity",
    "metadata",
    "idempotency_key",
  ];

  assertExactKeys(body, expectedKeys, "Eazo checkout request");

  if (body.unit_amount === undefined) {
    throw new Error("Eazo checkout request must include unit_amount");
  }
  if (body.product_name === undefined) {
    throw new Error("Eazo checkout request must include product_name");
  }
  if (body.product_key === undefined) {
    throw new Error("Eazo checkout request must include product_key");
  }
  if (body.entitlement_key === undefined) {
    throw new Error("Eazo checkout request must include entitlement_key");
  }
  if (body.mode !== "one_time" && body.mode !== "subscription") {
    throw new Error("Eazo checkout request must include a supported mode");
  }
  assertString(body.app_id, "app_id");
  if (body.app_user_id !== undefined) assertString(body.app_user_id, "app_user_id");
  assertString(body.product_key, "product_key");
  assertString(body.entitlement_key, "entitlement_key");
  assertNumber(body.unit_amount, "unit_amount");
  assertCurrency(body.currency, "currency");
  assertEazoPaymentUnitAmount(body.unit_amount, body.currency, "unit_amount");
  assertString(body.product_name, "product_name");
  assertString(body.success_url, "success_url");
  assertString(body.cancel_url, "cancel_url");
  assertNumber(body.quantity, "quantity");
  const maximumUnitAmount = getEazoPaymentPriceLimits(body.currency).maximumUnitAmount;
  if ((body.unit_amount as number) * (body.quantity as number) > maximumUnitAmount) {
    throw new Error(
      `checkout total for ${body.currency.toUpperCase()} must not exceed ${maximumUnitAmount} in minor currency units`,
    );
  }
  assertMetadata(body.metadata, "metadata");
  assertString(body.idempotency_key, "idempotency_key");
  for (const forbidden of ["amount", "title", "product_id", "checkout_url", "order_id", "interval"]) {
    if (Object.prototype.hasOwnProperty.call(body, forbidden)) {
      throw new Error(`Eazo checkout request must not include ${forbidden}`);
    }
  }
  if (serialized.includes("STRIPE_SECRET_KEY")) {
    throw new Error("Generated apps must not include Stripe secrets");
  }
}

export function assertEazoCheckoutResponseContract(response: EazoCheckoutSessionResponse) {
  const body = response as unknown as Record<string, unknown>;
  assertExactKeys(body, ["checkout_session_id", "checkout_url", "payment_id"], "Eazo checkout response");
  assertString(body.checkout_session_id, "checkout_session_id");
  assertString(body.checkout_url, "checkout_url");
  assertString(body.payment_id, "payment_id");
}

export function assertCreateEazoCheckoutResultContract(result: CreateEazoCheckoutResult) {
  const body = result as unknown as Record<string, unknown>;
  assertExactKeys(body, ["checkoutSessionId", "checkoutUrl", "paymentId"], "Eazo checkout result");
  assertString(body.checkoutSessionId, "checkoutSessionId");
  assertString(body.checkoutUrl, "checkoutUrl");
  assertString(body.paymentId, "paymentId");
}

export function assertEazoPaymentStatusContract(status: EazoPaymentStatus) {
  const body = status as unknown as Record<string, unknown>;
  assertExactKeys(
    body,
    [
      "payment_id",
      "app_id",
      "status",
      "paid",
      ...(body.amount_subtotal === undefined ? [] : ["amount_subtotal"]),
      ...(body.amount_discount === undefined ? [] : ["amount_discount"]),
      "amount_total",
      "currency",
      "product_name",
      "metadata",
      ...(body.entitlement === undefined ? [] : ["entitlement"]),
      ...(body.entitlements === undefined ? [] : ["entitlements"]),
      ...(body.items === undefined ? [] : ["items"]),
      ...(body.coupon === undefined ? [] : ["coupon"]),
    ],
    "Eazo payment status",
  );
  assertString(body.payment_id, "payment_id");
  assertString(body.app_id, "app_id");
  if (!["pending", "processing", "succeeded", "failed", "expired", "refunded", "disputed"].includes(String(body.status))) {
    throw new Error("status must be a supported payment status");
  }
  assertBoolean(body.paid, "paid");
  if (body.amount_subtotal !== undefined) assertNumber(body.amount_subtotal, "amount_subtotal");
  if (body.amount_discount !== undefined) assertNumber(body.amount_discount, "amount_discount");
  assertNumber(body.amount_total, "amount_total");
  assertCurrency(body.currency, "currency");
  assertString(body.product_name, "product_name");
  assertLedgerMetadata(body.metadata, "metadata");
  if (body.entitlement !== undefined && body.entitlement !== null) {
    assertEazoEntitlementContract(body.entitlement as EazoEntitlement);
  }
  if (body.entitlements !== undefined) {
    if (!Array.isArray(body.entitlements)) throw new Error("entitlements must be an array");
    for (const entitlement of body.entitlements) {
      assertEazoEntitlementContract(entitlement as EazoEntitlement);
    }
  }
  if (body.items !== undefined && !Array.isArray(body.items)) {
    throw new Error("items must be an array");
  }
  if (body.coupon !== undefined && body.coupon !== null) {
    assertRecord(body.coupon, "coupon");
    assertNumber(body.coupon.amount_discount, "coupon.amount_discount");
    assertString(body.coupon.status, "coupon.status");
  }
}

export function assertEazoEntitlementContract(entitlement: EazoEntitlement) {
  const body = entitlement as unknown as Record<string, unknown>;
  assertExactKeys(
    body,
    [
      "app_id",
      ...(body.app_user_id === undefined ? [] : ["app_user_id"]),
      "product_key",
      "entitlement_key",
      "status",
      "active",
      ...(body.payment_id === undefined ? [] : ["payment_id"]),
      ...(body.source_payment_id === undefined ? [] : ["source_payment_id"]),
      ...(body.current_period_end === undefined ? [] : ["current_period_end"]),
      ...(body.metadata === undefined ? [] : ["metadata"]),
      ...(body.updated_at === undefined ? [] : ["updated_at"]),
    ],
    "Eazo entitlement",
  );
  assertString(body.app_id, "app_id");
  if (body.app_user_id !== undefined) assertString(body.app_user_id, "app_user_id");
  assertString(body.product_key, "product_key");
  assertString(body.entitlement_key, "entitlement_key");
  if (!["inactive", "checking", "pending", "active", "canceling", "past_due", "canceled", "failed", "expired", "refunded", "disputed"].includes(String(body.status))) {
    throw new Error("status must be a supported entitlement status");
  }
  assertBoolean(body.active, "active");
  assertNullableString(body.payment_id, "payment_id");
  assertNullableString(body.source_payment_id, "source_payment_id");
  assertNullableNumber(body.current_period_end, "current_period_end");
  if (body.metadata !== undefined) assertLedgerMetadata(body.metadata, "metadata");
  assertNullableNumber(body.updated_at, "updated_at");
}

export function assertEazoSubscriptionContract(subscription: EazoAppSubscription) {
  const body = subscription as unknown as Record<string, unknown>;
  assertExactKeys(
    body,
    [
      "id",
      "app_id",
      "app_user_id",
      "product_key",
      "entitlement_key",
      ...(body.product_name === undefined ? [] : ["product_name"]),
      ...(body.app_title === undefined ? [] : ["app_title"]),
      "amount_total",
      "currency",
      "status",
      "cancel_at_period_end",
      ...(body.current_period_start === undefined ? [] : ["current_period_start"]),
      ...(body.current_period_end === undefined ? [] : ["current_period_end"]),
      ...(body.canceled_at === undefined ? [] : ["canceled_at"]),
      ...(body.latest_payment_id === undefined ? [] : ["latest_payment_id"]),
    ],
    "Eazo subscription",
  );
  assertString(body.id, "id");
  assertString(body.app_id, "app_id");
  assertString(body.app_user_id, "app_user_id");
  assertString(body.product_key, "product_key");
  assertString(body.entitlement_key, "entitlement_key");
  assertNumber(body.amount_total, "amount_total");
  assertCurrency(body.currency, "currency");
  if (!["incomplete", "trialing", "active", "canceling", "past_due", "canceled", "unpaid", "paused", "incomplete_expired"].includes(String(body.status))) {
    throw new Error("status must be a supported subscription status");
  }
  assertBoolean(body.cancel_at_period_end, "cancel_at_period_end");
}

export function assertEazoSubscriptionsResponseContract(response: EazoAppSubscriptionsResponse) {
  assertRecord(response, "Eazo subscriptions response");
  if (!Array.isArray(response.items)) throw new Error("items must be an array");
  for (const subscription of response.items) assertEazoSubscriptionContract(subscription);
  assertRecord(response.pagination, "pagination");
  assertNumber(response.pagination.total, "pagination.total");
  assertNumber(response.pagination.limit, "pagination.limit");
  assertNumber(response.pagination.offset, "pagination.offset");
}

export function assertLocalCheckoutBodyContract(body: unknown) {
  assertRecord(body, "local checkout body");
  assertExactKeys(body, ["productKey"], "local checkout body");
  assertString(body.productKey, "productKey");
}

const LEGACY_PAYMENT_FLOW_PATTERNS: Array<[RegExp, string]> = [
  [/\bdata\.url\b/, "read checkoutUrl from SDK results instead of data.url"],
  [/\bsessionId\b/, "use paymentId, not sessionId"],
  [/\bsession_id\b/, "use paymentId, not session_id"],
  [/\/api\/payments\/entitlements\?key=/, "use /api/payments/entitlements?productKey="],
  [/\bwindow\.open\b/, "use SDK same-window checkout navigation"],
  [/\/api\/open\/payments\//, "generated app UI/routes must not call platform payment APIs directly"],
  [/\bstartEazoCheckout\b/, "use PaymentUnlockPanel or EazoPaymentLifecycle instead of calling startEazoCheckout directly"],
  [/\/api\/payments\/checkout\b/, "app UI must not fetch the local checkout route directly"],
  [/\/api\/payments\/status\?/, "app UI must not fetch the local status route directly"],
  [/\/api\/payments\/entitlements\?/, "app UI must not fetch the local entitlement route directly"],
  [/\bSTRIPE_SECRET_KEY\b/, "generated apps must not request Stripe secrets"],
  [/\bSTRIPE_WEBHOOK_SECRET\b/, "generated apps must not include Stripe webhook secrets"],
  [/\bNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\b/, "generated apps must not include Stripe publishable keys"],
  [/\bstripe\.webhooks\b/, "generated apps must not implement Stripe webhooks"],
  [/\bcheckout\.sessions\b/, "generated apps must not call Stripe Checkout Sessions directly"],
];

export function assertNoLegacyPaymentFlowSource(source: string, filePath = "source") {
  for (const [pattern, message] of LEGACY_PAYMENT_FLOW_PATTERNS) {
    if (pattern.test(source)) {
      throw new Error(`${filePath}: legacy Eazo payment flow detected: ${message}`);
    }
  }
}
