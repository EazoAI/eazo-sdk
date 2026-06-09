import { AuthenticationClient, EmailScene } from "authing-js-sdk";

import { getPlatformApiBase } from "../config";
import type { EazoAuthClientConfig, SessionToken, SocialConnection } from "./types";

const DEFAULT_AUTH_APP_ID     = "6972f32040acf5801552404b";
const DEFAULT_AUTH_APP_DOMAIN = "https://eazo.genauth.ai";

/**
 * Browser-side auth primitive. Wraps GenAuth (Authing) to exchange a JWT for
 * an encrypted SessionToken (same shape produced by Eazo Mobile).
 *
 * The SDK's `auth` capability wraps this; app code should go through that
 * capability (auth.loginWithSocial / loginWithEmailPassword / loginWithEmailCode)
 * rather than using EazoAuthClient directly.
 */
export class EazoAuthClient {
  private readonly appId: string;
  private readonly authAppId: string;
  private readonly authAppDomain: string;
  private readonly apiBase: string;

  private _authingClient: AuthenticationClient | null = null;
  /**
   * The GenAuth JWT from the most recent successful login. Cached so a later
   * `auth.requestProfile([...])` can re-exchange a scoped session token
   * without forcing the user to re-authenticate.
   */
  private _lastJwt: string | null = null;

  constructor(config: EazoAuthClientConfig) {
    if (!config.appId) throw new Error("@eazo/sdk: appId is required");
    this.appId         = config.appId;
    this.authAppId     = config.authAppId     ?? DEFAULT_AUTH_APP_ID;
    this.authAppDomain = config.authAppDomain ?? DEFAULT_AUTH_APP_DOMAIN;
    this.apiBase       = getPlatformApiBase(config.apiBase);
  }

  /** True when a cached JWT is available for a scoped re-exchange. */
  hasCachedJwt(): boolean {
    return !!this._lastJwt;
  }

  /** Returns the cached login JWT, if any (for persistence across reloads). */
  getCachedJwt(): string | null {
    return this._lastJwt;
  }

  /**
   * Rehydrate the cached login JWT after a page reload. The web bootstrap
   * persists the JWT alongside the session and restores it here so a later
   * `auth.requestProfile([...])` can re-exchange a scoped token without
   * forcing the user to re-authenticate.
   */
  setCachedJwt(jwt: string | null): void {
    this._lastJwt = jwt;
  }

  /**
   * Re-exchange a scoped session token using the cached login JWT. Called by
   * `auth.requestProfile` after the user approves the consent popup —
   * `consent: true` records the grant server-side and the returned token
   * carries the newly-granted profile fields.
   */
  reexchangeWithScopes(
    scopes: string[],
    consent: boolean = true,
  ): Promise<SessionToken> {
    if (!this._lastJwt) {
      throw new Error(
        "@eazo/sdk: no cached credential to request profile scopes; the user must log in first.",
      );
    }
    return this._getSessionToken(this._lastJwt, { scopes, consent });
  }

  /**
   * Exchanges a GenAuth JWT for an encrypted session token.
   * The resulting token has the same shape as Eazo Mobile's session,
   * so the server always decrypts it with EAZO_PRIVATE_KEY.
   *
   * By default no profile scopes are requested, so the issued token is
   * identity-only. Pass `scopes` (+ `consent: true` after the user approves)
   * to include WeChat-style consented profile fields.
   */
  private async _getSessionToken(
    jwt: string,
    opts: { scopes?: string[]; consent?: boolean } = {},
  ): Promise<SessionToken> {
    this._lastJwt = jwt;
    const body: Record<string, unknown> = { appId: this.appId };
    if (opts.scopes && opts.scopes.length > 0) {
      body.scopes = opts.scopes;
      if (opts.consent) body.consent = true;
    }
    const res = await fetch(`${this.apiBase}/api/open/app-session-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to get session token: ${res.status}`);
    }

    // Eazo platform wraps responses in { code, message, data }. Treat any
    // non-zero code as a business error and validate the data shape before
    // handing it to verifySession — otherwise an undefined `data` would be
    // JSON.stringify'd into the literal string "undefined" and the API
    // route would 401 with "Malformed session".
    const json = (await res.json()) as {
      code?: number;
      message?: string;
      data?: SessionToken;
    };
    if (typeof json.code === "number" && json.code !== 0) {
      throw new Error(
        `app-session-token failed (code ${json.code}): ${json.message ?? "unknown error"}`,
      );
    }
    const data = json.data;
    if (
      !data ||
      !data.encryptedData ||
      !data.encryptedKey ||
      !data.iv ||
      !data.authTag
    ) {
      throw new Error("app-session-token returned an incomplete session token");
    }
    return data;
  }

  /** Initiates a social login popup and returns an encrypted session token. */
  loginWithSocial(extIdpIdentifier: string): Promise<SessionToken> {
    return new Promise((resolve, reject) => {
      const client = this.getAuthingClient();
      client.social.authorize(extIdpIdentifier, {
        onSuccess: async (profile) => {
          try {
            const p = profile as unknown as Record<string, unknown>;
            const jwt = (p.token ?? p.id_token) as string | undefined;
            if (!jwt) throw new Error("Social login succeeded but no token received");
            resolve(await this._getSessionToken(jwt));
          } catch (err) {
            reject(err);
          }
        },
        onError: (code: number, message: string) => {
          reject(new Error(message || `Social login failed (${code})`));
        },
      });
    });
  }

  /** Logs in with email + password and returns an encrypted session token. */
  async loginWithEmailPassword(email: string, password: string): Promise<SessionToken> {
    const result = (await this.getAuthingClient().loginByEmail(
      email,
      password,
    )) as unknown as Record<string, unknown>;
    const jwt = (result.token ?? result.id_token) as string | undefined;
    if (!jwt) throw new Error("Login succeeded but no token received");
    return this._getSessionToken(jwt);
  }

  /** Logs in with email + verification code and returns an encrypted session token. */
  async loginWithEmailCode(email: string, code: string): Promise<SessionToken> {
    const result = (await this.getAuthingClient().loginByEmailCode(
      email,
      code,
    )) as unknown as Record<string, unknown>;
    const jwt = (result.token ?? result.id_token) as string | undefined;
    if (!jwt) throw new Error("Login succeeded but no token received");
    return this._getSessionToken(jwt);
  }

  /** Sends an email verification code for login. */
  async sendEmailCode(email: string): Promise<void> {
    await this.getAuthingClient().sendEmail(email, EmailScene.LOGIN_VERIFY_CODE);
  }

  getAuthingClient(): AuthenticationClient {
    if (this._authingClient) return this._authingClient;
    this._authingClient = new AuthenticationClient({
      appId:   this.authAppId,
      appHost: this.authAppDomain,
    });
    return this._authingClient;
  }

  async fetchSocialConnections(): Promise<SocialConnection[]> {
    const res = await fetch(
      `${this.authAppDomain}/api/v2/applications/${this.authAppId}/public-config`,
      { next: { revalidate: 3600 } } as RequestInit,
    );
    if (!res.ok) throw new Error(`Failed to fetch GenAuth public config: ${res.status}`);
    const json = await res.json() as { data: { socialConnections: SocialConnection[] } };
    return json.data.socialConnections;
  }
}
