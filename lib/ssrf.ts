export type Resolver = (hostname: string) => Promise<string[]>;

const ALLOWED_HOSTS = new Set(["docs.near.org", "docs.near.ai", "docs.near-intents.org"]);

export function isBlockedAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) {
    return true;
  }
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return value.includes(":");
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export async function assertPublicHttps(raw: string, resolver: Resolver): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("only https");
  if (url.username || url.password) throw new Error("credentials in url");
  if (url.port && url.port !== "443") throw new Error("unsafe port");
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error("host is not allowlisted");
  const addresses = await resolver(url.hostname);
  if (addresses.length === 0) throw new Error("dns returned no addresses");
  if (addresses.some(isBlockedAddress)) throw new Error("dns resolved to a blocked address");
  return url;
}

export async function fetchAllowlisted(
  raw: string,
  resolver: Resolver,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; body: Uint8Array }> {
  let current = await assertPublicHttps(raw, resolver);
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetchImpl(current.toString(), { redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect without location");
      current = await assertPublicHttps(new URL(location, current).toString(), resolver);
      continue;
    }
    if (!response.ok) throw new Error(`source fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 200_000) throw new Error("source exceeded byte cap");
    return { url: current.toString(), body: bytes };
  }
  throw new Error("too many redirects");
}
