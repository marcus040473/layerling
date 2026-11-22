#!/usr/bin/env node

/**
 * The relay as a program for Node: `npm run mcp:relay`, or `node scripts/layerling-mcp-relay.mjs`.
 * It needs nothing but Node - no build, no packages - so it runs on any small server or container.
 * What the relay is and does stands in layerling-mcp-relay-core.mjs.
 *
 *   PORT                              the port, 8787 unless given
 *   HOST                              the address to listen on, 0.0.0.0 unless given
 *   LAYERLING_RELAY_ALLOWED_ORIGINS   the sites whose editors may connect, separated by commas,
 *                                     e.g. "https://layerling.com,https://example.github.io";
 *                                     left out, any site may
 *
 * Put HTTPS in front of it (a reverse proxy, or the host's own): browsers refuse to let a page
 * served over https talk to a relay over plain http, and the code in the address is a key.
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRelay } from "./layerling-mcp-relay-core.mjs";

/** The largest request taken: an editor's answer can carry an exported file. */
const MAX_BODY_BYTES = 96 * 1024 * 1024;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/** Serves a relay over Node's http server. Returns the server; `relay` may be handed in by a test. */
export function startRelayServer({ port = 8787, host = "0.0.0.0", allowedOrigins = [], relay = createRelay({ allowedOrigins }) } = {}) {
  const server = createServer(async (request, response) => {
    const gone = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) gone.abort();
    });
    try {
      const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS";
      const body = hasBody ? await readBody(request) : undefined;
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      }
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      const answer = await relay.handle(new Request(url, { method: request.method, headers, body: body?.length ? body : undefined, signal: gone.signal }));
      response.writeHead(answer.status, Object.fromEntries(answer.headers));
      if (!answer.body) {
        response.end();
        return;
      }
      const stream = Readable.fromWeb(answer.body);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const tooLarge = error instanceof Error && error.message === "too large";
      response.writeHead(tooLarge ? 413 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: tooLarge ? "The request is too large for the relay." : "The relay failed on this request." }));
    }
  });
  // An editor's question for a command stays open for 25 s, a tool call for minutes: no timeout of Node's may cut them.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;
  server.listen(port, host);
  return server;
}

function startedAsProgram() {
  try {
    return basename(process.argv[1] || "") === basename(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsProgram()) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || "0.0.0.0";
  const allowedOrigins = (process.env.LAYERLING_RELAY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  startRelayServer({ port, host, allowedOrigins }).on("listening", () => {
    process.stdout.write(
      `Layerling relay listening on http://${host}:${port}\n` +
        (allowedOrigins.length ? `Editors may connect from: ${allowedOrigins.join(", ")}\n` : "Editors may connect from any site (set LAYERLING_RELAY_ALLOWED_ORIGINS to limit it).\n"),
    );
  });
}
