import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
// @ts-expect-error a plain .mjs module
import { createRelay, relayTools, RELAY_CODE_PATTERN } from "../../scripts/layerling-mcp-relay-core.mjs";
// @ts-expect-error a plain .mjs module
import { startRelayServer } from "../../scripts/layerling-mcp-relay.mjs";
// @ts-expect-error a plain .mjs module
import { tools } from "../../scripts/layerling-mcp-tools.mjs";

/*
 * The relay connects a Layerling that is only a page in the browser with an AI client: the editor page
 * asks it for commands under a code it made up, the AI client sends them to /mcp/<code>. These tests
 * play both sides against the relay itself, with no server in between.
 */

type Relay = { handle: (request: Request) => Promise<Response>; roomCount: () => number };
type Tool = { name: string; description: string; inputSchema: { properties: Record<string, unknown>; required?: string[] } };
type Command = { id: string; action: string; params: Record<string, unknown> };

const CODE = "abcdefghijklmnopqrstuvwxyz012345";
const OTHER = "ZYXWVUTSRQPONMLKJIHGFEDCBA987654";
const BASE = "https://relay.example";

const editor = (patch: Record<string, unknown> = {}) => ({
  editorId: "editor-1",
  editorNumber: 12345,
  projectId: null,
  projectName: "Tea tin",
  url: "https://layerling.example/?editor=1",
  focused: true,
  shapeCount: 0,
  selectedCount: 0,
  notice: "",
  lastError: null,
  ...patch,
});

function post(relay: Relay, path: string, body: unknown, headers: Record<string, string> = {}) {
  return relay.handle(new Request(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));
}

async function bridge(relay: Relay, body: unknown, code = CODE, headers: Record<string, string> = {}) {
  const response = await post(relay, `/bridge/${code}`, body, headers);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

let nextId = 0;
async function rpc(relay: Relay, method: string, params?: unknown, code = CODE, headers: Record<string, string> = {}) {
  nextId += 1;
  const response = await post(relay, `/mcp/${code}`, { jsonrpc: "2.0", id: nextId, method, params }, headers);
  return ((await response.json()) as { result: Record<string, unknown> }).result;
}

type ToolAnswer = { isError?: boolean; content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };
const callTool = (relay: Relay, name: string, args: Record<string, unknown> = {}, code = CODE) =>
  rpc(relay, "tools/call", { name, arguments: args }, code) as unknown as Promise<ToolAnswer>;

/** The editor's side for one command: asks for it, and answers with what `reply` makes of it. */
async function serveOne(relay: Relay, reply: (command: Command) => unknown, editorId = "editor-1", code = CODE) {
  const { body } = await bridge(relay, { type: "poll", editorId }, code);
  const command = body.command as Command;
  await bridge(relay, { type: "result", editorId, result: { commandId: command.id, ok: true, data: reply(command) } }, code);
  return command;
}

describe("the tools the relay offers", () => {
  const offered = relayTools() as Tool[];
  const byName = (name: string) => offered.find((tool) => tool.name === name)!;

  it("offers every tool but the one that starts a browser on the computer", () => {
    expect(offered.map((tool) => tool.name)).toEqual((tools as Tool[]).map((tool) => tool.name).filter((name) => name !== "layerling_open_editor"));
  });

  it("offers a download instead of a path on the user's computer", () => {
    const exported = byName("layerling_export_mesh");
    expect(exported.inputSchema.properties).not.toHaveProperty("path");
    expect(exported.inputSchema.properties).toHaveProperty("download");
    expect(exported.inputSchema.properties).toHaveProperty("format");
    const saved = byName("layerling_save_project");
    expect(saved.inputSchema.properties).not.toHaveProperty("path");
    expect(saved.inputSchema.properties).not.toHaveProperty("overwrite");
    expect(saved.inputSchema.required).toBeUndefined();
    expect(saved.inputSchema.properties).toHaveProperty("history");
    expect(saved.description).toContain("downloads folder");
  });

  it("leaves the tools of the MCP server for Node as they were", () => {
    const local = (tools as Tool[]).find((tool) => tool.name === "layerling_export_mesh")!;
    expect(local.inputSchema.properties).toHaveProperty("path");
  });
});

describe("the relay towards the AI client", () => {
  it("answers the MCP handshake and lists the tools without any editor", async () => {
    const relay = createRelay() as Relay;
    const init = await rpc(relay, "initialize", { protocolVersion: "2025-06-18" });
    expect(init.protocolVersion).toBe("2025-06-18");
    expect(init.capabilities).toEqual({ tools: {} });
    expect(String(init.instructions)).toContain("AI connection");
    const list = await rpc(relay, "tools/list");
    expect((list.tools as Tool[]).length).toBe((tools as Tool[]).length - 1);
    expect(await rpc(relay, "ping")).toEqual({});
    // Asking made no room: only an editor page does.
    expect(relay.roomCount()).toBe(0);
  });

  it("takes a notification without answering it", async () => {
    const relay = createRelay() as Relay;
    const response = await post(relay, `/mcp/${CODE}`, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("says what to do when no editor is connected", async () => {
    const relay = createRelay() as Relay;
    const scene = await callTool(relay, "layerling_read_scene");
    expect(scene.isError).toBe(true);
    expect(scene.content[0].text).toContain("No Layerling editor is connected");
    expect(scene.content[0].text).toContain("AI connection");
    const editors = await callTool(relay, "layerling_list_editors");
    expect(JSON.parse(editors.content[0].text!)).toEqual({ editors: [] });
    const unknown = await callTool(relay, "layerling_no_such_tool");
    expect(unknown.isError).toBe(true);
  });

  it("does not start a browser", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const opened = await callTool(relay, "layerling_open_editor");
    expect(opened.isError).toBe(true);
    expect(opened.content[0].text).toContain("cannot be opened from here");
  });

  it("refuses an address without a proper code, and anything but POST", async () => {
    const relay = createRelay() as Relay;
    expect(RELAY_CODE_PATTERN.test(CODE)).toBe(true);
    expect((await post(relay, "/mcp/short", {})).status).toBe(404);
    expect((await post(relay, "/mcp", {})).status).toBe(404);
    expect((await post(relay, "/elsewhere", {})).status).toBe(404);
    const get = await relay.handle(new Request(`${BASE}/mcp/${CODE}`));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toContain("POST");
    const garbage = await relay.handle(new Request(`${BASE}/mcp/${CODE}`, { method: "POST", body: "{" }));
    expect(garbage.status).toBe(400);
  });

  it("takes the code as a Bearer token too, for a client that keeps keys out of addresses", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const response = await post(relay, "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "layerling_list_editors", arguments: {} } }, { Authorization: `Bearer ${CODE}` });
    const answer = (await response.json()) as { result: ToolAnswer };
    expect(JSON.parse(answer.result.content[0].text!).editors).toHaveLength(1);
  });

  it("answers a browser's preflight, so an editor page on another site may ask", async () => {
    const relay = createRelay() as Relay;
    const response = await relay.handle(new Request(`${BASE}/bridge/${CODE}`, { method: "OPTIONS", headers: { Origin: "https://layerling.example" } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://layerling.example");
    expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type");
  });
});

describe("a command on its way through the relay", () => {
  it("reaches the editor and brings its answer back", async () => {
    const relay = createRelay() as Relay;
    expect((await bridge(relay, { type: "heartbeat", editor: editor() })).body).toEqual({ ok: true, editors: 1 });
    const editors = JSON.parse((await callTool(relay, "layerling_list_editors")).content[0].text!);
    expect(editors.editors[0]).toMatchObject({ editorNumber: 12345, projectName: "Tea tin" });

    const call = callTool(relay, "layerling_create_shape", { kind: "box", width: 60 });
    const command = await serveOne(relay, () => ({ object: { id: "box-1" } }));
    expect(command.action).toBe("create_shape");
    expect(command.params).toEqual({ kind: "box", width: 60 });
    const answer = await call;
    expect(answer.isError).toBeUndefined();
    expect(JSON.parse(answer.content[0].text!)).toEqual({ object: { id: "box-1" } });
  });

  it("hands a waiting editor the command at once", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const waiting = bridge(relay, { type: "poll", editorId: "editor-1" });
    const call = callTool(relay, "layerling_list_objects");
    const command = (await waiting).body.command as Command;
    expect(command.action).toBe("list_objects");
    await bridge(relay, { type: "result", editorId: "editor-1", result: { commandId: command.id, ok: true, data: { objects: [] } } });
    expect(JSON.parse((await call).content[0].text!)).toEqual({ objects: [] });
  });

  it("passes the editor's error on as the tool's error", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const call = callTool(relay, "layerling_delete_objects", { ids: ["nothing"] });
    const { body } = await bridge(relay, { type: "poll", editorId: "editor-1" });
    const command = body.command as Command;
    await bridge(relay, { type: "result", editorId: "editor-1", result: { commandId: command.id, ok: false, error: "No such object" } });
    const answer = await call;
    expect(answer.isError).toBe(true);
    expect(answer.content[0].text).toBe("No such object");
  });

  it("gives a picture of the view back as an image", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const call = callTool(relay, "layerling_capture_image", { face: "top" });
    await serveOne(relay, () => ({ face: "top", bytesApprox: 3, dataUrl: "data:image/png;base64,AAAA" }));
    const answer = await call;
    expect(answer.content[1]).toEqual({ type: "image", data: "AAAA", mimeType: "image/png" });
  });

  it("has the browser save an exported file, since no path on the computer can be written", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });

    const exported = callTool(relay, "layerling_export_mesh", { format: "3mf", path: "C:/print/part.3mf" });
    expect((await serveOne(relay, () => ({ fileName: "part.3mf", downloaded: true }))).params).toEqual({ format: "3mf", download: true });
    await exported;

    const asBase64 = callTool(relay, "layerling_export_mesh", { download: false });
    expect((await serveOne(relay, () => ({ base64: "AAAA" }))).params).toEqual({ download: false });
    await asBase64;

    const saved = callTool(relay, "layerling_save_project", { path: "/home/me/x.lyl", overwrite: true, history: "all" });
    const command = await serveOne(relay, () => ({ fileName: "x.lyl", downloaded: true }));
    expect(command.action).toBe("save_project");
    expect(command.params).toEqual({ history: "all", download: true });
    await saved;
  });

  it("wants the editor's number once two tabs are open", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    await bridge(relay, { type: "heartbeat", editor: editor({ editorId: "editor-2", editorNumber: 22222 }) });
    const unclear = await callTool(relay, "layerling_read_scene");
    expect(unclear.content[0].text).toContain("Provide editorNumber");
    const call = callTool(relay, "layerling_read_scene", { editorNumber: 22222 });
    const command = await serveOne(relay, () => ({ shapeCount: 0 }), "editor-2");
    expect(command.action).toBe("get_scene");
    // The target is the relay's business; the editor gets the command's own values only.
    expect(command.params).toEqual({});
    await call;
  });

  it("answers a tool call as an event stream to a client that takes one, so a long call is not cut", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const pending = post(relay, `/mcp/${CODE}`, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "layerling_list_objects", arguments: {} } }, { Accept: "application/json, text/event-stream" });
    await serveOne(relay, () => ({ objects: [] }));
    const response = await pending;
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const data = (await response.text()).split("\n").find((line) => line.startsWith("data: "))!;
    expect(JSON.parse(data.slice(6))).toMatchObject({ jsonrpc: "2.0", id: 7 });
    // The handshake stays plain JSON.
    const init = await post(relay, `/mcp/${CODE}`, { jsonrpc: "2.0", id: 8, method: "initialize" }, { Accept: "application/json, text/event-stream" });
    expect(init.headers.get("content-type")).toContain("application/json");
  });
});

describe("who the relay lets at an editor", () => {
  it("keeps the editors of one code away from another code", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const editors = JSON.parse((await callTool(relay, "layerling_list_editors", {}, OTHER)).content[0].text!);
    expect(editors).toEqual({ editors: [] });
    const scene = await callTool(relay, "layerling_read_scene", { editorNumber: 12345 }, OTHER);
    expect(scene.isError).toBe(true);
    // And nothing was put in the queue of the editor under the right code.
    const call = callTool(relay, "layerling_list_objects");
    expect((await serveOne(relay, () => ({ objects: [] }))).action).toBe("list_objects");
    await call;
  });

  it("takes an answer only from the editor the command went to", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    await bridge(relay, { type: "heartbeat", editor: editor({ editorId: "editor-2", editorNumber: 22222 }) });
    const call = callTool(relay, "layerling_list_objects", { editorNumber: 12345 });
    const { body } = await bridge(relay, { type: "poll", editorId: "editor-1" });
    const command = body.command as Command;
    const forged = await bridge(relay, { type: "result", editorId: "editor-2", result: { commandId: command.id, ok: true, data: { forged: true } } });
    expect(forged.body).toEqual({ ok: false });
    const fromOtherCode = await bridge(relay, { type: "result", editorId: "editor-1", result: { commandId: command.id, ok: true, data: { forged: true } } }, OTHER);
    expect(fromOtherCode.body).toEqual({ ok: false });
    await bridge(relay, { type: "result", editorId: "editor-1", result: { commandId: command.id, ok: true, data: { objects: [] } } });
    expect(JSON.parse((await call).content[0].text!)).toEqual({ objects: [] });
  });

  it("limits the sites whose editors may connect, when told to", async () => {
    const relay = createRelay({ allowedOrigins: ["https://layerling.example/"] }) as Relay;
    const stranger = await bridge(relay, { type: "heartbeat", editor: editor() }, CODE, { Origin: "https://evil.example" });
    expect(stranger.status).toBe(403);
    const none = await bridge(relay, { type: "heartbeat", editor: editor() });
    expect(none.status).toBe(403);
    expect(relay.roomCount()).toBe(0);
    const own = await bridge(relay, { type: "heartbeat", editor: editor() }, CODE, { Origin: "https://layerling.example" });
    expect(own.status).toBe(200);
    // The AI client is no page of a site and is let in by the code alone.
    expect(JSON.parse((await callTool(relay, "layerling_list_editors")).content[0].text!).editors).toHaveLength(1);
  });

  it("drops what an editor says about itself beyond what the relay passes on", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor({ secret: "x", projectName: "n".repeat(500) }) });
    const listed = JSON.parse((await callTool(relay, "layerling_list_editors")).content[0].text!).editors[0];
    expect(listed).not.toHaveProperty("secret");
    expect(listed.projectName).toHaveLength(200);
    expect((await bridge(relay, { type: "heartbeat", editor: { editorNumber: 5 } })).status).toBe(400);
  });
});

describe("editors that come and go", () => {
  it("forgets an editor that said goodbye, and tells the AI client at once", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const call = callTool(relay, "layerling_list_objects");
    const { body } = await bridge(relay, { type: "poll", editorId: "editor-1" });
    expect((body.command as Command).action).toBe("list_objects");
    await bridge(relay, { type: "bye", editorId: "editor-1" });
    const answer = await call;
    expect(answer.isError).toBe(true);
    expect(answer.content[0].text).toContain("no longer open");
    expect((await callTool(relay, "layerling_read_scene")).content[0].text).toContain("No Layerling editor is connected");
  });

  it("forgets an editor that stopped asking", async () => {
    let now = 1_000_000;
    const relay = createRelay({ now: () => now, staleMs: 45_000 }) as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    now += 44_000;
    expect(JSON.parse((await callTool(relay, "layerling_list_editors")).content[0].text!).editors).toHaveLength(1);
    now += 2_000;
    expect(JSON.parse((await callTool(relay, "layerling_list_editors")).content[0].text!).editors).toHaveLength(0);
  });

  it("tells an editor it does not know to say who it is", async () => {
    const relay = createRelay() as Relay;
    expect((await bridge(relay, { type: "poll", editorId: "editor-1" })).body).toEqual({ command: null, unknown: true });
  });

  it("lets a question for a command go after its time, with nothing", async () => {
    const relay = createRelay({ pollTimeoutMs: 20 }) as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    expect((await bridge(relay, { type: "poll", editorId: "editor-1" })).body).toEqual({ command: null });
  });

  it("gives up on an editor that does not answer in time", async () => {
    const relay = createRelay() as Relay;
    await bridge(relay, { type: "heartbeat", editor: editor() });
    const answer = await callTool(relay, "layerling_list_objects", { timeoutMs: 1_000 });
    expect(answer.isError).toBe(true);
    expect(answer.content[0].text).toContain("Timed out waiting for Layerling editor 12345");
  });
});

describe("the relay as a program for Node", () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
    server = null;
  });

  it("serves the same relay over http", async () => {
    const started: Server = startRelayServer({ port: 0, host: "127.0.0.1" });
    server = started;
    await new Promise<void>((resolve) => started.once("listening", () => resolve()));
    const base = `http://127.0.0.1:${(started.address() as AddressInfo).port}`;
    const send = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    expect(await (await fetch(`${base}/`)).json()).toMatchObject({ name: "layerling-mcp-relay", ok: true });
    await send(`/bridge/${CODE}`, { type: "heartbeat", editor: editor() });
    const call = send(`/mcp/${CODE}`, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "layerling_read_scene", arguments: {} } });
    const { command } = (await (await send(`/bridge/${CODE}`, { type: "poll", editorId: "editor-1" })).json()) as { command: Command };
    expect(command.action).toBe("get_scene");
    await send(`/bridge/${CODE}`, { type: "result", editorId: "editor-1", result: { commandId: command.id, ok: true, data: { shapeCount: 2 } } });
    const answer = (await (await call).json()) as { result: ToolAnswer };
    expect(JSON.parse(answer.result.content[0].text!)).toEqual({ shapeCount: 2 });
  });
});
