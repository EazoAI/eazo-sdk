import type { SocialConnection } from "./auth-primitive";

import type { AuthScope, AuthState, DeviceContext, EazoState } from "../types";

type Listener = () => void;

export type LoginUIStep = "providers" | "email";
export type LoginUIEmailMode = "code" | "password";

export interface LoginUIState {
  open: boolean;
  step: LoginUIStep;
  emailMode: LoginUIEmailMode;
  providers: SocialConnection[];
  providersLoading: boolean;
  error: string | null;
  submitting: boolean;
  /** Identifier of the social provider currently mid-login (for in-button spinner). */
  submittingProvider: string | null;
}

const INITIAL_AUTH: AuthState = {
  user: null,
  loading: true,
  authenticated: false,
  grantedScopes: [],
};

const INITIAL_DEVICE: DeviceContext = {
  platform: "web",
  locale: "en-US",
};

const INITIAL_LOGIN_UI: LoginUIState = {
  open: false,
  step: "providers",
  emailMode: "code",
  providers: [],
  providersLoading: false,
  error: null,
  submitting: false,
  submittingProvider: null,
};

export interface ShareUIState {
  open: boolean;
}

const INITIAL_SHARE_UI: ShareUIState = {
  open: false,
};

/**
 * State for the WeChat-style profile-consent popup (web path). Opened by
 * `auth.requestProfile(scopes)`; resolved/rejected by the popup's
 * Allow / Deny buttons.
 */
export interface ProfileConsentUIState {
  open: boolean;
  scopes: AuthScope[];
  submitting: boolean;
  error: string | null;
}

const INITIAL_PROFILE_CONSENT_UI: ProfileConsentUIState = {
  open: false,
  scopes: [],
  submitting: false,
  error: null,
};

export interface InternalEazoState extends EazoState {
  loginUI: LoginUIState;
  shareUI: ShareUIState;
  profileConsentUI: ProfileConsentUIState;
}

export const INITIAL_STATE: InternalEazoState = {
  auth: INITIAL_AUTH,
  device: INITIAL_DEVICE,
  loginUI: INITIAL_LOGIN_UI,
  shareUI: INITIAL_SHARE_UI,
  profileConsentUI: INITIAL_PROFILE_CONSENT_UI,
};

let snapshot: InternalEazoState = INITIAL_STATE;
const listeners = new Set<Listener>();

export const store = {
  getSnapshot(): InternalEazoState {
    return snapshot;
  },
  getServerSnapshot(): InternalEazoState {
    return INITIAL_STATE;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    snapshot = INITIAL_STATE;
    for (const l of listeners) l();
  },
};

function publish(next: InternalEazoState): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function setAuth(patch: Partial<AuthState>): void {
  const current = snapshot.auth;
  const nextAuth = { ...current, ...patch };
  if (
    nextAuth.user === current.user &&
    nextAuth.loading === current.loading &&
    nextAuth.authenticated === current.authenticated &&
    nextAuth.grantedScopes === current.grantedScopes
  ) {
    return;
  }
  publish({ ...snapshot, auth: nextAuth });
}

export function setDevice(patch: Partial<DeviceContext>): void {
  const current = snapshot.device;
  const nextDevice = { ...current, ...patch };
  const changed = (Object.keys(nextDevice) as Array<keyof DeviceContext>).some(
    (key) => nextDevice[key] !== current[key],
  );
  if (!changed) return;
  publish({ ...snapshot, device: nextDevice });
}

export function setLoginUI(patch: Partial<LoginUIState>): void {
  const current = snapshot.loginUI;
  const next: LoginUIState = { ...current, ...patch };
  const changed = (Object.keys(next) as Array<keyof LoginUIState>).some(
    (key) => next[key] !== current[key],
  );
  if (!changed) return;
  publish({ ...snapshot, loginUI: next });
}

export function setShareUI(patch: Partial<ShareUIState>): void {
  const current = snapshot.shareUI;
  const next: ShareUIState = { ...current, ...patch };
  const changed = (Object.keys(next) as Array<keyof ShareUIState>).some(
    (key) => next[key] !== current[key],
  );
  if (!changed) return;
  publish({ ...snapshot, shareUI: next });
}

export function setProfileConsentUI(patch: Partial<ProfileConsentUIState>): void {
  const current = snapshot.profileConsentUI;
  const next: ProfileConsentUIState = { ...current, ...patch };
  const changed = (Object.keys(next) as Array<keyof ProfileConsentUIState>).some(
    (key) => next[key] !== current[key],
  );
  if (!changed) return;
  publish({ ...snapshot, profileConsentUI: next });
}
