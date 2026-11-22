/**
 * The relay on Cloudflare Workers: free to run for a handful of people, with HTTPS and nothing to look
 * after. What the relay is and does stands in ../layerling-mcp-relay-core.mjs.
 *
 * The editor and the AI client have to meet in one memory, and a Worker has none that lasts, so every
 * request goes to one Durable Object, which holds the relay. Nothing is written to its storage: when
 * Cloudflare puts the object to sleep the editors say who they are again within seconds.
 *
 *   npx wrangler deploy            from this folder, once, after `npx wrangler login`
 *
 * ALLOWED_ORIGINS in wrangler.jsonc limits which sites' editors may connect, separated by commas.
 */
import { DurableObject } from "cloudflare:workers";
import { createRelay } from "../layerling-mcp-relay-core.mjs";

export class LayerlingRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const allowedOrigins = String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    this.relay = createRelay({ allowedOrigins });
  }

  fetch(request) {
    return this.relay.handle(request);
  }
}

export default {
  fetch(request, env) {
    return env.RELAY.get(env.RELAY.idFromName("relay")).fetch(request);
  },
};
