export { auth } from "./internal/capabilities/auth";
export { device } from "./internal/capabilities/device";
export { storage } from "./internal/capabilities/storage";
export { ai } from "./internal/capabilities/ai";
export { memory } from "./internal/capabilities/memory";
export { share } from "./internal/capabilities/share";
export { notifications } from "./internal/capabilities/notifications";

export type { LoginOptions } from "./internal/capabilities/auth";
export type { StorageCredentials, UploadResult } from "./internal/capabilities/storage";
export type { MemoryActionParams } from "./internal/capabilities/memory";
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "./internal/capabilities/ai";
export type {
  ShareAttachment,
  ShareComposeInput,
  ShareComposeResult,
  ShareImageAttachment,
} from "./internal/capabilities/share";
export type { NotificationsSubscriptionResult } from "./internal/capabilities/notifications";
export type {
  PublicAppData,
  PublicAppInfo,
  PublicAppViewer,
} from "./internal/app-info";
export type { User, DeviceContext, AuthState, EazoState } from "./types";
