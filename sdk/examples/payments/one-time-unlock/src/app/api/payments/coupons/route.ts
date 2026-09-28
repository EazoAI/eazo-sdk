import {
  createEazoCouponCreateRoute,
  createEazoCouponListRoute,
} from "@eazo/sdk/payments/next";

export const GET = createEazoCouponListRoute();
export const POST = createEazoCouponCreateRoute();
