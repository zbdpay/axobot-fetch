import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

export interface MockServer {
  url: string;
  hits: Record<string, number>;
  close: () => Promise<void>;
}

export async function startMockServer(routes: Record<string, Handler>): Promise<MockServer> {
  const hits: Record<string, number> = {};

  const server = createServer((req, res) => {
    const method = req.method ?? "GET";
    const path = req.url ?? "/";
    const key = `${method} ${path}`;
    hits[key] = (hits[key] ?? 0) + 1;

    const handler = routes[key];
    if (!handler) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    handler(req, res);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    hits,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}
