import { describe, expect, it } from "vitest";
import { createRelayCode, isRelayCode, normalizeRelayUrl, parseMcpRelaySettings, relayBridgeUrl, relayDownload, relayMcpUrl } from "@/lib/mcpRelayLink";
// @ts-expect-error a plain .mjs module
import { RELAY_CODE_PATTERN } from "../../scripts/layerling-mcp-relay-core.mjs";

/*
 * The AI connection of a Layerling that is only a page: the relay's address as the user types it, the
 * key the page makes up, the settings as the browser keeps them, and a file the AI asked to be saved.
 */

describe("a relay address", () => {
  it("is taken as typed, without what does not belong to it", () => {
    expect(normalizeRelayUrl("https://relay.example.com")).toBe("https://relay.example.com");
    expect(normalizeRelayUrl("  https://relay.example.com/  ")).toBe("https://relay.example.com");
    expect(normalizeRelayUrl("relay.example.com")).toBe("https://relay.example.com");
    expect(normalizeRelayUrl("https://example.com/layerling/relay/")).toBe("https://example.com/layerling/relay");
    expect(normalizeRelayUrl("https://relay.example.com/?x=1#y")).toBe("https://relay.example.com");
  });

  it("is found in an address for the AI pasted by mistake", () => {
    expect(normalizeRelayUrl("https://relay.example.com/mcp/abcdefghijklmnopqrstuvwxyz012345")).toBe("https://relay.example.com");
    expect(normalizeRelayUrl("https://relay.example.com/bridge/abcdefghijklmnopqrstuvwxyz012345/")).toBe("https://relay.example.com");
    expect(normalizeRelayUrl("https://relay.example.com/mcp")).toBe("https://relay.example.com");
  });

  it("has to be https, but for a relay on this computer", () => {
    expect(normalizeRelayUrl("http://relay.example.com")).toBeNull();
    expect(normalizeRelayUrl("http://192.168.1.20:8787")).toBeNull();
    expect(normalizeRelayUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeRelayUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
    expect(normalizeRelayUrl("ftp://relay.example.com")).toBeNull();
    expect(normalizeRelayUrl("https://user:secret@relay.example.com")).toBeNull();
    expect(normalizeRelayUrl("")).toBeNull();
    expect(normalizeRelayUrl("https://")).toBeNull();
  });
});

describe("the key of a browser", () => {
  it("is 32 letters and digits the relay accepts, and another one each time", () => {
    const first = createRelayCode();
    const second = createRelayCode();
    expect(first).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(RELAY_CODE_PATTERN.test(first)).toBe(true);
    expect(isRelayCode(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("uses every random byte evenly: the ones past the last full round of 62 are thrown away", () => {
    // 248..255 would favour the first letters; a source that gives only those must never end.
    let calls = 0;
    const code = createRelayCode((values) => {
      calls += 1;
      values.fill(calls === 1 ? 255 : 61);
    });
    expect(calls).toBe(2);
    expect(code).toBe("9".repeat(32));
  });
});

describe("the settings as the browser keeps them", () => {
  const code = "abcdefghijklmnopqrstuvwxyz012345";

  it("are off with a new key when nothing is stored, or something broken", () => {
    expect(parseMcpRelaySettings(null, () => code)).toEqual({ enabled: false, url: "", code });
    expect(parseMcpRelaySettings("not json", () => code)).toEqual({ enabled: false, url: "", code });
    expect(parseMcpRelaySettings("[1]", () => code)).toEqual({ enabled: false, url: "", code });
    expect(parseMcpRelaySettings(JSON.stringify({ enabled: "yes", url: "http://relay.example.com", code: "short" }), () => code)).toEqual({ enabled: false, url: "", code });
  });

  it("come back as they were stored", () => {
    const stored = { enabled: true, url: "https://relay.example.com", code: "ZYXWVUTSRQPONMLKJIHGFEDCBA987654" };
    expect(parseMcpRelaySettings(JSON.stringify(stored), () => code)).toEqual(stored);
  });

  it("give the two addresses: where the editor asks, and what the AI app gets", () => {
    const settings = { url: "https://relay.example.com", code };
    expect(relayBridgeUrl(settings)).toBe(`https://relay.example.com/bridge/${code}`);
    expect(relayMcpUrl(settings)).toBe(`https://relay.example.com/mcp/${code}`);
    expect(relayMcpUrl({ url: "", code })).toBe("");
  });
});

describe("a file the AI asked to be saved in the browser", () => {
  const data = { format: "stl", fileName: "Tea tin.stl", bytes: 3, base64: "AQID" };

  it("is the bytes, the name, and the answer without the content", () => {
    const file = relayDownload({ download: true }, data)!;
    expect([...file.bytes]).toEqual([1, 2, 3]);
    expect(file.fileName).toBe("Tea tin.stl");
    expect(file.answer).toEqual({ format: "stl", fileName: "Tea tin.stl", bytes: 3, downloaded: true });
  });

  it("takes the name the AI gave, with the file's own ending and without any folder", () => {
    expect(relayDownload({ download: true, fileName: "lid" }, data)!.fileName).toBe("lid.stl");
    expect(relayDownload({ download: true, fileName: "lid.STL" }, data)!.fileName).toBe("lid.STL");
    expect(relayDownload({ download: true, fileName: "../../etc/passwd" }, data)!.fileName).toBe("passwd.stl");
    expect(relayDownload({ download: true, fileName: "C:\\Users\\me\\part" }, data)!.fileName).toBe("part.stl");
    expect(relayDownload({ download: true, fileName: "..." }, data)!.fileName).toBe("Tea tin.stl");
    expect(relayDownload({ download: true, fileName: 5 }, data)!.fileName).toBe("Tea tin.stl");
  });

  it("is nothing for a command that asked for no download or made no file", () => {
    expect(relayDownload({}, data)).toBeNull();
    expect(relayDownload({ download: false }, data)).toBeNull();
    expect(relayDownload({ download: true }, { objects: [] })).toBeNull();
    expect(relayDownload({ download: true }, undefined)).toBeNull();
  });
});
