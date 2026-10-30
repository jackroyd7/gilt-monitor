import { keepAliveJson } from "@/lib/keepalive";
import { extractTips } from "@/lib/tips-ai";

export const maxDuration = 300;

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** POST /api/tips/extract { images: [{ data (base64), mediaType }] } → { issueDate, tips }. */
export async function POST(request: Request) {
  let body: { images?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Those images are too large to send; try fewer at a time." },
      { status: 400 },
    );
  }
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(
      (
        i,
      ): i is {
        data: string;
        mediaType: "image/jpeg" | "image/png" | "image/webp";
      } => typeof i?.data === "string" && TYPES.has(i?.mediaType),
    )
    .slice(0, 8);
  if (!images.length)
    return Response.json(
      { error: "Add at least one screenshot." },
      { status: 400 },
    );
  return keepAliveJson(() => extractTips(images));
}
