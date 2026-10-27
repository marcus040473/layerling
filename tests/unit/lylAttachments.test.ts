import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { editorHistoryEntry } from "@/lib/editorHistory";
import {
  exportLylProject,
  importLylProject,
  inspectLylProjectPackage,
  LYL_ATTACHMENTS_FORMAT_VERSION,
  LYL_FILE_TYPES_FORMAT_VERSION,
  LYL_FORMAT_VERSION,
  LYL_MINIMUM_READER_VERSION,
  withLylProjectName,
  type LylProjectDocumentV1,
} from "@/lib/lylProject";
import { ATTACHMENT_LIMITS, projectAttachmentFromBytes } from "@/lib/projectAttachments";
import { sha256Hex } from "@/lib/projectAssets";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { ProjectAttachment, WorkplaneShape } from "@/types/layerling";

/*
 * Files kept with a design (#820) in the `.lyl` package: a design with some is a version 3 file that an
 * older layerling refuses, a design without any stays a version 2 file, and what comes back from a
 * package is what went in.
 */

const box: WorkplaneShape = { id: "b", name: "Box", kind: "box", color: "#123456", x: 0, z: 0, size: 20, width: 20, depth: 20, height: 10, rotation: 0 };

const text = (content: string) => new TextEncoder().encode(content);
/** The smallest bytes that pass for a PNG picture and a PDF: their signature and a little more. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = text("%PDF-1.7\n%%EOF\n");

/** The compression method of each entry of a ZIP archive, from its central directory: 0 stored, 8 deflate. */
function compressionMethods(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const methods: Record<string, number> = {};
  for (let offset = 0; offset + 46 <= bytes.length; offset++) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    methods[strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength))] = view.getUint16(offset + 10, true);
  }
  return methods;
}

async function design(attachments?: ProjectAttachment[]) {
  return exportLylProject({
    projectId: "design-1",
    projectName: "With files",
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_100_000,
    shapes: [box],
    history: [editorHistoryEntry([box], [])],
    historyIndex: 0,
    assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
    ...(attachments ? { attachments } : {}),
  });
}

async function withFiles() {
  return design([
    await projectAttachmentFromBytes("Assembly.md", text("# Assembly\n1. Print the parts\n2. Screw them together")),
    await projectAttachmentFromBytes("parts list.txt", text("4 x M3 screw\n2 x O-ring")),
  ]);
}

function read(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return { files, document: JSON.parse(strFromU8(files["project.json"])) as LylProjectDocumentV1 };
}

function mutate(bytes: Uint8Array, change: (document: LylProjectDocumentV1, files: Record<string, Uint8Array>) => void) {
  const { files, document } = read(bytes);
  change(document, files);
  files["project.json"] = strToU8(JSON.stringify(document));
  return zipSync(files);
}

describe("attachments in a .lyl package", () => {
  it("brings back the files it was given, with names, types and bytes, in order", async () => {
    const restored = await importLylProject(await withFiles());
    expect(restored.attachments?.map((entry) => entry.name)).toEqual(["Assembly.md", "parts list.txt"]);
    expect(restored.attachments?.map((entry) => entry.mediaType)).toEqual(["text/markdown", "text/plain"]);
    expect(strFromU8(restored.attachments?.[0].bytes ?? new Uint8Array())).toBe("# Assembly\n1. Print the parts\n2. Screw them together");
    expect(restored.attachments?.[1].byteLength).toBe(text("4 x M3 screw\n2 x O-ring").byteLength);
    expect(restored.attachments?.[1].sha256).toBe(await sha256Hex(text("4 x M3 screw\n2 x O-ring")));
    expect(restored.shapes).toHaveLength(1);
  });

  it("keeps the ids, so a file stays the same file through saving and opening", async () => {
    const first = await importLylProject(await withFiles());
    const second = await importLylProject(await design(first.attachments));
    expect(second.attachments?.map((entry) => entry.id)).toEqual(first.attachments?.map((entry) => entry.id));
  });

  it("stores each file as an attachment asset and lists it under its own name", async () => {
    const { files, document } = read(await withFiles());
    const assets = document.assets.filter((asset) => asset.kind === "attachment");
    expect(assets.map((asset) => asset.path)).toEqual(assets.map((asset) => `assets/attachment/${asset.sha256}.${asset.mediaType === "text/markdown" ? "md" : "txt"}`));
    expect(assets.every((asset) => files[asset.path])).toBe(true);
    expect(document.attachments?.map((entry) => entry.fileName)).toEqual(["Assembly.md", "parts list.txt"]);
  });

  it("stores the same bytes once, however many names they have", async () => {
    const bytes = text("same words");
    const { document } = read(await design([
      await projectAttachmentFromBytes("a.txt", bytes),
      await projectAttachmentFromBytes("b.txt", bytes),
    ]));
    expect(document.attachments?.map((entry) => entry.fileName)).toEqual(["a.txt", "b.txt"]);
    expect(document.assets.filter((asset) => asset.kind === "attachment")).toHaveLength(1);
  });

  it("writes a design with files as version 3, which an older layerling refuses", async () => {
    const { document } = read(await withFiles());
    expect(document.formatVersion).toBe(LYL_ATTACHMENTS_FORMAT_VERSION);
    expect(document.minimumReaderVersion).toBe(LYL_ATTACHMENTS_FORMAT_VERSION);
    expect(LYL_ATTACHMENTS_FORMAT_VERSION).toBeGreaterThan(LYL_FORMAT_VERSION);
    expect((await inspectLylProjectPackage(await withFiles())).formatVersion).toBe(LYL_ATTACHMENTS_FORMAT_VERSION);
  });

  it("writes a design without files exactly as before: version 2, no list, no attachment assets", async () => {
    for (const bytes of [await design(), await design([])]) {
      const { document } = read(bytes);
      expect(document.formatVersion).toBe(LYL_FORMAT_VERSION);
      expect(document.minimumReaderVersion).toBe(LYL_MINIMUM_READER_VERSION);
      expect("attachments" in document).toBe(false);
      expect(document.assets.some((asset) => asset.kind === "attachment")).toBe(false);
      expect((await importLylProject(bytes)).attachments).toBeUndefined();
    }
  });

  it("stays version 3 while a file is left and goes back to version 2 when the last one is removed", async () => {
    const restored = await importLylProject(await withFiles());
    expect(read(await design(restored.attachments?.slice(0, 1))).document.formatVersion).toBe(LYL_ATTACHMENTS_FORMAT_VERSION);
    expect(read(await design([])).document.formatVersion).toBe(LYL_FORMAT_VERSION);
  });

  it("writes a design with a picture or a PDF as version 4, and brings the bytes back exactly", async () => {
    const png = await projectAttachmentFromBytes("photo.png", PNG);
    const pdf = await projectAttachmentFromBytes("datasheet.pdf", PDF);
    const notes = await projectAttachmentFromBytes("notes.md", text("# Notes"));
    const bytes = await design([notes, png, pdf]);
    const { document, files } = read(bytes);
    expect(document.formatVersion).toBe(LYL_FILE_TYPES_FORMAT_VERSION);
    expect(document.minimumReaderVersion).toBe(LYL_FILE_TYPES_FORMAT_VERSION);
    expect(Object.keys(files).filter((path) => path.startsWith("assets/attachment/")).map((path) => path.split(".").pop()).sort()).toEqual(["md", "pdf", "png"]);
    // The picture and the PDF are compressed already and go in as they are (method 0); the text is deflated (8).
    const methods = Object.fromEntries(Object.entries(compressionMethods(bytes)).filter(([path]) => path.startsWith("assets/attachment/")).map(([path, method]) => [path.split(".").pop(), method]));
    expect(methods).toEqual({ md: 8, pdf: 0, png: 0 });
    const restored = await importLylProject(bytes);
    expect(restored.attachments?.map((entry) => [entry.name, entry.mediaType, entry.sha256])).toEqual([notes, png, pdf].map((entry) => [entry.name, entry.mediaType, entry.sha256]));
    // Text alone keeps a design at version 3, so it still opens in the layerling that brought attachments.
    expect(read(await design([notes])).document.formatVersion).toBe(LYL_ATTACHMENTS_FORMAT_VERSION);
  });

  it("refuses a version 3 package that carries a picture", async () => {
    const bytes = await design([await projectAttachmentFromBytes("photo.png", PNG)]);
    await expect(importLylProject(mutate(bytes, (document) => {
      document.formatVersion = 3;
      document.minimumReaderVersion = 3;
    }))).rejects.toThrow(/does not carry PNG attachments/);
  });

  it("writes more text files than version 3 held as version 4, and refuses them as version 3", async () => {
    const many = await Promise.all(Array.from({ length: 17 }, (_unused, index) => projectAttachmentFromBytes(`note ${index}.txt`, text("x"))));
    const bytes = await design(many);
    expect(read(bytes).document.formatVersion).toBe(LYL_FILE_TYPES_FORMAT_VERSION);
    expect((await importLylProject(bytes)).attachments).toHaveLength(17);
    await expect(importLylProject(mutate(bytes, (document) => {
      document.formatVersion = 3;
      document.minimumReaderVersion = 3;
    }))).rejects.toThrow(/does not carry this many attachments/);
  });

  it("survives a rename on the start page", async () => {
    const renamed = await withLylProjectName(await withFiles(), "Another name");
    expect((await inspectLylProjectPackage(renamed)).projectName).toBe("Another name");
    expect((await importLylProject(renamed)).attachments?.map((entry) => entry.name)).toEqual(["Assembly.md", "parts list.txt"]);
  });

  it("refuses to write a list it would refuse to open", async () => {
    const one = await projectAttachmentFromBytes("a.md", text("x"));
    await expect(design([one, { ...one, id: "second", name: "A.MD" }])).rejects.toThrow(/already attached/);
    await expect(design([{ ...one, name: "folder/a.md" }])).rejects.toThrow(/no usable name/);
    await expect(design([{ ...one, name: "a.svg" }])).rejects.toThrow(/not a type of file/);
    const many = await Promise.all(Array.from({ length: ATTACHMENT_LIMITS.files + 1 }, (_unused, index) => projectAttachmentFromBytes(`f${index}.txt`, text("x"))));
    await expect(design(many)).rejects.toThrow(`at most ${ATTACHMENT_LIMITS.files}`);
  });
});

describe("a package whose attachments are wrong is refused whole", () => {
  it("refuses a list in a package of a version that has none", async () => {
    const bytes = mutate(await withFiles(), (document) => {
      document.formatVersion = LYL_FORMAT_VERSION;
      document.minimumReaderVersion = LYL_MINIMUM_READER_VERSION;
    });
    await expect(importLylProject(bytes)).rejects.toThrow(/does not carry attachments/);
  });

  it("refuses a file that is missing, changed, or not what its name says", async () => {
    const missing = mutate(await withFiles(), (_document, files) => {
      const path = Object.keys(files).find((name) => name.startsWith("assets/attachment/") && name.endsWith(".md")) as string;
      delete files[path];
    });
    await expect(importLylProject(missing)).rejects.toThrow(/Missing asset/);

    const changed = mutate(await withFiles(), (_document, files) => {
      const path = Object.keys(files).find((name) => name.startsWith("assets/attachment/") && name.endsWith(".md")) as string;
      files[path] = text("# Something else");
    });
    await expect(importLylProject(changed)).rejects.toThrow(/invalid size|integrity/);

    const wrongName = mutate(await withFiles(), (document) => {
      (document.attachments as NonNullable<typeof document.attachments>)[0].fileName = "Assembly.txt";
    });
    await expect(importLylProject(wrongName)).rejects.toThrow(/does not match the type of its file/);
  });

  it("refuses a file that is not text, even when its size and hash are right", async () => {
    const binary = new Uint8Array([0x61, 0x00, 0x62]);
    const hash = await sha256Hex(binary);
    const bytes = mutate(await withFiles(), (document, files) => {
      const asset = document.assets.find((entry) => entry.kind === "attachment" && entry.mediaType === "text/plain") as NonNullable<typeof document.assets[number]>;
      asset.byteLength = binary.byteLength;
      asset.sha256 = hash;
      files[asset.path] = binary;
    });
    await expect(importLylProject(bytes)).rejects.toThrow(/not plain UTF-8 text/);
  });

  it("refuses an unknown type, a list that is not a list, a repeated id, a name taken twice and a missing asset", async () => {
    await expect(importLylProject(mutate(await withFiles(), (document) => {
      document.assets.find((asset) => asset.kind === "attachment")!.mediaType = "image/svg+xml";
    }))).rejects.toThrow(/cannot be attached/);

    await expect(importLylProject(mutate(await withFiles(), (document) => {
      (document as unknown as { attachments: unknown }).attachments = { id: "x" };
    }))).rejects.toThrow(/must be a list/);

    await expect(importLylProject(mutate(await withFiles(), (document) => {
      const list = document.attachments as NonNullable<typeof document.attachments>;
      list[1].id = list[0].id;
    }))).rejects.toThrow(/Duplicate attachment ID/);

    await expect(importLylProject(mutate(await withFiles(), (document) => {
      const list = document.attachments as NonNullable<typeof document.attachments>;
      list[1].fileName = "ASSEMBLY.MD";
      list[1].assetId = list[0].assetId;
    }))).rejects.toThrow(/already attached/);

    await expect(importLylProject(mutate(await withFiles(), (document) => {
      (document.attachments as NonNullable<typeof document.attachments>)[0].assetId = "nothing";
    }))).rejects.toThrow(/missing its file/);

    await expect(importLylProject(mutate(await withFiles(), (document) => {
      document.attachments = [{ id: "x", fileName: "a.md", assetId: document.assets.find((asset) => asset.kind !== "attachment")?.id ?? "none" }];
    }))).rejects.toThrow(/missing its file/);
  });

  it("refuses a name with a folder in it, and a list over the limits", async () => {
    await expect(importLylProject(mutate(await withFiles(), (document) => {
      (document.attachments as NonNullable<typeof document.attachments>)[0].fileName = "../Assembly.md";
    }))).rejects.toThrow(/no usable name/);

    await expect(importLylProject(mutate(await withFiles(), (document) => {
      const list = document.attachments as NonNullable<typeof document.attachments>;
      for (let index = 0; index < ATTACHMENT_LIMITS.files; index += 1) list.push({ id: `extra-${index}`, fileName: `extra ${index}.md`, assetId: list[0].assetId });
    }))).rejects.toThrow(`at most ${ATTACHMENT_LIMITS.files}`);
  });
});
