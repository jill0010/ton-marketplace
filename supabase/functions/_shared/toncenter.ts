const TONCENTER_BASE_URL = "https://toncenter.com/api/v3";

export async function tonCenterGet<T>(
  path: string,
): Promise<T> {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");

  if (!apiKey) {
    throw new Error("TONCENTER server configuration unavailable");
  }

  if (!path.startsWith("/nft/")) {
    throw new Error("Invalid TONCENTER endpoint");
  }

  const response = await fetch(`${TONCENTER_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `TONCENTER request failed with status ${response.status}`,
    );
  }

  return await response.json() as T;
}
