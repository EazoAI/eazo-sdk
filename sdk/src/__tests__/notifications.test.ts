import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { notifications } from "../internal/capabilities/notifications";
import {
  CHANNEL,
  NOTIFICATIONS_IS_SUBSCRIBED,
  NOTIFICATIONS_REQUEST_SUBSCRIPTION,
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

  it("requestSubscription asks the host for authorization and returns its permission state", async () => {
    const promise = notifications.requestSubscription();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([
      "notifications.requestSubscription",
      "notifications.unsubscribe",
      "notifications.isSubscribed",
    ]);
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find(
        (env) =>
          env.t === "req" && env.fn === NOTIFICATIONS_REQUEST_SUBSCRIPTION,
      );
    expect(reqEnvelope).toBeDefined();

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { subscribed: true, systemPermission: "granted" },
    });

    const result = await promise;
    expect(result).toEqual({
      subscribed: true,
      systemPermission: "granted",
    });
  });

  it("subscribe is a legacy alias for the requestSubscription RPC", async () => {
    const promise = notifications.subscribe();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["notifications.requestSubscription"]);
    await new Promise((r) => setTimeout(r, 20));

    const requests = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .filter((env) => env.t === "req");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.fn).toBe(NOTIFICATIONS_REQUEST_SUBSCRIPTION);
    expect(requests[0]?.fn).not.toBe("notifications.subscribe");

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: requests[0]?.id,
      ok: true,
      data: { subscribed: false, systemPermission: "denied" },
    });

    await expect(promise).resolves.toEqual({
      subscribed: false,
      systemPermission: "denied",
    });
  });

  it("unsubscribe returns the host's resulting subscription and permission state", async () => {
    const promise = notifications.unsubscribe();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["notifications.unsubscribe"]);
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
      data: { subscribed: true, systemPermission: "blocked" },
    });

    const result = await promise;
    expect(result).toEqual({
      subscribed: true,
      systemPermission: "blocked",
    });
  });

  it("isSubscribed uses only its read-only RPC", async () => {
    const promise = notifications.isSubscribed();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([
      "notifications.requestSubscription",
      "notifications.isSubscribed",
    ]);
    await new Promise((r) => setTimeout(r, 20));

    const requests = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .filter((env) => env.t === "req");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.fn).toBe(NOTIFICATIONS_IS_SUBSCRIBED);

    const reqEnvelope = requests[0];
    expect(reqEnvelope).toBeDefined();

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { subscribed: true, systemPermission: "granted" },
    });

    expect(await promise).toEqual({
      subscribed: true,
      systemPermission: "granted",
    });
  });

  it.each([
    ["missing", { subscribed: true }],
    ["unknown", { subscribed: true, systemPermission: "prompt" }],
  ])(
    "normalizes a %s systemPermission to unavailable",
    async (_label, hostResult) => {
      const promise = notifications.isSubscribed();

      await new Promise((r) => setTimeout(r, 10));
      dispatchHello(["notifications.isSubscribed"]);
      await new Promise((r) => setTimeout(r, 20));

      const reqEnvelope = sent
        .map((s) => JSON.parse(s) as Record<string, unknown>)
        .find(
          (env) =>
            env.t === "req" && env.fn === NOTIFICATIONS_IS_SUBSCRIBED,
        );
      expect(reqEnvelope).toBeDefined();

      __dispatchHostMessage({
        ch: CHANNEL,
        v: VERSION,
        t: "res",
        id: reqEnvelope?.id,
        ok: true,
        data: hostResult,
      });

      await expect(promise).resolves.toEqual({
        subscribed: true,
        systemPermission: "unavailable",
      });
    },
  );

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
    expect(
      sent
        .map((s) => JSON.parse(s) as Record<string, unknown>)
        .some(
          (env) =>
            env.t === "req" &&
            env.fn === NOTIFICATIONS_REQUEST_SUBSCRIPTION,
        ),
    ).toBe(false);
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

  it("returns unavailable when the host cannot request a subscription", async () => {
    const promise = notifications.requestSubscription();

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([]); // host doesn't advertise notifications.*
    await new Promise((r) => setTimeout(r, 20));

    const result = await promise;
    expect(result).toEqual({
      subscribed: false,
      systemPermission: "unavailable",
    });
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

  it("reports subscription authorization as unavailable without a host", async () => {
    const promise = notifications.requestSubscription();
    // Wait past HELLO_TIMEOUT_MS (1500ms) so waitForBootstrap resolves null.
    await new Promise((r) => setTimeout(r, 1700));
    const result = await promise;
    expect(result).toEqual({
      subscribed: false,
      systemPermission: "unavailable",
    });
  });

  it("resolves an unsynced schedule result when no host responds", async () => {
    const promise = notifications.syncSchedules({
      title: "Hydration",
      schedules: [],
    });
    await new Promise((r) => setTimeout(r, 1700));

    await expect(promise).resolves.toEqual({
      synced: false,
      scheduledCount: 0,
      permissionGranted: false,
    });
  });
});
