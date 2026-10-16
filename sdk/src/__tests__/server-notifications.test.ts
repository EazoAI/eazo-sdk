import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifications } from "../server";

const originalEnv = { ...process.env };

function mockSuccessfulPublish() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 0,
        message: "ok",
        data: { delivered: 2, publishId: "publish_123" },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function readRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("server notifications.publish", () => {
  beforeEach(() => {
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY =
      "0000000000000000000000000000000000000000000000000000000000000001";
    process.env.EAZO_PLATFORM_API_BASE = "https://platform.test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to a subscriber broadcast request", async () => {
    const fetchMock = mockSuccessfulPublish();

    await expect(
      notifications.publish({
        title: "Daily reminder",
        body: "Your tasks are waiting.",
      }),
    ).resolves.toEqual({ delivered: 2, publishId: "publish_123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://platform.test/api/open/notifications/publish",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: expect.stringMatching(/^Bearer /),
      },
    });
    expect(readRequestBody(fetchMock)).toEqual({
      appId: "app_test",
      title: "Daily reminder",
      body: "Your tasks are waiting.",
      audience: "subscribers",
    });
  });

  it("forwards a targeted audience and dedupe key", async () => {
    const fetchMock = mockSuccessfulPublish();

    await notifications.publish({
      title: "Assignment update",
      body: "A task was assigned to you.",
      data: { taskId: "task_42" },
      audience: { userIds: ["user_1", "user_2"] },
      dedupeKey: "task-assigned:task_42",
    });

    expect(readRequestBody(fetchMock)).toEqual({
      appId: "app_test",
      title: "Assignment update",
      body: "A task was assigned to you.",
      data: { taskId: "task_42" },
      audience: { userIds: ["user_1", "user_2"] },
      dedupeKey: "task-assigned:task_42",
    });
  });

  it.each([
    ["unknown string", "everyone"],
    ["missing userIds", {}],
    ["empty userIds", { userIds: [] }],
    ["blank user id", { userIds: ["user_1", " "] }],
    ["non-string user id", { userIds: ["user_1", 42] }],
    [
      "more than 500 user ids",
      { userIds: Array.from({ length: 501 }, (_, index) => `user_${index}`) },
    ],
  ])("rejects an invalid audience: %s", async (_label, audience) => {
    const fetchMock = mockSuccessfulPublish();

    await expect(
      notifications.publish({
        title: "Update",
        body: "Something changed.",
        audience: audience as never,
      }),
    ).rejects.toThrow(
      'notifications.publish: `audience` must be "subscribers" or { userIds: string[] } with 1-500 non-empty ids',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
