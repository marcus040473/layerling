import { describe, expect, it } from "vitest";
// @ts-expect-error - the bridge is plain JavaScript and carries no types.
import { tools } from "../../scripts/layerling-mcp-tools.mjs";
import { ATTACHMENT_LIMITS, attachmentMaxBytes, projectAttachmentFromBytes } from "@/lib/projectAttachments";
import { ATTACHMENT_MCP_ACTIONS, attachmentMcpCommand, type AttachmentMcpContext } from "@/lib/projectAttachmentsMcp";
import type { ProjectAttachment } from "@/types/layerling";

/*
 * The attachments of a design through the AI bridge (#820, phase 3): the five commands move bytes as
 * base64, apply the panel's checks, and change nothing that would lose a file without a flag.
 */

const text = (content: string) => new TextEncoder().encode(content);
const base64 = (content: string | Uint8Array) => Buffer.from(typeof content === "string" ? text(content) : content).toString("base64");
const decoded = (value: string) => Buffer.from(value, "base64").toString("utf8");

/** A context over a list held here, as the editor holds its own; `saves` counts the changes it was handed. */
async function editorWith(...files: Array<[string, string]>) {
  let list: ProjectAttachment[] = [];
  for (const [name, content] of files) list.push(await projectAttachmentFromBytes(name, text(content)));
  const state = { saves: 0, list: () => list };
  const context: AttachmentMcpContext = {
    attachments: () => list,
    setAttachments: (next) => {
      list = next;
      state.saves += 1;
    },
  };
  const run = (action: string, params: Record<string, unknown> = {}) => attachmentMcpCommand(action, params, context) as Promise<Record<string, any>>;
  return { state, run };
}

describe("the attachment commands of the bridge", () => {
  it("has a tool for every command", () => {
    const names = (tools as Array<{ name: string }>).map((tool) => tool.name);
    for (const action of ATTACHMENT_MCP_ACTIONS) expect(names, action).toContain(`layerling_${action}`);
  });

  it("leaves every other action to the editor", async () => {
    const { run } = await editorWith();
    expect(await run("list_objects")).toBeUndefined();
  });
});

describe("listing and reading", () => {
  it("lists what the files are, never what they hold", async () => {
    const { run } = await editorWith(["notes.md", "# Notes"], ["parts.txt", "4 screws"]);
    const result = await run("list_attachments");
    expect(result.attachments.map((entry: { name: string }) => entry.name)).toEqual(["notes.md", "parts.txt"]);
    expect(result.attachments[0]).toEqual(expect.objectContaining({ mediaType: "text/markdown", bytes: 7 }));
    expect(result.attachments[0]).not.toHaveProperty("base64");
    expect(result.totalBytes).toBe(15);
    expect(result.limits).toEqual(ATTACHMENT_LIMITS);
  });

  it("gives a file's bytes as base64, found by id or by name in any case", async () => {
    const { run } = await editorWith(["Notes.md", "Grüße"]);
    const [{ id }] = (await run("list_attachments")).attachments;
    expect(decoded((await run("get_attachment", { id })).base64)).toBe("Grüße");
    expect(decoded((await run("get_attachment", { name: "notes.MD" })).base64)).toBe("Grüße");
  });

  it("asks for id or name, not both and not neither, and names a file that is not there", async () => {
    const { run } = await editorWith(["notes.md", "x"]);
    await expect(run("get_attachment")).rejects.toThrow(/either by id or by name/);
    await expect(run("get_attachment", { id: "a", name: "notes.md" })).rejects.toThrow(/either by id or by name/);
    await expect(run("get_attachment", { name: "other.md" })).rejects.toThrow(/No attachment named 'other.md'/);
  });
});

describe("adding", () => {
  it("adds a file and has the design saved", async () => {
    const { state, run } = await editorWith();
    const result = await run("add_attachment", { name: "parts-list.md", base64: base64("- 4 M3 screws") });
    expect(result).toEqual(expect.objectContaining({ replaced: false, unchanged: false }));
    expect(result.attachment).toEqual(expect.objectContaining({ name: "parts-list.md", bytes: 13 }));
    expect(state.saves).toBe(1);
  });

  it("accepts base64 wrapped over several lines", async () => {
    const { state, run } = await editorWith();
    const wrapped = base64("a".repeat(100)).replace(/(.{76})/g, "$1\n");
    await run("add_attachment", { name: "a.txt", base64: wrapped });
    expect(new TextDecoder().decode(state.list()[0].bytes)).toBe("a".repeat(100));
  });

  it("refuses a taken name unless replace is true, and replacing keeps the file's id and name", async () => {
    const { state, run } = await editorWith(["Notes.md", "old"], ["other.txt", "x"]);
    const before = state.list()[0];
    await expect(run("add_attachment", { name: "notes.md", base64: base64("new") })).rejects.toThrow(/already attached; pass replace: true/);
    expect(state.saves).toBe(0);

    const result = await run("add_attachment", { name: "notes.md", base64: base64("new"), replace: true });
    expect(result.replaced).toBe(true);
    expect(state.list()[0]).toEqual(expect.objectContaining({ id: before.id, name: "Notes.md" }));
    expect(new TextDecoder().decode(state.list()[0].bytes)).toBe("new");
    expect(state.list().map((entry) => entry.name)).toEqual(["Notes.md", "other.txt"]);
  });

  it("changes nothing when the same content comes again", async () => {
    const { state, run } = await editorWith(["notes.md", "same"]);
    const result = await run("add_attachment", { name: "notes.md", base64: base64("same"), replace: true });
    expect(result.unchanged).toBe(true);
    expect(state.saves).toBe(0);
  });

  it("applies the panel's checks and changes nothing when one fails", async () => {
    const { state, run } = await editorWith();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    await expect(run("add_attachment", { name: "photo.png", base64: base64(png) })).rejects.toThrow(/not a PNG file/);
    await expect(run("add_attachment", { name: "drawing.svg", base64: base64("<svg/>") })).rejects.toThrow(/not a type of file/);
    await expect(run("add_attachment", { name: "photo.txt", base64: base64(png) })).rejects.toThrow(/not plain UTF-8 text/);
    await expect(run("add_attachment", { name: "empty.md", base64: "" })).rejects.toThrow(/is empty/);
    await expect(run("add_attachment", { name: "../../notes.md", base64: base64("x") })).resolves.toEqual(
      expect.objectContaining({ attachment: expect.objectContaining({ name: "notes.md" }) }),
    );
    await expect(run("add_attachment", { name: "big.txt", base64: base64("a".repeat(ATTACHMENT_LIMITS.textBytes + 1)) })).rejects.toThrow(/larger than/);
    expect(state.list().map((entry) => entry.name)).toEqual(["notes.md"]);
  });

  it("refuses what is not base64, and a file past the limit before decoding it", async () => {
    const { run } = await editorWith();
    await expect(run("add_attachment", { name: "a.md", base64: "not base64!" })).rejects.toThrow(/not valid base64/);
    await expect(run("add_attachment", { name: "a.md" })).rejects.toThrow(/base64 is required/);
    await expect(run("add_attachment", { name: "a.md", base64: "A".repeat(Math.ceil(attachmentMaxBytes() / 3) * 4 + 4) })).rejects.toThrow(/larger than/);
  });

  it("keeps to the number of files a design may hold", async () => {
    const files = Array.from({ length: ATTACHMENT_LIMITS.files }, (_, index): [string, string] => [`file ${index}.txt`, "x"]);
    const { run } = await editorWith(...files);
    await expect(run("add_attachment", { name: "one more.txt", base64: base64("x") })).rejects.toThrow(`at most ${ATTACHMENT_LIMITS.files} attachments`);
  });
});

describe("renaming", () => {
  it("renames a file, keeping its id and content", async () => {
    const { state, run } = await editorWith(["notes.md", "content"]);
    const { id } = state.list()[0];
    const result = await run("rename_attachment", { id, newName: "assembly.md" });
    expect(result).toEqual(expect.objectContaining({ previousName: "notes.md" }));
    expect(state.list()[0]).toEqual(expect.objectContaining({ id, name: "assembly.md" }));
  });

  it("allows a change of case alone, and refuses a name another file has", async () => {
    const { state, run } = await editorWith(["notes.md", "a"], ["parts.md", "b"]);
    await run("rename_attachment", { name: "notes.md", newName: "Notes.md" });
    expect(state.list()[0].name).toBe("Notes.md");
    await expect(run("rename_attachment", { name: "notes.md", newName: "PARTS.md" })).rejects.toThrow(/already attached/);
  });

  it("checks a new extension against the content and the allowed types", async () => {
    const { run } = await editorWith(["notes.md", "a"]);
    await expect(run("rename_attachment", { name: "notes.md", newName: "notes.pdf" })).rejects.toThrow(/not a PDF file/);
    await expect(run("rename_attachment", { name: "notes.md", newName: "notes.svg" })).rejects.toThrow(/not a type of file/);
    await expect(run("rename_attachment", { name: "notes.md" })).rejects.toThrow(/newName is required/);
    await expect(run("rename_attachment", { name: "notes.md", newName: "notes.txt" })).resolves.toBeDefined();
  });
});

describe("removing", () => {
  it("removes a file only with confirm: true", async () => {
    const { state, run } = await editorWith(["notes.md", "a"], ["parts.txt", "b"]);
    await expect(run("remove_attachment", { name: "notes.md" })).rejects.toThrow(/cannot be undone; pass confirm: true/);
    expect(state.saves).toBe(0);
    const result = await run("remove_attachment", { name: "notes.md", confirm: true });
    expect(result).toEqual(expect.objectContaining({ remaining: 1 }));
    expect(state.list().map((entry) => entry.name)).toEqual(["parts.txt"]);
  });
});
