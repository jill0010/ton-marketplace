const TONAPI_BASE_URL = "https://tonapi.io";

export async function tonApiGet<T>(
  path: string,
): Promise<T> {
  const apiKey = Deno.env.get("TONAPI_KEY");

  if (!apiKey) {
    throw new Error("TONAPI server configuration unavailable");
  }

  if (!path.startsWith("/v2/")) {
    throw new Error("Invalid TONAPI endpoint");
  }

  const response = await fetch(`${TONAPI_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`TONAPI request failed with status ${response.status}`);
  }

  return await response.json() as T;
}
