import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { notifications } from "../internal/capabilities/notifications";
import {
  CHANNEL,
  NOTIFICATIONS_IS_SUBSCRIBED,
  NOTIFICATIONS_SUBSCRIBE,
  NOTIFICATIONS_SYNC_SCHEDULES,
  NOTIFICATIONS_UNSUBSCRIBE,
  VERSION,
} from "../internal/bridge/protocol";
import { __dispatchHostMessage, __resetSDK } from "../testing";

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function installRN(onSend: (payload: string) => void): void {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = { postMessage: onSend };
}

function removeRN(): void {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

function dispatchHello(capabilities: string[]): void {
  __dispatchHostMessage({
    ch: CHANNEL,
    v: VERSION,
    t: "hello",
    session: {
      authenticated: true,
      user: { id: "u1", email: null, name: "U", avatarUrl: null },
      token: "tok",
    },
    device: { platform: "mobile", locale: "en-US" },
    capabilities,
  });
}

describe("notifications — mobile bridge path", () => {
  let sent: string[];

  beforeEach(() => {
    __resetSDK();
    sent = [];
    installRN((payload) => sent.push(payload));
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
  });

  it("subscribe forwards an RPC and resolves with the host's subscribed state", async () => {
    const promise = notifications.subscribe();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["notifications.subscribe", "notifications.unsubscribe", "notifications.isSubscribed"]);
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((env) => env.t === "req" && env.fn === NOTIFICATIONS_SUBSCRIBE);
    expect(reqEnvelope).toBeDefined();

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { subscribed: true },
    });

    const result = await promise;
    expect(result).toEqual({ subscribed: true });
  });

  it("unsubscribe forwards an RPC", async () => {
    const promise = notifications.unsubscribe();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["notifications.subscribe", "notifications.unsubscribe", "notifications.isSubscribed"]);
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((env) => env.t === "req" && env.fn === NOTIFICATIONS_UNSUBSCRIBE);
    expect(reqEnvelope).toBeDefined();

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { subscribed: false },
    });

    const result = await promise;
    expect(result).toEqual({ subscribed: false });
  });

  it("isSubscribed forwards an RPC", async () => {
    const promise = notifications.isSubscribed();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["notifications.subscribe", "notifications.unsubscribe", "notifications.isSubscribed"]);
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((env) => env.t === "req" && env.fn === NOTIFICATIONS_IS_SUBSCRIBED);
    expect(reqEnvelope).toBeDefined();

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { subscribed: true },
    });

    expect(await promise).toEqual({ subscribed: true });
  });

  it("syncSchedules forwards a replace-style RPC and normalizes the host result", async () => {
    const promise = notifications.syncSchedules({
      title: "Hydration",
      schedules: [
        { id: "water-2200", type: "time", time: "22:00", body: "Drink water." },
      ],
    });

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["notifications.syncSchedules"]);
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((env) => env.t === "req" && env.fn === NOTIFICATIONS_SYNC_SCHEDULES);
    expect(reqEnvelope).toBeDefined();
    expect(reqEnvelope?.args).toEqual({
      replace: true,
      title: "Hydration",
      schedules: [
        { id: "water-2200", type: "time", time: "22:00", body: "Drink water." },
      ],
    });

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { synced: true, scheduledCount: 1, permissionGranted: true },
    });

    expect(await promise).toEqual({
      synced: true,
      scheduledCount: 1,
      permissionGranted: true,
    });
  });

  it("syncSchedules falls back to { synced: false } when the host advertises no capability", async () => {
    const promise = notifications.syncSchedules({ title: "X", schedules: [] });

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([]); // host doesn't advertise notifications.*
    await new Promise((r) => setTimeout(r, 20));

    expect(await promise).toEqual({
      synced: false,
      scheduledCount: 0,
      permissionGranted: false,
    });
  });

  it("falls back to { subscribed: false } when the host advertises no capability", async () => {
    const promise = notifications.subscribe();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([]); // host doesn't advertise notifications.*
    await new Promise((r) => setTimeout(r, 20));

    const result = await promise;
    expect(result).toEqual({ subscribed: false });
  });
});

describe("notifications — pure web path", () => {
  beforeEach(() => {
    __resetSDK();
    removeRN();
  });

  afterEach(() => {
    __resetSDK();
  });

  it("resolves { subscribed: false } when no host responds within hello timeout", async () => {
    const promise = notifications.subscribe();
    // Wait past HELLO_TIMEOUT_MS (1500ms) so waitForBootstrap resolves null.
    await new Promise((r) => setTimeout(r, 1700));
    const result = await promise;
    expect(result).toEqual({ subscribed: false });
  });
});
