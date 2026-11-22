import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";
// @ts-expect-error a plain .mjs module
import { createToolCaller } from "../../scripts/layerling-mcp-server.mjs";

/*
 * The MCP server is two things since the relay shares its tools: a program an AI client starts and
 * talks to on stdin and stdout, and a module the relay imports for what each tool does with the bridge.
 * Started as a program it must still answer; imported it must not read stdin.
 */

const script = join(__dirname, "..", "..", "scripts", "layerling-mcp-server.mjs");

describe("the MCP server as a program", () => {
  it("answers on stdout what it is asked on stdin", async () => {
    const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "ignore"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    child.stdin.end();
    await closed;
    const answers = output.trim().split("\n").map((line) => JSON.parse(line) as { id: number; result: { serverInfo?: { name: string }; tools?: Array<{ name: string }> } });
    expect(answers.find((answer) => answer.id === 1)?.result.serverInfo?.name).toBe("layerling-mcp");
    const names = answers.find((answer) => answer.id === 2)?.result.tools?.map((tool) => tool.name) ?? [];
    expect(names).toContain("layerling_open_editor");
    expect(names).toContain("layerling_create_shape");
  }, 30_000);
});

describe("the MCP server's tools for another bridge", () => {
  it("sends each tool's command to the bridge it was given", async () => {
    const sent: Array<{ action: string; args: unknown; timeout: unknown }> = [];
    const callTool = createToolCaller({
      bridgeGet: async () => ({ editors: [{ editorNumber: 7 }] }),
      bridgeCommand: async (action: string, args: unknown, timeout: unknown) => {
        sent.push({ action, args, timeout });
        return { done: action };
      },
    });
    expect(await callTool("layerling_list_editors", {})).toEqual({ editors: [{ editorNumber: 7 }] });
    expect(await callTool("layerling_read_scene", { editorNumber: 7 })).toEqual({ done: "get_scene" });
    expect(await callTool("layerling_make_exact", { id: "a" })).toEqual({ done: "make_exact" });
    expect(sent).toEqual([
      { action: "get_scene", args: { editorNumber: 7 }, timeout: undefined },
      { action: "make_exact", args: { id: "a" }, timeout: 260000 },
    ]);
    await expect(callTool("layerling_no_such_tool", {})).rejects.toThrow("Unknown tool");
  });
});
