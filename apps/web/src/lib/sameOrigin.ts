type Environment = Record<string, string | undefined>;

/**
 * Origins that may write although they do not match the host the app sees, for a reverse proxy that
 * rewrites the host. LAYERLING_ALLOWED_ORIGINS holds full origins ("https://layerling.example.com") or
 * bare hosts ("layerling.example.com"), comma-separated. Read at request time, so the ready-made image needs no rebuild.
 */
export function allowedOrigins(env: Environment = process.env) {
  return (env.LAYERLING_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Does the Origin the browser sent belong to this site? Behind Docker or a proxy request.url says localhost, so
 * X-Forwarded-Host and X-Forwarded-Proto come first. A proxy that closes HTTPS but does not say so leaves the
 * app thinking it runs on plain http; an https Origin on the very same host is then still this site.
 */
export function originMatchesRequest(request: Request, env: Environment = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const host = (forwardedHost || request.headers.get("host") || requestUrl.host).toLowerCase();
    const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/, "");
    if (protocol !== "http" && protocol !== "https") return false;
    const given = new URL(origin);
    if (given.origin === new URL(`${protocol}://${host}`).origin) return true;
    if (!forwardedProtocol && given.protocol === "https:" && given.host.toLowerCase() === host) return true;
    const allowed = allowedOrigins(env);
    if (allowed.includes(given.origin.toLowerCase()) || allowed.includes(given.host.toLowerCase())) return true;
    console.warn(`layerling: refused a write from origin ${given.origin}; the app sees ${protocol}://${host}. Pass the original Host and X-Forwarded-Proto from the proxy, or list the origin in LAYERLING_ALLOWED_ORIGINS.`);
    return false;
  } catch {
    return false;
  }
}
