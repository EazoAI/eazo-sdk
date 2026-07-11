import { auth } from "./internal/capabilities/auth";

export const EAZO_PAYMENT_CURRENCY = {
  AED: "aed",
  AFN: "afn",
  ALL: "all",
  AMD: "amd",
  ANG: "ang",
  AOA: "aoa",
  ARS: "ars",
  AUD: "aud",
  AWG: "awg",
  AZN: "azn",
  BAM: "bam",
  BBD: "bbd",
  BDT: "bdt",
  BGN: "bgn",
  BHD: "bhd",
  BIF: "bif",
  BMD: "bmd",
  BND: "bnd",
  BOB: "bob",
  BRL: "brl",
  BSD: "bsd",
  BWP: "bwp",
  BYN: "byn",
  BZD: "bzd",
  CAD: "cad",
  CDF: "cdf",
  CHF: "chf",
  CLP: "clp",
  CNY: "cny",
  COP: "cop",
  CRC: "crc",
  CVE: "cve",
  CZK: "czk",
  DJF: "djf",
  DKK: "dkk",
  DOP: "dop",
  DZD: "dzd",
  EGP: "egp",
  ETB: "etb",
  EUR: "eur",
  FJD: "fjd",
  FKP: "fkp",
  GBP: "gbp",
  GEL: "gel",
  GIP: "gip",
  GMD: "gmd",
  GNF: "gnf",
  GTQ: "gtq",
  GYD: "gyd",
  HKD: "hkd",
  HNL: "hnl",
  HTG: "htg",
  HUF: "huf",
  IDR: "idr",
  ILS: "ils",
  INR: "inr",
  ISK: "isk",
  JMD: "jmd",
  JOD: "jod",
  JPY: "jpy",
  KES: "kes",
  KGS: "kgs",
  KHR: "khr",
  KMF: "kmf",
  KRW: "krw",
  KWD: "kwd",
  KYD: "kyd",
  KZT: "kzt",
  LAK: "lak",
  LBP: "lbp",
  LKR: "lkr",
  LRD: "lrd",
  LSL: "lsl",
  MAD: "mad",
  MDL: "mdl",
  MGA: "mga",
  MKD: "mkd",
  MMK: "mmk",
  MNT: "mnt",
  MOP: "mop",
  MUR: "mur",
  MVR: "mvr",
  MWK: "mwk",
  MXN: "mxn",
  MYR: "myr",
  MZN: "mzn",
  NAD: "nad",
  NGN: "ngn",
  NIO: "nio",
  NOK: "nok",
  NPR: "npr",
  NZD: "nzd",
  PAB: "pab",
  PEN: "pen",
  PGK: "pgk",
  PHP: "php",
  PKR: "pkr",
  PLN: "pln",
  PYG: "pyg",
  QAR: "qar",
  RON: "ron",
  RSD: "rsd",
  RWF: "rwf",
  SAR: "sar",
  SBD: "sbd",
  SCR: "scr",
  SEK: "sek",
  SGD: "sgd",
  SHP: "shp",
  SLE: "sle",
  SOS: "sos",
  SRD: "srd",
  STN: "stn",
  SZL: "szl",
  THB: "thb",
  TJS: "tjs",
  TOP: "top",
  TRY: "try",
  TTD: "ttd",
  TWD: "twd",
  TZS: "tzs",
  UAH: "uah",
  UGX: "ugx",
  USD: "usd",
  UYU: "uyu",
  UZS: "uzs",
  VND: "vnd",
  VUV: "vuv",
  WST: "wst",
  XAF: "xaf",
  XCD: "xcd",
  XOF: "xof",
  XPF: "xpf",
  YER: "yer",
  ZAR: "zar",
  ZMW: "zmw",
} as const;

export type EazoPaymentCurrency =
  (typeof EAZO_PAYMENT_CURRENCY)[keyof typeof EAZO_PAYMENT_CURRENCY];

export const EAZO_PAYMENT_MODE = {
  ONE_TIME: "one_time",
  SUBSCRIPTION: "subscription",
} as const;

export type EazoPaymentMode =
  (typeof EAZO_PAYMENT_MODE)[keyof typeof EAZO_PAYMENT_MODE];

export type EazoPaymentStatusValue =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded"
  | "disputed";

export type EazoEntitlementStatusValue =
  | "inactive"
  | "checking"
  | "pending"
  | "active"
  | "canceling"
  | "past_due"
  | "canceled"
  | "failed"
  | "expired"
  | "refunded"
  | "disputed";

export type EazoPaymentMetadata = Record<string, string>;

export type EazoPaymentProduct = {
  key: string;
  name: string;
  unitAmount: number;
  currency: EazoPaymentCurrency;
  mode?: EazoPaymentMode;
  entitlementKey?: string;
};

export type EazoPaymentProductInput = Omit<EazoPaymentProduct, "entitlementKey"> & {
  entitlementKey?: string;
};

export type EazoPaymentProducts<T extends Record<string, EazoPaymentProductInput>> = {
  readonly [K in keyof T]: Omit<T[K], "entitlementKey"> & {
    readonly entitlementKey: string;
  };
};

export type CreateEazoCheckoutInput = {
  productKey: string;
  productName: string;
  unitAmount: number;
  currency: EazoPaymentCurrency;
  successUrl: string;
  cancelUrl: string;
  mode?: EazoPaymentMode;
  entitlementKey?: string;
  appUserId?: string;
  quantity?: number;
  metadata?: EazoPaymentMetadata;
  idempotencyKey?: string;
};

export type EazoCheckoutSessionRequest = {
  app_id: string;
  app_user_id?: string;
  product_key: string;
  entitlement_key: string;
  mode: EazoPaymentMode;
  unit_amount: number;
  currency: EazoPaymentCurrency;
  product_name: string;
  success_url: string;
  cancel_url: string;
  quantity: number;
  metadata: EazoPaymentMetadata;
  idempotency_key: string;
};

export type EazoCheckoutSessionResponse = {
  checkout_session_id: string;
  checkout_url: string;
  payment_id: string;
};

export type EazoCheckoutSessionResponseLike = Partial<EazoCheckoutSessionResponse> & {
  checkoutSessionId?: unknown;
  checkoutUrl?: unknown;
  paymentId?: unknown;
};

export type CreateEazoCheckoutResult = {
  checkoutSessionId: string;
  checkoutUrl: string;
  paymentId: string;
};

export type EazoEntitlement = {
  app_id: string;
  app_user_id?: string;
  product_key: string;
  entitlement_key: string;
  status: EazoEntitlementStatusValue;
  active: boolean;
  payment_id?: string | null;
  source_payment_id?: string | null;
  current_period_end?: number | null;
  metadata?: EazoPaymentMetadata;
  updated_at?: number | null;
};

export type EazoPaymentStatus = {
  payment_id: string;
  app_id: string;
  status: EazoPaymentStatusValue;
  paid: boolean;
  amount_total: number;
  currency: EazoPaymentCurrency;
  product_name: string;
  metadata: EazoPaymentMetadata;
  entitlement?: EazoEntitlement | null;
};

export type EazoAppSubscriptionStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "canceling"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | "incomplete_expired";

export type EazoAppSubscription = {
  id: string;
  app_id: string;
  app_user_id: string;
  product_key: string;
  entitlement_key: string;
  product_name?: string | null;
  app_title?: string | null;
  amount_total: number;
  currency: EazoPaymentCurrency;
  status: EazoAppSubscriptionStatus;
  cancel_at_period_end: boolean;
  current_period_start?: number | null;
  current_period_end?: number | null;
  canceled_at?: number | null;
  latest_payment_id?: string | null;
};

export type EazoAppSubscriptionsResponse = {
  items: EazoAppSubscription[];
  pagination: { total: number; limit: number; offset: number };
};

export type EazoPaymentApiErrorBody = {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
};

const PRODUCT_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

export function assertEazoPaymentMode(value: unknown): asserts value is EazoPaymentMode {
  if (!Object.values(EAZO_PAYMENT_MODE).includes(value as EazoPaymentMode)) {
    throw new Error(`Invalid Eazo payment mode: ${String(value)}`);
  }
}

export function assertEazoPaymentCurrency(value: unknown): asserts value is EazoPaymentCurrency {
  if (!Object.values(EAZO_PAYMENT_CURRENCY).includes(value as EazoPaymentCurrency)) {
    throw new Error(`Invalid Eazo payment currency: ${String(value)}`);
  }
}

export function assertEazoPaymentProductKey(value: unknown, field = "product key"): asserts value is string {
  if (typeof value !== "string" || !PRODUCT_KEY_PATTERN.test(value)) {
    throw new Error(
      `Invalid Eazo payment ${field}: use 2-64 chars, lowercase letters, numbers, "_" or "-", starting with a letter`,
    );
  }
}

function normalizeEazoPaymentProduct(key: string, product: EazoPaymentProductInput): EazoPaymentProduct {
  if (product.key !== key) {
    throw new Error(`Eazo payment product key mismatch: object key "${key}" must equal product.key "${product.key}"`);
  }
  assertEazoPaymentProductKey(product.key, "product key");
  assertEazoPaymentProductKey(product.entitlementKey || product.key, "entitlement key");
  assertEazoPaymentCurrency(product.currency);
  assertEazoPaymentMode(product.mode || EAZO_PAYMENT_MODE.ONE_TIME);
  if (!Number.isInteger(product.unitAmount) || product.unitAmount <= 0) {
    throw new Error(`Invalid Eazo payment unitAmount for ${product.key}: use a positive integer in minor currency units`);
  }
  if (typeof product.name !== "string" || product.name.trim().length === 0) {
    throw new Error(`Invalid Eazo payment product name for ${product.key}`);
  }
  return {
    ...product,
    mode: product.mode || EAZO_PAYMENT_MODE.ONE_TIME,
    entitlementKey: product.entitlementKey || product.key,
  };
}

export function defineEazoPaymentProducts<const T extends Record<string, EazoPaymentProductInput>>(
  products: T,
): EazoPaymentProducts<T> {
  return Object.fromEntries(
    Object.entries(products).map(([key, product]) => [
      key,
      normalizeEazoPaymentProduct(key, product),
    ]),
  ) as EazoPaymentProducts<T>;
}

export class EazoPaymentApiError extends Error {
  status: number;
  body: EazoPaymentApiErrorBody;

  constructor(status: number, body: EazoPaymentApiErrorBody, fallbackMessage: string) {
    super(getEazoPaymentErrorMessage(body, fallbackMessage));
    this.name = "EazoPaymentApiError";
    this.status = status;
    this.body = body;
  }
}

export function getEazoPaymentErrorMessage(
  body: EazoPaymentApiErrorBody,
  fallbackMessage: string,
) {
  if (typeof body.error === "string") return body.error;
  if (
    typeof body.error === "object" &&
    body.error &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  if (typeof body.message === "string") return body.message;
  if (
    typeof body.detail === "object" &&
    body.detail &&
    "message" in body.detail &&
    typeof body.detail.message === "string"
  ) {
    return body.detail.message;
  }
  if (Array.isArray(body.detail) && body.detail[0] && typeof body.detail[0] === "object") {
    const message = (body.detail[0] as Record<string, unknown>).msg;
    if (typeof message === "string") return message;
  }
  if (typeof body.detail === "string") return body.detail;
  return fallbackMessage;
}

const LAST_PAYMENT_ID_KEY = "eazo:lastPaymentId";
const LAST_PAYMENT_RECORD_KEY = "eazo:lastPayment";

export type EazoCheckoutRedirect = (checkoutUrl: string) => void;

type StoredPayment = {
  paymentId: string;
  createdAt: number;
};

function browserStorage(kind: "sessionStorage" | "localStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind] || null;
  } catch {
    return null;
  }
}

function storageGet(storage: Storage | null, key: string) {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
}

function storageSet(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Checkout can still continue because the return URL carries payment_id.
  }
}

function storageRemove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function rememberEazoPaymentId(paymentId: string) {
  const record: StoredPayment = { paymentId, createdAt: Date.now() };
  for (const storage of [browserStorage("sessionStorage"), browserStorage("localStorage")]) {
    storageSet(storage, LAST_PAYMENT_ID_KEY, paymentId);
    storageSet(storage, LAST_PAYMENT_RECORD_KEY, JSON.stringify(record));
  }
}

export function readRememberedEazoPaymentId() {
  for (const storage of [browserStorage("sessionStorage"), browserStorage("localStorage")]) {
    const legacyValue = storageGet(storage, LAST_PAYMENT_ID_KEY);
    if (legacyValue) return legacyValue;

    const recordValue = storageGet(storage, LAST_PAYMENT_RECORD_KEY);
    if (!recordValue) continue;
    try {
      const parsed = JSON.parse(recordValue) as Partial<StoredPayment>;
      if (typeof parsed.paymentId === "string" && parsed.paymentId) {
        return parsed.paymentId;
      }
    } catch {
      // Ignore malformed storage and keep looking.
    }
  }
  return null;
}

export function clearRememberedEazoPaymentId() {
  for (const storage of [browserStorage("sessionStorage"), browserStorage("localStorage")]) {
    storageRemove(storage, LAST_PAYMENT_ID_KEY);
    storageRemove(storage, LAST_PAYMENT_RECORD_KEY);
  }
}

export function readEazoPaymentIdFromUrl(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  if (!search) return null;
  const query = search.startsWith("http")
    ? new URL(search).search
    : search;
  const params = new URLSearchParams(query);
  return params.get("payment_id") || params.get("paymentId");
}

function readStringField(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function normalizeEazoCheckoutResult(
  data: EazoCheckoutSessionResponseLike,
): CreateEazoCheckoutResult | null {
  const checkoutSessionId =
    readStringField(data.checkout_session_id) ||
    readStringField(data.checkoutSessionId) ||
    "";
  const checkoutUrl =
    readStringField(data.checkout_url) ||
    readStringField(data.checkoutUrl);
  const paymentId =
    readStringField(data.payment_id) ||
    readStringField(data.paymentId);

  if (!checkoutUrl || !paymentId) return null;

  return {
    checkoutSessionId,
    checkoutUrl,
    paymentId,
  };
}

function checkoutErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "Checkout failed";
  return getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Checkout failed");
}

export async function startEazoCheckout(
  productKey = "premium",
  redirect: EazoCheckoutRedirect = (checkoutUrl) => {
    window.location.assign(checkoutUrl);
  },
) {
  await auth.login();
  const sessionHeader = await auth.getSessionHeader();

  const response = await fetch("/api/payments/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionHeader ? { "x-eazo-session": sessionHeader } : {}),
    },
    body: JSON.stringify({ productKey }),
  });
  const data = await response.json().catch(() => ({}));
  const checkout = normalizeEazoCheckoutResult(data as EazoCheckoutSessionResponseLike);

  if (!response.ok || !checkout) {
    throw new Error(checkoutErrorMessage(data));
  }

  rememberEazoPaymentId(checkout.paymentId);
  redirect(checkout.checkoutUrl);
}
