import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttps, fetchAllowlisted, isBlockedAddress } from "./ssrf.ts";

test("blocks private, loopback, and link-local addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.9", "169.254.1.1", "172.16.0.1", "::1", "fe80::1"]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  assert.equal(isBlockedAddress("8.8.8.8"), false);
});

test("rejects an allowlisted host that resolves privately", async () => {
  await assert.rejects(
    () => assertPublicHttps("https://docs.near.org/protocol", async () => ["127.0.0.1"]),
    /blocked address/,
  );
});

test("revalidates redirects and refuses a private hop", async () => {
  const fetchImpl = (async (url: string | URL) => {
    if (String(url).includes("docs.near.org")) {
      return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } });
    }
    return new Response("no", { status: 200 });
  }) as typeof fetch;
  await assert.rejects(
    () => fetchAllowlisted("https://docs.near.org/x", async () => ["8.8.8.8"], fetchImpl),
    /allowlisted|blocked|https/,
  );
});
