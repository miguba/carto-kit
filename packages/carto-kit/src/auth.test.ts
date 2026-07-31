import test from "node:test";
import assert from "node:assert/strict";
import { pollDeviceAuthorization } from "./auth.js";

const authorization = { deviceCode: "device", userCode: "ABCD", verificationUri: "https://carto.test/device", expiresIn: 60, interval: 1 };

test("polls pending authorization and returns the one-time credential", async () => {
  const responses = [
    new Response(JSON.stringify({ status: "authorization_pending" }), { status: 202 }),
    Response.json({ apiBaseUrl: "https://carto.test", token: "secret", site: "shop.test", serverApp: { id: "1", name: "kit", scopes: ["commerce:read"] } })
  ];
  const sleeps: number[] = [];
  const result = await pollDeviceAuthorization("https://carto.test", authorization, {
    fetcher: async () => responses.shift()!, sleep: async (ms) => { sleeps.push(ms); }
  });
  assert.equal(result.site, "shop.test");
  assert.deepEqual(sleeps, [1000, 1000]);
});

test("handles slow_down and redacts server error tokens", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assert.rejects(pollDeviceAuthorization("https://carto.test", authorization, {
    fetcher: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ status: "slow_down" }), { status: 202 });
      return new Response("token=sk_live_leaked", { status: 400 });
    }, sleep: async (ms) => { sleeps.push(ms); }
  }), (error: Error) => !error.message.includes("leaked") && error.message.includes("REDACTED"));
  assert.deepEqual(sleeps, [1000, 6000]);
});
