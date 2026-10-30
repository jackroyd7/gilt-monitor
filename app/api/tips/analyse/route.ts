import { keepAliveJson } from "@/lib/keepalive";
import { analyseTips } from "@/lib/tips-analyse";
import type { Book, Tip } from "@/lib/tips";

export const maxDuration = 300;

/** POST /api/tips/analyse { tips, book, newMoney } → reviews, target weights and suggested trades. */
export async function POST(request: Request) {
  let body: { tips?: Tip[]; book?: Book; newMoney?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const tips = Array.isArray(body.tips) ? body.tips.slice(0, 40) : [];
  const book = body.book;
  if (
    !book ||
    !Array.isArray(book.holdings) ||
    typeof book.cash !== "number" ||
    !book.settings
  )
    return Response.json({ error: "Bad request" }, { status: 400 });
  const newMoney =
    typeof body.newMoney === "number" && body.newMoney > 0 ? body.newMoney : 0;
  return keepAliveJson(() => analyseTips(tips, book, newMoney));
}
