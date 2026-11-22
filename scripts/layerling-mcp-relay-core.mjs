/**
 * The relay: Layerling in the browser and an AI client, with nothing installed on the computer.
 *
 * The MCP server (layerling-mcp-server.mjs) is a program the AI client starts on the user's own
 * computer, next to a Layerling that runs there. A Layerling that is only a page - layerling.com, a
 * copy on static hosting - has no server to carry commands to the editor, and a chat in the browser
 * cannot start a program. The relay is that missing piece, somewhere on the internet:
 *
 *   AI client  --  MCP over HTTP  -->  relay  <--  the editor page asks for commands  --  browser
 *
 * The editor page makes up a long random code and keeps asking the relay for commands under it
 * (/bridge/<code>, the same heartbeat, poll and result messages the local bridge uses). The user
 * gives the AI client the address /mcp/<code>. Whoever has the code can read and change the designs
 * open in that browser, so the code is the key: the relay never lists codes and keeps nothing - the
 * commands and answers pass through its memory and are gone.
 *
 * This file knows no server. It takes a web Request and gives a Response, so the same code runs
 * under Node (layerling-mcp-relay.mjs) and on Cloudflare Workers (relay/cloudflare).
 */
import { tools } from "./layerling-mcp-tools.mjs";
import { createToolCaller, textContent, toolResult } from "./layerling-mcp-server.mjs";

/** A code is 24 to 128 letters, digits, "-" or "_". The editor makes one of 32 random characters. */
export const RELAY_CODE_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;

const DEFAULTS = {
  /** An editor that has not asked for this long counts as closed. */
  staleMs: 45_000,
  /** How long one question for a command is held open. */
  pollTimeoutMs: 25_000,
  /** The longest a command may take, whatever the tool asks for. */
  maxCommandMs: 280_000,
  /** A code nothing has happened under for this long is forgotten. */
  roomIdleMs: 10 * 60_000,
  maxRooms: 2_000,
  maxEditorsPerRoom: 20,
  /** A line with nothing in it this often keeps a long tool call's connection from being cut. */
  keepAliveMs: 15_000,
};

const NO_EDITOR =
  "No Layerling editor is connected to this address. Ask the user to open Layerling in their browser, open Settings, AI connection, " +
  "switch it on and check that the address shown there is the one this connector uses. The tab has to stay open while you work.";

const INSTRUCTIONS =
  "These tools drive the Layerling editor the user has open in their browser: a 3D CAD for 3D printing. Lengths are millimetres. " +
  "Start with layerling_list_editors and layerling_read_scene to see what is there. Build step by step, and look at your work with " +
  "layerling_capture_image from two or three sides before you say it is done. The user watches the same editor and can change things " +
  "at any time, so read the scene again rather than trusting what you remember. Files (layerling_export_mesh, layerling_save_project) " +
  "are saved by the user's browser into their downloads folder; you cannot write to their computer. If no editor is connected, ask the " +
  "user to open Layerling and switch on Settings, AI connection.";

/** The tools as the relay offers them: no browser can be started from here, and files go to the browser's downloads. */
export function relayTools(source = tools) {
  return source
    .filter((tool) => tool.name !== "layerling_open_editor")
    .map((tool) => {
      if (tool.name === "layerling_list_editors") {
        return { ...tool, description: `${tool.description} These are the tabs of the one browser this address belongs to.` };
      }
      if (tool.name === "layerling_export_mesh") {
        const { path: _path, ...properties } = tool.inputSchema.properties;
        return {
          ...tool,
          description:
            `${tool.description} Over the browser connection there is no path: with download true (the default) the user's browser saves the file ` +
            "into its downloads folder and the answer carries no content and says downloaded; with download false the file comes back as base64.",
          inputSchema: {
            ...tool.inputSchema,
            properties: {
              ...properties,
              download: { type: "boolean", description: "Save the file in the user's browser (default true). false returns it as base64 instead, which is large." },
              fileName: { type: "string", description: "The name of the downloaded file. Defaults to the project's name with the format's ending." },
            },
          },
        };
      }
      if (tool.name === "layerling_save_project") {
        const { path: _path, overwrite: _overwrite, ...properties } = tool.inputSchema.properties;
        const { required: _required, ...schema } = tool.inputSchema;
        return {
          ...tool,
          description:
            "Save the whole editable design as a .lyl file, as the export window's Layerling project (.lyl) does: shapes, groups, sketches, CAD and imported assets, " +
            "settings, notes and the undo history as chosen. The user's browser saves the file into its downloads folder; you cannot choose a folder on their computer. " +
            "It does not change the file that Ctrl+S in the editor saves to. The answer gives the file name, the size in bytes and how many objects and history steps " +
            "the file holds. In the History view it saves the state shown.",
          inputSchema: {
            ...schema,
            properties: {
              ...properties,
              fileName: { type: "string", description: "The name of the downloaded file. Defaults to the project's name. A missing .lyl ending is added." },
            },
          },
        };
      }
      return tool;
    });
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value, most) {
  return typeof value === "string" ? value.slice(0, most) : "";
}

/** What an editor says about itself, cut to what the relay passes on; anything else it sent is dropped. */
function editorSummary(editor, now) {
  if (!isObject(editor)) return null;
  const editorId = text(editor.editorId, 100);
  const editorNumber = Number(editor.editorNumber);
  if (!editorId || !Number.isInteger(editorNumber) || editorNumber < 0 || editorNumber > 999_999) return null;
  return {
    editorId,
    editorNumber,
    projectId: typeof editor.projectId === "string" ? editor.projectId.slice(0, 100) : null,
    projectName: text(editor.projectName, 200),
    url: text(editor.url, 2_000),
    focused: editor.focused === true,
    shapeCount: Number.isFinite(editor.shapeCount) ? Number(editor.shapeCount) : 0,
    selectedCount: Number.isFinite(editor.selectedCount) ? Number(editor.selectedCount) : 0,
    notice: text(editor.notice, 500),
    lastError: typeof editor.lastError === "string" ? editor.lastError.slice(0, 2_000) : null,
    lastSeen: now,
  };
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `relay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** "https://layerling.com/" and "https://layerling.com" are the same site. */
function originOf(value) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * A relay. `handle(request)` answers one request. `allowedOrigins` limits which sites' editor pages
 * may connect (none given: any site, the code is the key either way).
 */
export function createRelay(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const allowedOrigins = (options.allowedOrigins ?? []).map(originOf).filter(Boolean);
  const now = options.now ?? Date.now;
  /** code -> room */
  const rooms = new Map();
  const offeredTools = relayTools();
  let lastSweep = 0;

  function settlePoll(room, editorId, waiter, command) {
    if (room.pollWaiters.get(editorId) !== waiter) return false;
    room.pollWaiters.delete(editorId);
    clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
    waiter.resolve(command);
    return true;
  }

  /** Forgets the editors of a room that stopped asking, and fails what was waiting for them. */
  function prune(room, current = now()) {
    for (const [editorId, editor] of room.editors) {
      if (room.pollWaiters.has(editorId) || current - editor.lastSeen <= settings.staleMs) continue;
      room.editors.delete(editorId);
      room.queues.delete(editorId);
      for (const [commandId, pending] of room.pending) {
        if (pending.editorId !== editorId) continue;
        clearTimeout(pending.timer);
        room.pending.delete(commandId);
        pending.resolve({ commandId, ok: false, error: `Layerling editor ${editor.editorNumber} is no longer open` });
      }
    }
  }

  /** Forgets the codes nothing happens under any more. */
  function sweep(force = false) {
    const current = now();
    if (!force && current - lastSweep < 30_000) return;
    lastSweep = current;
    for (const [code, room] of rooms) {
      prune(room, current);
      if (room.editors.size === 0 && room.pending.size === 0 && current - room.lastActive > settings.roomIdleMs) rooms.delete(code);
    }
  }

  function listEditors(room) {
    prune(room);
    return [...room.editors.values()].sort((a, b) => a.editorNumber - b.editorNumber);
  }

  function dispatch(room, { editorId, editorNumber, action, params, timeoutMs }) {
    prune(room);
    const editor =
      (editorId ? room.editors.get(editorId) : null) ??
      (typeof editorNumber === "number" ? [...room.editors.values()].find((candidate) => candidate.editorNumber === editorNumber) : null);
    if (!editor) {
      return Promise.resolve({ commandId: "", ok: false, error: typeof editorNumber === "number" ? `No open Layerling editor ${editorNumber}` : "No matching open Layerling editor" });
    }
    const command = { id: newId(), action, params, createdAt: now() };
    const waiter = room.pollWaiters.get(editor.editorId);
    if (!waiter || !settlePoll(room, editor.editorId, waiter, command)) {
      const queue = room.queues.get(editor.editorId) ?? [];
      queue.push(command);
      room.queues.set(editor.editorId, queue);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        room.pending.delete(command.id);
        resolve({ commandId: command.id, ok: false, error: `Timed out waiting for Layerling editor ${editor.editorNumber}` });
      }, Math.max(1_000, Math.min(timeoutMs, settings.maxCommandMs)));
      room.pending.set(command.id, { editorId: editor.editorId, resolve, timer });
    });
  }

  function createRoom(code) {
    const room = {
      code,
      editors: new Map(),
      queues: new Map(),
      pending: new Map(),
      pollWaiters: new Map(),
      lastActive: now(),
      callTool: null,
    };
    const bridgeGet = async () => ({ editors: listEditors(room) });
    const bridgeCommand = async (action, args = {}, defaultTimeoutMs = 15_000) => {
      const { editorNumber, editorId, timeoutMs, ...params } = args || {};
      let targetNumber = typeof editorNumber === "number" ? editorNumber : undefined;
      const targetId = typeof editorId === "string" ? editorId : undefined;
      if (!targetNumber && !targetId) {
        const editors = listEditors(room);
        if (editors.length === 0) throw new Error(NO_EDITOR);
        if (editors.length > 1) throw new Error("Provide editorNumber because multiple Layerling editors are open");
        targetNumber = editors[0].editorNumber;
      }
      const result = await dispatch(room, {
        editorId: targetId,
        editorNumber: targetNumber,
        action,
        params,
        timeoutMs: typeof timeoutMs === "number" ? timeoutMs : defaultTimeoutMs,
      });
      if (!result.ok) throw new Error(result.error || "The Layerling editor did not answer");
      return result.data;
    };
    const shared = createToolCaller({ bridgeGet, bridgeCommand });
    room.callTool = async (name, args = {}) => {
      if (name === "layerling_open_editor") {
        throw new Error("An editor cannot be opened from here. Ask the user to open Layerling in their browser and to switch on Settings, AI connection.");
      }
      if (name === "layerling_export_mesh") {
        // No path on the user's computer can be written from here: their browser saves the file, unless base64 is asked for.
        const { path: _path, download, ...rest } = args;
        return bridgeCommand("export_mesh", { ...rest, download: download !== false }, 180_000);
      }
      if (name === "layerling_save_project") {
        const { path: _path, overwrite: _overwrite, ...rest } = args;
        return bridgeCommand("save_project", { ...rest, download: true }, 180_000);
      }
      return shared(name, args);
    };
    return room;
  }

  /** The room of a code. Only an editor page makes one; an AI client asking under an unknown code finds no editor. */
  function roomOf(code, create) {
    let room = rooms.get(code);
    if (!room && create) {
      if (rooms.size >= settings.maxRooms) {
        sweep(true);
        if (rooms.size >= settings.maxRooms) return null;
      }
      room = createRoom(code);
      rooms.set(code, room);
    }
    if (room) room.lastActive = now();
    return room ?? null;
  }

  function corsHeaders(request) {
    const origin = request.headers.get("origin");
    return {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }

  function json(request, body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(request), ...headers },
    });
  }

  async function readJson(request) {
    try {
      return await request.json();
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------- the editor's side

  async function handleBridge(request, code) {
    if (allowedOrigins.length > 0) {
      const origin = originOf(request.headers.get("origin") ?? "");
      if (!origin || !allowedOrigins.includes(origin)) {
        return json(request, { error: "This relay does not accept editors of this site." }, 403);
      }
    }
    if (request.method !== "POST") return json(request, { error: "The editor's side of the relay takes POST only." }, 405, { Allow: "POST, OPTIONS" });
    const body = await readJson(request);
    if (!isObject(body) || typeof body.type !== "string") return json(request, { error: "Invalid relay request." }, 400);

    if (body.type === "heartbeat") {
      const editor = editorSummary(body.editor, now());
      if (!editor) return json(request, { error: "Invalid editor heartbeat." }, 400);
      const room = roomOf(code, true);
      if (!room) return json(request, { error: "The relay is full. Try again later." }, 503);
      prune(room);
      if (!room.editors.has(editor.editorId) && room.editors.size >= settings.maxEditorsPerRoom) {
        return json(request, { error: "Too many editor tabs are connected under this code." }, 429);
      }
      room.editors.set(editor.editorId, editor);
      room.queues.set(editor.editorId, room.queues.get(editor.editorId) ?? []);
      return json(request, { ok: true, editors: room.editors.size });
    }

    if (body.type === "poll") {
      if (typeof body.editorId !== "string") return json(request, { error: "Invalid editor poll." }, 400);
      const room = roomOf(code, false);
      // An editor the relay does not know (it started anew, or the editor was away too long) says so again first.
      if (!room || !room.editors.has(body.editorId)) return json(request, { command: null, unknown: true });
      const editorId = body.editorId;
      const editor = room.editors.get(editorId);
      room.editors.set(editorId, { ...editor, lastSeen: now() });
      const queued = room.queues.get(editorId)?.shift();
      if (queued) return json(request, { command: queued });
      if (request.signal?.aborted) return json(request, { command: null });
      const existing = room.pollWaiters.get(editorId);
      if (existing) settlePoll(room, editorId, existing, null);
      const command = await new Promise((resolve) => {
        const waiter = { resolve, signal: request.signal, timer: null, onAbort: null };
        waiter.timer = setTimeout(() => settlePoll(room, editorId, waiter, null), settings.pollTimeoutMs);
        waiter.onAbort = () => settlePoll(room, editorId, waiter, null);
        room.pollWaiters.set(editorId, waiter);
        request.signal?.addEventListener("abort", waiter.onAbort, { once: true });
      });
      const seen = room.editors.get(editorId);
      if (seen) room.editors.set(editorId, { ...seen, lastSeen: now() });
      return json(request, { command });
    }

    if (body.type === "bye") {
      // The user switched the connection off or closed the tab: the AI client hears it at once, not after the editor went stale.
      const room = roomOf(code, false);
      const editor = typeof body.editorId === "string" ? room?.editors.get(body.editorId) : null;
      if (room && editor) {
        room.editors.set(editor.editorId, { ...editor, lastSeen: 0 });
        const waiter = room.pollWaiters.get(editor.editorId);
        if (waiter) settlePoll(room, editor.editorId, waiter, null);
        prune(room);
      }
      return json(request, { ok: true });
    }

    if (body.type === "result") {
      const result = body.result;
      if (typeof body.editorId !== "string" || !isObject(result) || typeof result.commandId !== "string" || typeof result.ok !== "boolean") {
        return json(request, { error: "Invalid command result." }, 400);
      }
      const room = roomOf(code, false);
      const pending = room?.pending.get(result.commandId);
      if (!room || !pending || pending.editorId !== body.editorId) return json(request, { ok: false });
      clearTimeout(pending.timer);
      room.pending.delete(result.commandId);
      pending.resolve({ commandId: result.commandId, ok: result.ok, data: result.data, error: typeof result.error === "string" ? result.error : undefined });
      return json(request, { ok: true });
    }

    return json(request, { error: "Unknown relay request." }, 400);
  }

  // ---------------------------------------------------------------- the AI client's side

  async function callTool(code, name, args) {
    const room = roomOf(code, false);
    if (!room) {
      if (!offeredTools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
      if (name === "layerling_list_editors") return { editors: [] };
      throw new Error(NO_EDITOR);
    }
    return room.callTool(name, args);
  }

  /** One JSON-RPC message: its answer, or null for a notification, which gets none. */
  async function answer(code, message) {
    if (!isObject(message)) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
    const { id, method, params } = message;
    if (id === undefined || id === null) return null;
    const result = (value) => ({ jsonrpc: "2.0", id, result: value });
    try {
      if (method === "initialize") {
        return result({
          protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "layerling-mcp-relay", version: "0.1.0" },
          instructions: INSTRUCTIONS,
        });
      }
      if (method === "ping") return result({});
      if (method === "tools/list") return result({ tools: offeredTools });
      if (method === "tools/call") {
        if (typeof params?.name !== "string") return { jsonrpc: "2.0", id, error: { code: -32602, message: "Expected tool name" } };
        try {
          return result(toolResult(await callTool(code, params.name, isObject(params.arguments) ? params.arguments : {})));
        } catch (error) {
          return result({ isError: true, content: [textContent(error instanceof Error ? error.message : String(error))] });
        }
      }
      if (method === "resources/list") return result({ resources: [] });
      if (method === "resources/templates/list") return result({ resourceTemplates: [] });
      if (method === "prompts/list") return result({ prompts: [] });
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } };
    } catch (error) {
      return { jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } };
    }
  }

  /**
   * A tool call can take minutes (a print check, making a mesh exact). A connection with nothing on it
   * that long is cut by proxies on the way, so the answer goes out as an event stream with an empty
   * line every few seconds until it is there - the other form MCP over HTTP allows.
   */
  function eventStream(request, work) {
    const encoder = new TextEncoder();
    let timer = null;
    const body = new ReadableStream({
      start(controller) {
        const write = (chunk) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // The client went away; the command runs to its end in the editor all the same.
          }
        };
        timer = setInterval(() => write(": waiting for the editor\n\n"), settings.keepAliveMs);
        void work().then((payload) => {
          clearInterval(timer);
          write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        });
      },
      cancel() {
        clearInterval(timer);
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...corsHeaders(request) },
    });
  }

  async function handleMcp(request, code) {
    if (request.method !== "POST") {
      return json(request, { error: "This is the address an AI client (MCP) connects to. It answers POST only." }, 405, { Allow: "POST, OPTIONS" });
    }
    const body = await readJson(request);
    if (body === undefined) return json(request, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    const messages = Array.isArray(body) ? body : [body];
    const many = Array.isArray(body);
    const work = async () => {
      const answers = (await Promise.all(messages.map((message) => answer(code, message)))).filter(Boolean);
      return many ? answers : answers[0];
    };
    const expectsAnswer = messages.some((message) => isObject(message) && message.id !== undefined && message.id !== null);
    if (!expectsAnswer) {
      await work();
      return new Response(null, { status: 202, headers: corsHeaders(request) });
    }
    const slow = messages.some((message) => isObject(message) && message.method === "tools/call");
    if (slow && (request.headers.get("accept") ?? "").includes("text/event-stream")) return eventStream(request, work);
    return json(request, await work());
  }

  async function handle(request) {
    sweep();
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (parts.length === 0 || (parts.length === 1 && parts[0] === "health")) {
      return json(request, { name: "layerling-mcp-relay", ok: true, about: "Connects Layerling in the browser with an AI client. See the Layerling guide, chapter AI with MCP." });
    }
    // The code is the last part of the address, or the Bearer token for a client that keeps keys out of addresses.
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
    const code = parts.length === 2 ? parts[1] : parts.length === 1 ? bearer : undefined;
    if ((parts[0] === "mcp" || parts[0] === "bridge") && parts.length <= 2) {
      if (!code || !RELAY_CODE_PATTERN.test(code)) {
        return json(request, { error: "The address needs the code Layerling shows under Settings, AI connection." }, 404);
      }
      return parts[0] === "mcp" ? handleMcp(request, code) : handleBridge(request, code);
    }
    return json(request, { error: "Not found." }, 404);
  }

  return {
    handle,
    /** How many codes have an editor right now; for the operator's log, never for a client. */
    roomCount: () => rooms.size,
  };
}
