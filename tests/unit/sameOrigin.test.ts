import { describe, expect, it, vi } from "vitest";
import { allowedOrigins, originMatchesRequest } from "@/lib/sameOrigin";

function request(headers: Record<string, string>, url = "http://localhost:3000/api/shared-projects") {
  return new Request(url, { method: "POST", headers });
}

describe("same-origin check behind a reverse proxy", () => {
  it("lets a request without Origin pass", () => {
    expect(originMatchesRequest(request({}), {})).toBe(true);
  });

  it("matches the Origin against the plain host", () => {
    expect(originMatchesRequest(request({ origin: "http://localhost:3000", host: "localhost:3000" }), {})).toBe(true);
    expect(originMatchesRequest(request({ origin: "http://other.test", host: "localhost:3000" }), {})).toBe(false);
  });

  it("uses the forwarded host and protocol when the proxy sends them", () => {
    const headers = { origin: "https://layerling.example.com", host: "layerling:3000", "x-forwarded-host": "layerling.example.com", "x-forwarded-proto": "https" };
    expect(originMatchesRequest(request(headers), {})).toBe(true);
  });

  it("accepts an https Origin on the same host when the proxy does not say it closed TLS", () => {
    expect(originMatchesRequest(request({ origin: "https://layerling.example.com", host: "layerling.example.com" }), {})).toBe(true);
  });

  it("stays strict when the proxy names the protocol", () => {
    const headers = { origin: "https://layerling.example.com", host: "layerling.example.com", "x-forwarded-proto": "http" };
    expect(originMatchesRequest(request(headers), {})).toBe(false);
  });

  it("does not accept another host just because it is https", () => {
    expect(originMatchesRequest(request({ origin: "https://evil.test", host: "layerling.example.com" }), {})).toBe(false);
  });

  it("accepts an origin listed in LAYERLING_ALLOWED_ORIGINS, as full origin or bare host", () => {
    const headers = { origin: "https://layerling.example.com", host: "layerling:3000" };
    expect(originMatchesRequest(request(headers), {})).toBe(false);
    expect(originMatchesRequest(request(headers), { LAYERLING_ALLOWED_ORIGINS: "https://layerling.example.com" })).toBe(true);
    expect(originMatchesRequest(request(headers), { LAYERLING_ALLOWED_ORIGINS: "other.test, Layerling.Example.com/" })).toBe(true);
  });

  it("says why it refused", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    originMatchesRequest(request({ origin: "https://layerling.example.com", host: "layerling:3000" }), {});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("LAYERLING_ALLOWED_ORIGINS"));
    warn.mockRestore();
  });

  it("reads the list from the environment, trimmed and in lower case", () => {
    expect(allowedOrigins({ LAYERLING_ALLOWED_ORIGINS: " HTTPS://A.test/ , b.test " })).toEqual(["https://a.test", "b.test"]);
    expect(allowedOrigins({})).toEqual([]);
  });
});
