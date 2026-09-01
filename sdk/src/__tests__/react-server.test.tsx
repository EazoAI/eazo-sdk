import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { EazoProvider } from "../react.server";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EAZO_APP_ID = "app_123";
  process.env.EAZO_PLATFORM_API_BASE = "https://api.eazo.test";
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ code: 0, data: null }), { status: 200 }),
  );
});

afterEach(() => {
  delete process.env.EAZO_APP_ID;
  delete process.env.EAZO_PLATFORM_API_BASE;
  globalThis.fetch = originalFetch;
});

it("does not fetch retired banner data while rendering the server provider", async () => {
  await EazoProvider({ children: React.createElement("main") });

  expect(globalThis.fetch).not.toHaveBeenCalled();
});
