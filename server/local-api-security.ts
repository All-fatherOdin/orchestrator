import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request } from "express";

export const LOCAL_API_HOST = "127.0.0.1";
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function localOrigin(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !localHosts.has(url.hostname) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      return undefined;
    return url;
  } catch { return undefined; }
}

/** Transport protection is independent of task/domain authorization. */
export function installLocalApiSecurity(app: Express, developmentOrigin?: string) {
  const token = randomBytes(32).toString("hex");
  const dev = developmentOrigin ? localOrigin(developmentOrigin) : undefined;
  if (developmentOrigin && !dev) throw new Error("Invalid local development origin.");
  const validHost = (request: Request) => {
    const host = request.headers.host;
    const parsed = host ? localOrigin(`http://${host}`) : undefined;
    return parsed && Number(parsed.port || 80) === request.socket.localPort;
  };
  app.use((request, response, next) => {
    if (!validHost(request))
      return response.status(403).json({ code: "LOCAL_API_HOST_REJECTED", error: "Недопустимый адрес локального приложения." });
    const origin = request.get("origin");
    const devRequest = dev && origin && localOrigin(origin)?.port === dev.port;
    if ((origin !== undefined && origin !== `http://${request.headers.host}` && !devRequest) ||
        request.get("sec-fetch-site") === "cross-site")
      return response.status(403).json({ code: "LOCAL_API_ORIGIN_REJECTED", error: "Запрос пришёл из другого приложения." });
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Referrer-Policy", "same-origin");
    response.set("X-Frame-Options", "DENY");
    // Express route matching is case-insensitive and accepts a trailing slash.
    const path = request.path.toLowerCase().replace(/\/$/, "");
    if (path.startsWith("/api/")) response.set("Cache-Control", "no-store");
    if (path === "/api/session" && request.method === "GET") {
      // A custom header prevents a cross-origin simple request from acquiring a token.
      if (request.get("x-orchestrator-client") !== "local-ui")
        return response.status(403).json({ code: "LOCAL_API_CLIENT_REQUIRED", error: "Откройте интерфейс локального приложения." });
      return response.json({ token });
    }
    if (path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const supplied = request.get("x-orchestrator-token") ?? "";
      if (!/^[a-f0-9]{64}$/.test(supplied) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(token)))
        return response.status(401).json({ code: "LOCAL_API_TOKEN_REQUIRED", error: "Сессия приложения устарела. Обновите страницу и повторите действие." });
    }
    return next();
  });
}
