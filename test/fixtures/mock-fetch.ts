export type MockFetchHandler = (request: Request) => Response | Promise<Response>;

export interface MockFetchServer {
  url: string;
  hits: Record<string, number>;
  fetch: typeof fetch;
  close: () => Promise<void>;
}

export function startMockServer(
  routes: Record<string, MockFetchHandler>,
  baseUrl: string = "https://mock.axo.test",
): MockFetchServer {
  const hits: Record<string, number> = {};

  const mockFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const key = `${request.method.toUpperCase()} ${url.pathname}`;
    hits[key] = (hits[key] ?? 0) + 1;

    const handler = routes[key];
    if (!handler) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    return handler(request);
  };

  return {
    url: baseUrl,
    hits,
    fetch: mockFetch,
    close: async () => Promise.resolve(),
  };
}
