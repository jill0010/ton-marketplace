import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\\'([^\\']*)\\'|([^\\s>]+))', "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function getMeta(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = getAttribute(tag, "property") ?? getAttribute(tag, "name");
    if (property?.toLowerCase() === key.toLowerCase()) {
      return getAttribute(tag, "content");
    }
  }
  return null;
}

function getElementText(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp('<[^>]+class=["\\'][^"\\']*\\b' + escaped + '\\b[^"\\']*["\\'][^>]*>([\\s\\S]*?)<\\/[^>]+>', "i"));
  if (!match) return null;
  return decodeHtml(match[1].replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ")).slice(0, 1000);
}

function getAvatar(html: string): string | null {
  const photoTag = html.match(/<img\b[^>]*class=["'][^"']*tgme_page_photo_image[^"']*["'][^>]*>/i)?.[0];
  const candidate = (photoTag ? getAttribute(photoTag, "src") : null) ?? getMeta(html, "og:image");
  if (!candidate) return null;
  try {
    const url = new URL(candidate, "https://t.me");
    const hostAllowed = url.protocol === "https:" &&
      (url.hostname === "t.me" || url.hostname.endsWith(".telesco.pe"));
    return hostAllowed ? url.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const rawUsername = typeof body?.username === "string" ? body.username : "";
    const username = rawUsername.trim().replace(/^@+/, "");

    if (username.length < 5 || username.length > 32 || !/^[A-Za-z][A-Za-z0-9_]*$/.test(username)) {
      return json({
        success: false,
        code: "INVALID_USERNAME",
        error: "请输入有效的 Telegram 用户名（5–32 位，字母开头，可包含数字和下划线）。",
      }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    let response: Response;
    try {
      response = await fetch("https://t.me/" + encodeURIComponent(username), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en",
          "User-Agent": "Mozilla/5.0 (compatible; TONMarketProfileLookup/1.0)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404 || response.status === 410) {
      return json({ success: false, code: "USER_NOT_FOUND", error: "未找到该 Telegram 用户名。" });
    }
    if (!response.ok) {
      return json({ success: false, code: "PROFILE_UNAVAILABLE", error: "Telegram 暂时无法提供该用户的公开资料，请稍后重试。" }, 200);
    }

    const html = (await response.text()).slice(0, 1_000_000);
    const title = getElementText(html, "tgme_page_title") ?? getMeta(html, "og:title");
    const description = getElementText(html, "tgme_page_description") ?? getMeta(html, "og:description");
    const extra = getElementText(html, "tgme_page_extra");
    const avatarUrl = getAvatar(html);

    const normalizedTitle = title?.replace(/^Telegram:\\s*(Contact|View)\\s*/i, "").trim();
    const genericTitle = !normalizedTitle ||
      normalizedTitle.toLowerCase() === "telegram" ||
      normalizedTitle.toLowerCase() === "contact @" + username.toLowerCase();

    if (genericTitle && !avatarUrl && !description) {
      return json({ success: false, code: "PROFILE_UNAVAILABLE", error: "未能读取该用户的公开头像或资料。请确认用户名正确，或该用户是否允许公开查看。" });
    }

    return json({
      success: true,
      profile: {
        username,
        displayName: genericTitle ? username : normalizedTitle,
        bio: description,
        extra,
        avatarUrl,
        profileUrl: "https://t.me/" + encodeURIComponent(username),
        source: "Telegram public profile page",
      },
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return json({
      success: false,
      code: aborted ? "LOOKUP_TIMEOUT" : "LOOKUP_FAILED",
      error: aborted ? "查询 Telegram 用户资料超时，请稍后重试。" : "查询 Telegram 用户资料失败，请稍后重试。",
    }, 200);
  }
});
