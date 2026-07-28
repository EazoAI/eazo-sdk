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

export const EAZO_PAYMENT_MAXIMUM_USD = 700;
export const EAZO_PAYMENT_MAXIMUM_RATE_SNAPSHOT_DATE = "2026-07-14";
export const EAZO_PAYMENT_MAXIMUM_RATE_SOURCE = "https://open.er-api.com/v6/latest/USD";
export const EAZO_PAYMENT_DEFAULT_STRIPE_MAXIMUM_UNIT_AMOUNT = 99_999_999;
export const EAZO_PAYMENT_STRIPE_MAXIMUM_UNIT_AMOUNT_EXCEPTIONS = {
  cop: 9_999_999_999_999,
  huf: 9_999_999_999_999,
  idr: 999_999_999_999,
  inr: 999_999_999,
  jpy: 9_999_999_999_999,
  lbp: 999_999_999_999,
} as const satisfies Partial<Record<EazoPaymentCurrency, number>>;

// Each limit starts with ceil(700 USD * snapshot FX rate) in whole major units,
// then converts to Stripe minor units and applies Stripe's currency-specific
// technical maximum. Payment methods and card networks can impose lower limits.
export const EAZO_PAYMENT_MAXIMUM_UNIT_AMOUNT_BY_CURRENCY = {
  aed: 257_100,
  afn: 4_594_800,
  all: 5_749_700,
  amd: 25_692_800,
  ang: 125_300,
  aoa: 64_835_800,
  ars: 99_999_999,
  aud: 101_100,
  awg: 125_300,
  azn: 119_100,
  bam: 120_200,
  bbd: 140_000,
  bdt: 8_635_300,
  bgn: 120_200,
  bhd: 26_400,
  bif: 2_094_699,
  bmd: 70_000,
  bnd: 90_600,
  bob: 706_000,
  brl: 358_300,
  bsd: 70_000,
  bwp: 968_300,
  byn: 199_800,
  bzd: 140_000,
  cad: 99_100,
  cdf: 99_999_999,
  chf: 57_000,
  clp: 647_809,
  cny: 475_200,
  cop: 227_066_900,
  crc: 31_891_500,
  cve: 6_772_300,
  czk: 1_490_800,
  djf: 124_405,
  dkk: 458_200,
  dop: 4_122_400,
  dzd: 9_328_100,
  egp: 3_516_100,
  etb: 11_156_800,
  eur: 61_500,
  fjd: 156_600,
  fkp: 52_400,
  gbp: 52_400,
  gel: 184_400,
  gip: 52_400,
  gmd: 5_200_000,
  gnf: 6_146_556,
  gtq: 534_900,
  gyd: 14_645_300,
  hkd: 548_700,
  hnl: 1_876_500,
  htg: 9_157_100,
  huf: 21_971_600,
  idr: 1_268_357_500,
  ils: 211_900,
  inr: 6_700_500,
  isk: 8_783_200,
  jmd: 11_109_600,
  jod: 49_700,
  jpy: 113_617,
  kes: 9_049_800,
  kgs: 6_122_400,
  khr: 99_999_999,
  kmf: 302_155,
  krw: 1_047_900,
  kwd: 21_700,
  kyd: 58_400,
  kzt: 33_178_400,
  lak: 99_999_999,
  lbp: 6_265_000_000,
  lkr: 23_488_800,
  lrd: 12_732_700,
  lsl: 1_150_100,
  mad: 652_700,
  mdl: 1_230_000,
  mga: 2_991_101,
  mkd: 3_774_900,
  mmk: 99_999_999,
  mnt: 99_999_999,
  mop: 565_200,
  mur: 3_305_100,
  mvr: 1_081_500,
  mwk: 99_999_999,
  mxn: 1_225_800,
  myr: 285_100,
  mzn: 4_447_800,
  nad: 1_150_100,
  ngn: 96_605_000,
  nio: 2_578_100,
  nok: 684_600,
  npr: 10_720_800,
  nzd: 121_500,
  pab: 70_000,
  pen: 238_600,
  pgk: 310_200,
  php: 4_315_700,
  pkr: 19_474_000,
  pln: 266_000,
  pyg: 4_254_310,
  qar: 254_800,
  ron: 320_900,
  rsd: 7_193_000,
  rwf: 1_029_908,
  sar: 262_500,
  sbd: 558_500,
  scr: 1_001_000,
  sek: 679_200,
  sgd: 90_600,
  shp: 52_400,
  sle: 1_703_000,
  sos: 40_041_700,
  srd: 2_639_700,
  stn: 1_504_800,
  szl: 1_150_100,
  thb: 2_340_600,
  tjs: 646_900,
  top: 166_800,
  try: 3_290_500,
  ttd: 475_200,
  twd: 2_252_600,
  tzs: 99_999_999,
  uah: 3_126_500,
  ugx: 99_999_900,
  usd: 70_000,
  uyu: 2_825_500,
  uzs: 99_999_999,
  vnd: 18_333_362,
  vuv: 83_821,
  wst: 190_700,
  xaf: 402_874,
  xcd: 189_100,
  xof: 402_874,
  xpf: 73_291,
  yer: 16_641_300,
  zar: 1_149_600,
  zmw: 1_264_300,
} as const satisfies Record<EazoPaymentCurrency, number>;

// Most floors come from Stripe's settlement-currency table; CNY uses Eazo's ¥5
// product policy. Cross-currency charges can still require a higher effective floor.
// https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
export const EAZO_PAYMENT_MINIMUM_UNIT_AMOUNT_BY_CURRENCY = {
  aed: 200,
  ars: 50,
  aud: 50,
  brl: 50,
  cad: 50,
  chf: 50,
  cny: 500,
  cop: 50,
  czk: 1_500,
  dkk: 250,
  eur: 50,
  gbp: 30,
  hkd: 400,
  huf: 17_500,
  idr: 50,
  ils: 50,
  inr: 50,
  jpy: 50,
  krw: 50,
  mxn: 1_000,
  myr: 200,
  nok: 300,
  nzd: 50,
  php: 50,
  pln: 200,
  ron: 200,
  sek: 300,
  sgd: 50,
  thb: 1_000,
  usd: 50,
  zar: 50,
} as const satisfies Partial<Record<EazoPaymentCurrency, number>>;

export const EAZO_PAYMENT_UNIT_AMOUNT_MULTIPLE_BY_CURRENCY = {
  isk: 100,
  ugx: 100,
} as const satisfies Partial<Record<EazoPaymentCurrency, number>>;

export type EazoPaymentPriceLimits = {
  minimumUnitAmount: number;
  maximumUnitAmount: number;
  unitAmountMultiple: number;
  hasConfiguredMinimum: boolean;
};

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

export function getEazoPaymentPriceLimits(currency: EazoPaymentCurrency): EazoPaymentPriceLimits {
  assertEazoPaymentCurrency(currency);
  const multiple = EAZO_PAYMENT_UNIT_AMOUNT_MULTIPLE_BY_CURRENCY[
    currency as keyof typeof EAZO_PAYMENT_UNIT_AMOUNT_MULTIPLE_BY_CURRENCY
  ] ?? 1;
  const configuredMinimum = EAZO_PAYMENT_MINIMUM_UNIT_AMOUNT_BY_CURRENCY[
    currency as keyof typeof EAZO_PAYMENT_MINIMUM_UNIT_AMOUNT_BY_CURRENCY
  ];
  const minimum = configuredMinimum ?? 1;

  return {
    minimumUnitAmount: Math.ceil(minimum / multiple) * multiple,
    maximumUnitAmount: EAZO_PAYMENT_MAXIMUM_UNIT_AMOUNT_BY_CURRENCY[currency],
    unitAmountMultiple: multiple,
    hasConfiguredMinimum: configuredMinimum !== undefined,
  };
}

export function assertEazoPaymentUnitAmount(
  value: unknown,
  currency: EazoPaymentCurrency,
  field = "unitAmount",
): asserts value is number {
  assertEazoPaymentCurrency(currency);
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer in minor currency units`);
  }

  const limits = getEazoPaymentPriceLimits(currency);
  if ((value as number) < limits.minimumUnitAmount) {
    throw new Error(
      `${field} for ${currency.toUpperCase()} must be at least ${limits.minimumUnitAmount} in minor currency units`,
    );
  }
  if ((value as number) > limits.maximumUnitAmount) {
    throw new Error(
      `${field} for ${currency.toUpperCase()} must not exceed ${limits.maximumUnitAmount} in minor currency units`,
    );
  }
  if ((value as number) % limits.unitAmountMultiple !== 0) {
    throw new Error(
      `${field} for ${currency.toUpperCase()} must be a multiple of ${limits.unitAmountMultiple} in minor currency units`,
    );
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
  assertEazoPaymentUnitAmount(product.unitAmount, product.currency, `unitAmount for ${product.key}`);
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
