import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATTACHMENT_LIMITS,
  ATTACHMENT_TYPES,
  AttachmentError,
  attachmentAcceptList,
  attachmentFileProblem,
  attachmentListProblem,
  attachmentMaxBytes,
  attachmentProblemText,
  attachmentNameProblem,
  attachmentTypeForFileName,
  attachmentView,
  attachmentsFormatVersion,
  cleanAttachmentName,
  findAttachmentByName,
  freeAttachmentName,
  projectAttachmentFromBytes,
  withAttachmentAdded,
  withAttachmentRemoved,
  withAttachmentReplaced,
} from "@/lib/projectAttachments";
import type { ProjectAttachment } from "@/types/layerling";

/*
 * Files kept with a design (#820): what may be attached, how a name is kept clean and free, and the
 * limits of one file and of the whole list.
 */

const text = (content: string) => new TextEncoder().encode(content);

async function attachment(name: string, content = "hello") {
  return projectAttachmentFromBytes(name, text(content));
}

describe("which files may be attached", () => {
  it("accepts Markdown and plain text, whatever the case of the extension", () => {
    expect(attachmentTypeForFileName("notes.md")?.mediaType).toBe("text/markdown");
    expect(attachmentTypeForFileName("Parts List.TXT")?.mediaType).toBe("text/plain");
    expect(attachmentAcceptList()).toBe(".md,.txt,.png,.jpg,.jpeg,.webp,.pdf");
  });

  it("refuses other types, a name without an extension, and an extension alone", () => {
    for (const name of ["drawing.svg", "anim.gif", "photo.heic", "page.html", "script.js", "README", ".md", "notes.md.exe"]) {
      expect(attachmentFileProblem(name, text("x")), name).not.toBeNull();
    }
    expect(attachmentNameProblem(".md")).toBe("name");
    expect(attachmentNameProblem("README")).toBe("name");
    expect(attachmentNameProblem("drawing.svg")).toBe("type");
  });

  it("refuses an empty file and one over the size limit, and accepts one of exactly the limit", () => {
    expect(attachmentFileProblem("a.txt", new Uint8Array())).toBe("empty");
    expect(attachmentFileProblem("a.txt", new Uint8Array(ATTACHMENT_LIMITS.textBytes + 1).fill(97))).toBe("tooBig");
    expect(attachmentFileProblem("a.txt", new Uint8Array(ATTACHMENT_LIMITS.textBytes).fill(97))).toBeNull();
  });

  it("refuses a file that is not text under a text name", () => {
    expect(attachmentFileProblem("a.md", new Uint8Array([0x23, 0x00, 0x41]))).toBe("notText");
    expect(attachmentFileProblem("a.txt", new Uint8Array([0xff, 0xfe, 0x41]))).toBe("notText");
    expect(attachmentFileProblem("a.txt", text("Größe 20 mm - 日本語"))).toBeNull();
  });
});

describe("pictures and PDF", () => {
  const bytes = (...values: number[]) => new Uint8Array([...values, 1, 2, 3, 4]);
  const ascii = (value: string) => Array.from(value, (char) => char.charCodeAt(0));
  const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
  const WEBP = bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"));
  const PDF = bytes(...ascii("%PDF-1.7"));

  afterEach(() => vi.unstubAllGlobals());

  it("refuses a picture whose first bytes are right but which the browser cannot decode", async () => {
    // The browser's decoder, as a stand-in: it refuses everything but the real picture.
    const real = PNG;
    const close = vi.fn();
    const decode = vi.fn(async (blob: Blob) => {
      const content = new Uint8Array(await blob.arrayBuffer());
      if (content.length !== real.length || content.some((byte, index) => byte !== real[index])) throw new Error("InvalidStateError");
      return { width: 1, height: 1, close };
    });
    vi.stubGlobal("createImageBitmap", decode);
    await expect(projectAttachmentFromBytes("photo.png", real)).resolves.toEqual(expect.objectContaining({ name: "photo.png" }));
    expect(close).toHaveBeenCalledOnce();
    // A real header with garbage, or with a script, behind it.
    const garbage = new Uint8Array([...PNG.slice(0, 8), ...ascii("<script>alert(1)</script>")]);
    await expect(projectAttachmentFromBytes("photo.png", garbage)).rejects.toThrow(/not a PNG file/);
    // The decoder is handed the type from the table, and only pictures go to it.
    expect(decode.mock.calls.map(([blob]) => (blob as Blob).type)).toEqual(["image/png", "image/png"]);
    await projectAttachmentFromBytes("datasheet.pdf", PDF);
    await projectAttachmentFromBytes("notes.md", new TextEncoder().encode("# Notes"));
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("accepts each type by its signature, and the type goes by the extension", () => {
    for (const [name, content, mediaType] of [["a.png", PNG, "image/png"], ["a.JPG", JPEG, "image/jpeg"], ["a.jpeg", JPEG, "image/jpeg"], ["a.webp", WEBP, "image/webp"], ["a.pdf", PDF, "application/pdf"]] as const) {
      expect(attachmentFileProblem(name, content), name).toBeNull();
      expect(attachmentTypeForFileName(name)?.mediaType, name).toBe(mediaType);
    }
  });

  it("refuses a file whose content is not what its extension says", () => {
    expect(attachmentFileProblem("a.png", JPEG)).toBe("content");
    expect(attachmentFileProblem("a.jpg", PNG)).toBe("content");
    expect(attachmentFileProblem("a.webp", bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")))).toBe("content");
    expect(attachmentFileProblem("a.pdf", text("<html>%PDF-</html>"))).toBe("content");
    expect(attachmentFileProblem("a.png", text("MZ program"))).toBe("content");
    // A picture renamed to text is not text either.
    expect(attachmentFileProblem("a.txt", PNG)).toBe("notText");
  });

  it("shows pictures in the viewer and Markdown and text as before, but no PDF", () => {
    expect(attachmentView({ mediaType: "image/png" })).toBe("image");
    expect(attachmentView({ mediaType: "image/jpeg" })).toBe("image");
    expect(attachmentView({ mediaType: "image/webp" })).toBe("image");
    expect(attachmentView({ mediaType: "application/pdf" })).toBeUndefined();
  });

  it("needs format version 4 only when a picture or a PDF is among the files", () => {
    expect(attachmentsFormatVersion([])).toBeUndefined();
    expect(attachmentsFormatVersion([{ mediaType: "text/markdown", byteLength: 10 }, { mediaType: "text/plain", byteLength: 10 }])).toBe(3);
    expect(attachmentsFormatVersion([{ mediaType: "text/markdown", byteLength: 10 }, { mediaType: "application/pdf", byteLength: 10 }])).toBe(4);
    // Text past the limits of version 3 (16 files, 8 MB), which a layerling of that version would refuse as broken.
    expect(attachmentsFormatVersion(Array.from({ length: 16 }, () => ({ mediaType: "text/plain", byteLength: 10 })))).toBe(3);
    expect(attachmentsFormatVersion(Array.from({ length: 17 }, () => ({ mediaType: "text/plain", byteLength: 10 })))).toBe(4);
    expect(attachmentsFormatVersion(Array.from({ length: 5 }, () => ({ mediaType: "text/plain", byteLength: 2 * 1024 * 1024 })))).toBe(4);
    for (const type of ATTACHMENT_TYPES) expect([3, 4], type.extension).toContain(type.formatVersion);
  });
});

describe("names", () => {
  it("cleans a name: no folders, no control characters, single spaces, a length limit that keeps the extension", () => {
    expect(cleanAttachmentName("C:\\Users\\me\\notes.md")).toBe("notes.md");
    expect(cleanAttachmentName("../../etc/notes.txt")).toBe("notes.txt");
    expect(cleanAttachmentName("  my \t\n notes\u0000.md ")).toBe("my notes.md");
    const long = cleanAttachmentName(`${"a".repeat(300)}.md`);
    expect(long).toHaveLength(ATTACHMENT_LIMITS.nameLength);
    expect(long.endsWith("a.md")).toBe(true);
  });

  it("finds a name without regard to case", async () => {
    const list = [await attachment("Notes.MD")];
    expect(findAttachmentByName(list, "notes.md")?.name).toBe("Notes.MD");
    expect(findAttachmentByName(list, "other.md")).toBeUndefined();
    expect(attachmentNameProblem("NOTES.md", ["notes.MD"])).toBe("nameTaken");
  });

  it("offers the first free name, numbering before the extension", async () => {
    const list = [await attachment("notes.md"), await attachment("notes 2.md"), await attachment("Notes 3.md")];
    expect(freeAttachmentName([], "notes.md")).toBe("notes.md");
    expect(freeAttachmentName(list, "other.md")).toBe("other.md");
    expect(freeAttachmentName(list, "notes.md")).toBe("notes 4.md");
    expect(freeAttachmentName(list, "NOTES.MD")).toBe("NOTES 4.MD");
  });

  it("a name that is not clean is a name problem, and a clean one of an allowed type is none", () => {
    expect(attachmentNameProblem("my  notes.md")).toBe("name");
    expect(attachmentNameProblem("folder/notes.md")).toBe("name");
    expect(attachmentNameProblem("my notes.md")).toBeNull();
  });
});

describe("making an attachment", () => {
  it("reads the type from the content check and keeps its own copy of the bytes", async () => {
    const bytes = text("# Parts\n- 4 screws");
    const made = await projectAttachmentFromBytes("../Parts.MD", bytes);
    expect(made.name).toBe("Parts.MD");
    expect(made.mediaType).toBe("text/markdown");
    expect(made.byteLength).toBe(bytes.byteLength);
    expect(made.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(made.id).toMatch(/^attachment-/);
    bytes[0] = 0x58;
    expect(made.bytes[0]).toBe(0x23);
  });

  it("gives the same hash for the same bytes and a different one for others", async () => {
    expect((await attachment("a.txt", "same")).sha256).toBe((await attachment("b.txt", "same")).sha256);
    expect((await attachment("a.txt", "same")).sha256).not.toBe((await attachment("a.txt", "other")).sha256);
  });

  it("throws an AttachmentError that names the problem", async () => {
    const error = await projectAttachmentFromBytes("scan.svg", text("x")).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AttachmentError);
    expect((error as AttachmentError).problem).toBe("type");
    expect((error as AttachmentError).message).toContain("scan.svg");
  });
});

describe("the list of attachments", () => {
  it("adds, replaces in place keeping the id, and removes", async () => {
    const first = await attachment("a.md", "one");
    const second = await attachment("b.txt", "two");
    let list: readonly ProjectAttachment[] = withAttachmentAdded(withAttachmentAdded([], first), second);
    expect(list.map((entry) => entry.name)).toEqual(["a.md", "b.txt"]);

    const replacement = await attachment("a.md", "three three");
    list = withAttachmentReplaced(list, first.id, replacement);
    expect(list.map((entry) => entry.name)).toEqual(["a.md", "b.txt"]);
    expect(list[0].id).toBe(first.id);
    expect(list[0].byteLength).toBe("three three".length);

    expect(withAttachmentRemoved(list, first.id).map((entry) => entry.name)).toEqual(["b.txt"]);
  });

  it("will not add a name that is taken, and will not replace into another file's name", async () => {
    const first = await attachment("a.md");
    const second = await attachment("b.md");
    expect(() => withAttachmentAdded([first], renamed(second, "A.MD"))).toThrow(/already attached/);
    expect(() => withAttachmentReplaced([first, second], second.id, renamed(second, "a.md"))).toThrow(/already attached/);
    expect(() => withAttachmentReplaced([first, second], first.id, renamed(first, "A.md"))).not.toThrow();
  });

  it("gives each kind of file the size its use needs: text small, a photo or a scan larger", () => {
    const pdf = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(Array.from("%PDF-", (char) => char.charCodeAt(0)));
      return bytes;
    };
    const jpeg = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set([0xff, 0xd8, 0xff]);
      return bytes;
    };
    expect(ATTACHMENT_LIMITS.pictureBytes).toBeGreaterThan(ATTACHMENT_LIMITS.textBytes);
    expect(ATTACHMENT_LIMITS.pdfBytes).toBeGreaterThan(ATTACHMENT_LIMITS.pictureBytes);
    expect(attachmentFileProblem("photo.jpg", jpeg(ATTACHMENT_LIMITS.pictureBytes))).toBeNull();
    expect(attachmentFileProblem("photo.jpg", jpeg(ATTACHMENT_LIMITS.pictureBytes + 1))).toBe("tooBig");
    expect(attachmentFileProblem("scan.pdf", pdf(ATTACHMENT_LIMITS.pdfBytes))).toBeNull();
    expect(attachmentFileProblem("scan.pdf", pdf(ATTACHMENT_LIMITS.pdfBytes + 1))).toBe("tooBig");
    // The message names the limit of the file's own type.
    expect(attachmentProblemText("tooBig", "notes.md")).toBe(`'notes.md' is larger than ${ATTACHMENT_LIMITS.textBytes / (1024 * 1024)} MB`);
    expect(attachmentProblemText("tooBig", "scan.pdf")).toBe(`'scan.pdf' is larger than ${ATTACHMENT_LIMITS.pdfBytes / (1024 * 1024)} MB`);
    expect(attachmentMaxBytes()).toBe(ATTACHMENT_LIMITS.pdfBytes);
    // Pictures and PDF files are packed as they are; text is compressed.
    expect(ATTACHMENT_TYPES.filter((type) => type.compressed).map((type) => type.extension)).toEqual(["png", "jpg", "jpeg", "webp", "pdf"]);
  });

  it("holds at most ATTACHMENT_LIMITS.files files and totalBytes together, and counts a replacement by its difference", async () => {
    const files: ProjectAttachment[] = [];
    for (let index = 0; index < ATTACHMENT_LIMITS.files; index += 1) files.push(await attachment(`f${index}.txt`));
    expect(attachmentListProblem(files)).toBeNull();
    await expect(async () => withAttachmentAdded(files, await attachment("one-more.txt"))).rejects.toThrow(`at most ${ATTACHMENT_LIMITS.files}`);

    // The largest files there are, PDF files at their limit, as many as fit into the total.
    const big = new Uint8Array(ATTACHMENT_LIMITS.pdfBytes);
    big.set(Array.from("%PDF-", (char) => char.charCodeAt(0)));
    const fitting = ATTACHMENT_LIMITS.totalBytes / ATTACHMENT_LIMITS.pdfBytes;
    const full = await Promise.all(Array.from({ length: fitting }, (_unused, index) => projectAttachmentFromBytes(`big${index}.pdf`, big)));
    expect(attachmentListProblem(full)).toBeNull();
    const total = new RegExp(`${ATTACHMENT_LIMITS.totalBytes / (1024 * 1024)} MB`);
    const extra = await projectAttachmentFromBytes("extra.pdf", big);
    expect(attachmentListProblem([...full, extra])).toEqual({ problem: "tooMuch" });
    expect(() => withAttachmentAdded(full, extra)).toThrow(total);
    // A bigger file in place of a small one only counts what it adds.
    const small = await attachment("small.pdf", "%PDF-x");
    const grown = await projectAttachmentFromBytes("small.pdf", big);
    expect(() => withAttachmentReplaced([...full, small], small.id, grown)).toThrow(total);
    expect(() => withAttachmentReplaced([...full.slice(1), small], small.id, grown)).not.toThrow();
  });

  it("finds a list's problem by name before it counts", async () => {
    const one = await attachment("a.md");
    expect(attachmentListProblem([one, { ...one, id: "other", name: "A.md" }])).toEqual({ problem: "nameTaken", fileName: "A.md" });
    expect(attachmentListProblem([{ ...one, name: "a/b.md" }])).toEqual({ problem: "name", fileName: "a/b.md" });
  });
});

/** The same attachment under another name, for the list tests. */
function renamed(source: ProjectAttachment, name: string): ProjectAttachment {
  return { ...source, name };
}
