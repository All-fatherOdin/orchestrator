/** Integration-test client: isolated route fixtures intentionally have no session route. */
export const fetch: typeof globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return globalThis.fetch(input, init);
  const session = await globalThis.fetch(`${url.origin}/api/session`, {
    headers: { "X-Orchestrator-Client": "local-ui" },
  });
  const headers = new Headers(init?.headers);
  if (session.ok && session.headers.get("content-type")?.includes("application/json")) {
    const body = await session.json();
    if (body.token) headers.set("X-Orchestrator-Token", body.token);
  }
  return globalThis.fetch(input, { ...init, headers });
};
