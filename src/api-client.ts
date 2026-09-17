/** Tokens live only in memory, and are never attached to non-API destinations. */
export function createApiFetch(transport: typeof globalThis.fetch): typeof globalThis.fetch {
  const sessions = new Map<string, Promise<string>>();
  return async (input, init) => {
    const address = input instanceof Request ? input.url : String(input);
    const url = new URL(address, typeof location === "undefined" ? undefined : location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!url.pathname.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(method) ||
        (typeof location !== "undefined" && url.origin !== location.origin))
      return transport(input, init);
    const acquire = () => {
      let pending = sessions.get(url.origin);
      if (!pending) {
        pending = transport(`${url.origin}/api/session`, {
          headers: { "X-Orchestrator-Client": "local-ui" }, cache: "no-store",
        }).then(async response => {
          if (!response.ok) throw new Error("Не удалось открыть локальную сессию. Обновите страницу.");
          const body = await response.json();
          if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
            throw new Error("Сервер вернул некорректную локальную сессию.");
          return body.token as string;
        });
        sessions.set(url.origin, pending);
        void pending.catch(() => { if (sessions.get(url.origin) === pending) sessions.delete(url.origin); });
      }
      return pending;
    };
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("X-Orchestrator-Token", await acquire());
    const response = await transport(input, { ...init, headers });
    // Do not replay a mutation. Refresh the session on the next explicit action.
    if (response.status === 401) sessions.delete(url.origin);
    return response;
  };
}

export const apiFetch = createApiFetch((input, init) => globalThis.fetch(input, init));
