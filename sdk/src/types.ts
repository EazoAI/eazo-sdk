/**
 * Public semantic types. These are the shapes app developers import.
 * Protocol / envelope / transport details stay in internal/.
 */

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * WeChat-style profile consent scopes. The anonymous `id` is always available;
 * these scopes gate the private fields behind an explicit consent popup:
 *   - `profile` → `name` + `avatarUrl`
 *   - `email`   → `email`
 *   - `phone`   → reserved (no data yet)
 */
export type AuthScope = "profile" | "email" | "phone";

export interface DeviceContext {
  platform: "web" | "mobile";
  locale: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  /** Scopes the user has granted this app. `[]` until `auth.requestProfile` succeeds. */
  grantedScopes: AuthScope[];
}

/**
 * The full reactive state tree selected by `useEazo(selector)`.
 * Each capability contributes one namespace; adding a capability adds a field here.
 */
export interface EazoState {
  auth: AuthState;
  device: DeviceContext;
}
