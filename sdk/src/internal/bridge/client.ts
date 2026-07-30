import {
  BridgeErrorObject,
  CHANNEL,
  HELLO_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  VERSION,
  type HelloEnvelope,
  type HostToAppEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "./protocol";
import { Transport } from "./transport";

type Pending = {
  resolve: (data: unknown) => void;
  reject: (err: BridgeErrorObject) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type HelloListener = (hello: HelloEnvelope) => void;
export type EventListener = (data: unknown) => void;

let requestCounter = 0;
function newRequestId(): string {
  requestCounter += 1;
  return `eazo-${Date.now()}-${requestCounter}`;
}

export interface BridgeStatus {
  ready: boolean;
  capabilities: string[];
}

export interface BridgeRequestOptions {
  timeoutMs?: number;
}

/**
 * Bridge client — manages handshake, RPC, and events.
 *
 * Lifecycle:
 *  - start() attaches transport, sends `ready`, and waits HELLO_TIMEOUT_MS for `hello`.
 *  - On `hello`, status becomes ready and `onHello` listeners fire.
 *  - On timeout, status remains not-ready; subsequent `request()` calls throw NOT_SUPPORTED.
 *  - stop() detaches transport and rejects all pending requests.
 */
export class BridgeClient {
  private readonly transport: Transport;
  private readonly pending = new Map<string, Pending>();
  private readonly eventListeners = new Map<string, Set<EventListener>>();
  private readonly helloListeners = new Set<HelloListener>();

  private started = false;
  private helloReceived = false;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private capabilities: string[] = [];
  private unsubscribeTransport: (() => void) | null = null;

  constructor(transport: Transport = new Transport()) {
    this.transport = transport;
  }

  start(options: { appId?: string | null } = {}): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.transport.attach();
    this.unsubscribeTransport = this.transport.onMessage((msg) => this.dispatch(msg));
    const ready: {
      ch: typeof CHANNEL;
      v: typeof VERSION;
      t: "ready";
      appId?: string;
    } = { ch: CHANNEL, v: VERSION, t: "ready" };
    if (options.appId) ready.appId = options.appId;
    this.transport.send(ready);
    this.helloTimer = setTimeout(() => {
      this.helloTimer = null;
      if (!this.helloReceived) {
        // No host responded — we're in a pure web context.
        this.helloReceived = false;
      }
    }, HELLO_TIMEOUT_MS);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeErrorObject("INTERNAL", "Bridge stopped"));
    }
    this.pending.clear();
    this.eventListeners.clear();
    this.helloListeners.clear();
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    this.transport.detach();
    this.helloReceived = false;
    this.capabilities = [];
  }

  getStatus(): BridgeStatus {
    return { ready: this.helloReceived, capabilities: this.capabilities.slice() };
  }

  onHello(listener: HelloListener): () => void {
    this.helloListeners.add(listener);
    return () => this.helloListeners.delete(listener);
  }

  on(eventName: string, listener: EventListener): () => void {
    let set = this.eventListeners.get(eventName);
    if (!set) {
      set = new Set();
      this.eventListeners.set(eventName, set);
    }
    set.add(listener);
    return () => {
      const s = this.eventListeners.get(eventName);
      s?.delete(listener);
      if (s && s.size === 0) this.eventListeners.delete(eventName);
    };
  }

  request<T = unknown>(
    fn: string,
    args?: unknown,
    options: BridgeRequestOptions = {},
  ): Promise<T> {
    if (!this.helloReceived) {
      return Promise.reject(
        new BridgeErrorObject("NOT_SUPPORTED", `Host not available (fn=${fn})`),
      );
    }
    if (!this.isSupported(fn)) {
      return Promise.reject(
        new BridgeErrorObject("NOT_SUPPORTED", `Host does not advertise ${fn}`),
      );
    }

    const id = newRequestId();
    const env: RequestEnvelope = { ch: CHANNEL, v: VERSION, t: "req", id, fn, args };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new BridgeErrorObject("TIMEOUT", `Bridge request ${fn} timed out`));
        }
      }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (data) => resolve(data as T),
        reject,
        timer,
      });

      this.transport.send(env);
    });
  }

  private isSupported(fn: string): boolean {
    if (this.capabilities.includes(fn)) return true;
    const [namespace] = fn.split(".");
    return this.capabilities.includes(`${namespace}.*`);
  }

  private dispatch(msg: HostToAppEnvelope): void {
    if (msg.t === "hello") {
      this.handleHello(msg);
      return;
    }
    if (msg.t === "res") {
      this.handleResponse(msg);
      return;
    }
    if (msg.t === "evt") {
      const listeners = this.eventListeners.get(msg.name);
      if (listeners) for (const l of listeners) l(msg.data);
      return;
    }
  }

  private handleHello(msg: HelloEnvelope): void {
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
    this.helloReceived = true;
    this.capabilities = msg.capabilities.slice();
    for (const l of this.helloListeners) l(msg);
  }

  private handleResponse(msg: ResponseEnvelope): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.ok) {
      pending.resolve(msg.data);
    } else {
      pending.reject(new BridgeErrorObject(msg.err.code, msg.err.message));
    }
  }
}
