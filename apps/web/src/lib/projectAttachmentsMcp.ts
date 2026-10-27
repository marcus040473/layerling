import {
  ATTACHMENT_LIMITS,
  AttachmentError,
  attachmentMaxBytes,
  attachmentNameProblem,
  attachmentProblemText,
  cleanAttachmentName,
  findAttachmentByName,
  projectAttachmentFromBytes,
  withAttachmentAdded,
  withAttachmentRemoved,
  withAttachmentReplaced,
} from "@/lib/projectAttachments";
import type { ProjectAttachment } from "@/types/layerling";

/*
 * The attachments of a design for the AI bridge (#820, phase 3): what an MCP client can do with the
 * files kept in a design, and nothing more than the attachments panel lets a person do.
 *
 *   layerling_list_attachments    the files: id, name, type, size
 *   layerling_get_attachment      one file's bytes, as base64
 *   layerling_add_attachment      a file from base64; `replace: true` to overwrite one of the same name
 *   layerling_rename_attachment   another name for a file, same content and id
 *   layerling_remove_attachment   a file taken out, with `confirm: true`
 *
 * The tools move bytes and nothing else. They do not decode text, page through it, pick a free name or
 * read and write files on a disk: the agent on the other end does that with its own tools, and a tool
 * that does less is easier to trust. Base64 is how JSON carries bytes; it also means a later file type
 * (a picture, a PDF) needs no change here.
 *
 * Safe by default, which is the point of most of what follows:
 *   - Every file goes through `projectAttachments.ts`, the same checks the panel and the `.lyl` format use
 *     (allowed types, the content check of each type, sizes, the number of files, clean names). This module
 *     adds no rules of its own that could drift from them.
 *   - Nothing changes by accident. Attachments are not in the undo history, so whatever would lose a file
 *     asks for a flag: `replace: true` to overwrite one, `confirm: true` to remove one. Without it the call
 *     fails and the design is as it was.
 *   - There is no `path`. A tool that read files from the computer would let an agent that was talked into
 *     it (a prompt hidden in a web page, say) copy any text file - a key, a `.env` - into a design that may
 *     then be saved to a shared server folder. The agent hands over the bytes itself, where its user sees it.
 *   - What a file says is the user's data. The tool descriptions say so, so that an agent reading one does not
 *     take its text for instructions.
 *
 * Like `historyViewMcp.ts`, the module takes what it needs from the editor as a small context and holds no
 * state, which is what lets `tests/unit/projectAttachmentsMcp.test.ts` run it without a browser.
 */

/** The bridge commands this module answers. */
export const ATTACHMENT_MCP_ACTIONS = ["list_attachments", "get_attachment", "add_attachment", "rename_attachment", "remove_attachment"] as const;

/** The ones that only read, and so still work while the History view is open (as Download does in the panel). */
export const ATTACHMENT_MCP_READ_ACTIONS: readonly string[] = ["list_attachments", "get_attachment"];

/** What the attachment commands need from the editor. */
export type AttachmentMcpContext = {
  /** The design's files as they are now. */
  attachments: () => readonly ProjectAttachment[];
  /** Keeps a new list and has the design saved, as the panel's changes are (`updateProjectAttachments`). */
  setAttachments: (next: ProjectAttachment[]) => void;
};

// ---------------------------------------------------------------------------------------------
// Bytes and base64
// ---------------------------------------------------------------------------------------------

/**
 * The most base64 characters the largest file that may be attached can take (`attachmentMaxBytes`, a
 * PDF): four characters for every three bytes, rounded up. The file's own type limit is checked after. Anything longer is refused before it is decoded, so a huge string never
 * turns into a huge buffer only to be thrown away.
 */
const MAX_BASE64_LENGTH = Math.ceil(attachmentMaxBytes() / 3) * 4;

/** Plain base64 (A-Z, a-z, 0-9, + and /), padded with "=" to a multiple of four. */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * The bytes a base64 text stands for. Line breaks and spaces are dropped first, since some tools wrap
 * base64 at 76 characters. Throws an `Error` that says what is wrong, never a bare `atob` exception.
 */
function bytesFromBase64(base64: string, fileName: string) {
  const compact = base64.replace(/\s+/g, "");
  if (compact.length > MAX_BASE64_LENGTH) throw new AttachmentError("tooBig", fileName);
  if (!BASE64_PATTERN.test(compact)) throw new Error("base64 is not valid base64 (A-Z, a-z, 0-9, + and /, padded with =)");
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Bytes as base64. `String.fromCharCode` is fed in slices, because spreading two megabytes into one call
 * goes past the number of arguments a JavaScript engine accepts (the `save_project` command does the same).
 */
function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

// ---------------------------------------------------------------------------------------------
// Reading the parameters
// ---------------------------------------------------------------------------------------------

/** A required text parameter, trimmed; throws naming the parameter when it is missing or empty. */
function requiredString(params: Record<string, unknown>, key: string, hint: string) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required: ${hint}`);
  return value.trim();
}

/**
 * The attachment a call is about, given by `id` or by `name` (not both, so a call cannot mean two files).
 * A name is compared the way the panel compares them, without regard to upper and lower case.
 */
function targetAttachment(attachments: readonly ProjectAttachment[], params: Record<string, unknown>) {
  const hasId = typeof params.id === "string" && params.id.trim() !== "";
  const hasName = typeof params.name === "string" && params.name.trim() !== "";
  if (hasId === hasName) throw new Error("Give the attachment either by id or by name, as layerling_list_attachments lists them");
  const found = hasId
    ? attachments.find((attachment) => attachment.id === (params.id as string).trim())
    : findAttachmentByName(attachments, (params.name as string).trim());
  if (!found) throw new Error(`No attachment ${hasId ? `with id '${(params.id as string).trim()}'` : `named '${(params.name as string).trim()}'`}; layerling_list_attachments lists them`);
  return found;
}

/** What a call reports about one file: everything but the bytes. */
function summary(attachment: ProjectAttachment) {
  return { id: attachment.id, name: attachment.name, mediaType: attachment.mediaType, bytes: attachment.byteLength, sha256: attachment.sha256 };
}

/** The list as `list_attachments` and the scene give it. */
export function attachmentMcpList(attachments: readonly ProjectAttachment[]) {
  return attachments.map(summary);
}

// ---------------------------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------------------------

/**
 * Runs one attachment command and returns its answer. Returns undefined for any other action, which the
 * editor then runs itself. A refusal is thrown as an `Error` (an `AttachmentError` for the checks of
 * `projectAttachments.ts`), which the bridge hands back to the agent as the tool's error text.
 */
export async function attachmentMcpCommand(action: string, params: Record<string, unknown>, context: AttachmentMcpContext): Promise<unknown> {
  const attachments = context.attachments();

  if (action === "list_attachments") {
    return {
      attachments: attachmentMcpList(attachments),
      totalBytes: attachments.reduce((total, attachment) => total + attachment.byteLength, 0),
      limits: ATTACHMENT_LIMITS,
    };
  }

  if (action === "get_attachment") {
    const attachment = targetAttachment(attachments, params);
    return { ...summary(attachment), base64: base64FromBytes(attachment.bytes) };
  }

  if (action === "add_attachment") {
    const name = requiredString(params, "name", "the file name with its extension, e.g. parts-list.md");
    if (typeof params.base64 !== "string") throw new Error("base64 is required: the file's bytes as base64");
    // The name is checked before the content, so a wrong type is refused without decoding anything.
    const problem = attachmentNameProblem(cleanAttachmentName(name));
    if (problem) throw new AttachmentError(problem, name);
    const bytes = bytesFromBase64(params.base64, name);
    const existing = findAttachmentByName(attachments, cleanAttachmentName(name));

    if (existing && params.replace !== true) {
      throw new Error(`${attachmentProblemText("nameTaken", existing.name)}; pass replace: true to overwrite it, or choose another name`);
    }
    if (existing) {
      // As the panel's Replace: the file keeps its place, its id and the name it has, and takes the new content.
      const replacement = await projectAttachmentFromBytes(existing.name, bytes, existing.id);
      if (replacement.sha256 === existing.sha256) return { attachment: summary(existing), replaced: false, unchanged: true };
      context.setAttachments(withAttachmentReplaced(attachments, existing.id, replacement));
      return { attachment: summary(replacement), replaced: true, unchanged: false };
    }
    const attachment = await projectAttachmentFromBytes(name, bytes);
    context.setAttachments(withAttachmentAdded(attachments, attachment));
    return { attachment: summary(attachment), replaced: false, unchanged: false };
  }

  if (action === "rename_attachment") {
    const attachment = targetAttachment(attachments, params);
    const newName = cleanAttachmentName(requiredString(params, "newName", "the new file name with its extension"));
    // The file's own name does not count as taken, so a change of case alone ("notes.md" to "Notes.md") is allowed.
    const others = attachments.filter((entry) => entry.id !== attachment.id).map((entry) => entry.name);
    const problem = attachmentNameProblem(newName, others);
    if (problem) throw new AttachmentError(problem, newName);
    // The type goes by the extension, so a new extension has to fit the content as an upload would.
    const renamed = await projectAttachmentFromBytes(newName, attachment.bytes, attachment.id);
    context.setAttachments(withAttachmentReplaced(attachments, attachment.id, renamed));
    return { attachment: summary(renamed), previousName: attachment.name };
  }

  if (action === "remove_attachment") {
    const attachment = targetAttachment(attachments, params);
    if (params.confirm !== true) throw new Error(`Removing '${attachment.name}' cannot be undone; pass confirm: true to remove it`);
    context.setAttachments(withAttachmentRemoved(attachments, attachment.id));
    return { removed: summary(attachment), remaining: attachments.length - 1 };
  }

  return undefined;
}
