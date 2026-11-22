/**
 * The AI connection of a Layerling that is only a page in the browser.
 *
 * The MCP bridge needs a server beside the editor: the dev server on the user's computer, or a copy on
 * a NAS. A page on layerling.com or on static hosting has none, and a chat in the browser cannot start
 * the MCP server program. So the page can connect to a relay on the internet instead
 * (scripts/layerling-mcp-relay-core.mjs): it makes up a long random code, keeps asking the relay for
 * commands under it, and shows the user the address their AI app connects to.
 *
 * It is off until the user switches it on in the settings, and the code is the key: whoever has the
 * address can read and change the designs open in this browser. The choice, the relay and the code
 * belong to this browser, not to a design.
 */

export const MCP_RELAY_STORAGE_KEY = "layerling.mcp.relay";
/** Sent on window when the settings changed, so the editor connects anew. */
export const MCP_RELAY_CHANGED_EVENT = "layerling:mcp-relay-changed";
/** Sent on window when the connection to the relay came up or broke. */
export const MCP_RELAY_STATUS_EVENT = "layerling:mcp-relay-status";
/** The relay counts an editor as there while it asks for commands, so it says how it is less often than to the local bridge. */
export const MCP_RELAY_HEARTBEAT_MS = 15_000;

/** The relay whoever built this site offers, if any (NEXT_PUBLIC_LAYERLING_MCP_RELAY at build time). */
export const DEFAULT_MCP_RELAY_URL = normalizeRelayUrl(process.env.NEXT_PUBLIC_LAYERLING_MCP_RELAY ?? "") ?? "";

export type McpRelaySettings = {
  enabled: boolean;
  /** The relay's address without a slash at the end, or "" while none is set. */
  url: string;
  /** The key of this browser at the relay. */
  code: string;
};

export type McpRelayStatus = "off" | "connecting" | "connected" | "unreachable";

const CODE_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;
const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A relay address as it is used: https, no path beyond its own, no slash at the end. An address
 * pasted with /mcp/... or /bridge/... at the end is taken as the relay it belongs to. Plain http is
 * for a relay on this computer only - a page served over https may not talk to one anyway.
 */
export function normalizeRelayUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password) return null;
  const path = url.pathname.replace(/\/(mcp|bridge)(\/[^/]*)?\/?$/, "").replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/** A new key: 32 random letters and digits, about 190 bits. */
export function createRelayCode(random: (values: Uint8Array) => void = (values) => void globalThis.crypto.getRandomValues(values)): string {
  let code = "";
  // 62 letters do not divide 256, so the bytes past the last full round are thrown away rather than folded in unevenly.
  while (code.length < 32) {
    const values = new Uint8Array(48);
    random(values);
    for (const value of values) {
      if (value < 248 && code.length < 32) code += CODE_LETTERS[value % 62];
    }
  }
  return code;
}

export function isRelayCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

/** The settings as stored, made whole: anything missing or broken falls back to off, the site's relay and a new key. */
export function parseMcpRelaySettings(stored: string | null, makeCode: () => string = createRelayCode): McpRelaySettings {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(stored ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: start anew.
  }
  const url = typeof value.url === "string" ? normalizeRelayUrl(value.url) : null;
  return {
    enabled: value.enabled === true,
    url: url ?? DEFAULT_MCP_RELAY_URL,
    code: isRelayCode(value.code) ? value.code : makeCode(),
  };
}

/**
 * The settings of this browser. With `keep` a key made just now is stored, so the address the settings
 * page shows is the one that goes on working; the editor, which only looks whether the connection is
 * on, stores nothing for somebody who never opens that page.
 */
export function readMcpRelaySettings(keep = false): McpRelaySettings {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(MCP_RELAY_STORAGE_KEY);
  } catch {
    // Private browsing can block localStorage; the connection then lasts for this page only.
  }
  const settings = parseMcpRelaySettings(stored);
  if (keep && (!stored || !stored.includes(settings.code))) storeSettings(settings);
  return settings;
}

function storeSettings(settings: McpRelaySettings) {
  try {
    window.localStorage.setItem(MCP_RELAY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // See above.
  }
}

/** Stores the settings and tells the editor, which connects anew. */
export function writeMcpRelaySettings(settings: McpRelaySettings): McpRelaySettings {
  const next: McpRelaySettings = {
    enabled: settings.enabled && Boolean(settings.url),
    url: normalizeRelayUrl(settings.url) ?? "",
    code: isRelayCode(settings.code) ? settings.code : createRelayCode(),
  };
  storeSettings(next);
  window.dispatchEvent(new Event(MCP_RELAY_CHANGED_EVENT));
  return next;
}

/** Where the editor asks for commands. */
export function relayBridgeUrl(settings: Pick<McpRelaySettings, "url" | "code">) {
  return `${settings.url}/bridge/${settings.code}`;
}

/** The address the user gives their AI app. */
export function relayMcpUrl(settings: Pick<McpRelaySettings, "url" | "code">) {
  return settings.url ? `${settings.url}/mcp/${settings.code}` : "";
}

let currentStatus: McpRelayStatus = "off";

export function mcpRelayStatus() {
  return currentStatus;
}

export function setMcpRelayStatus(status: McpRelayStatus) {
  if (status === currentStatus) return;
  currentStatus = status;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MCP_RELAY_STATUS_EVENT));
}

/** A file name without any folder, so a name the AI sends cannot point anywhere. */
function plainFileName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim() ?? "";
  return name.replace(/^\.+/, "").slice(0, 120);
}

/**
 * A file the AI asked to be saved in the browser. Over the relay there is no computer to write to, so
 * a command sent with `download: true` whose answer carries a file (`base64` and `fileName`, as
 * export_mesh and save_project give) is saved by the browser instead: this returns the bytes to save,
 * the name, and the answer without the content. null for every other command.
 */
export function relayDownload(params: Record<string, unknown>, data: unknown): { fileName: string; bytes: Uint8Array<ArrayBuffer>; answer: Record<string, unknown> } | null {
  if (params.download !== true || !data || typeof data !== "object") return null;
  const { base64, ...rest } = data as Record<string, unknown>;
  if (typeof base64 !== "string") return null;
  const own = typeof rest.fileName === "string" ? rest.fileName : "layerling";
  const ending = /\.[A-Za-z0-9]+$/.exec(own)?.[0] ?? "";
  let fileName = plainFileName(params.fileName) || own;
  if (ending && !fileName.toLowerCase().endsWith(ending.toLowerCase())) fileName += ending;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { fileName, bytes, answer: { ...rest, fileName, downloaded: true } };
}
