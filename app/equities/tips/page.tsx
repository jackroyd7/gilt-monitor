import { redirect } from "next/navigation";

/** The tips portfolio moved to its own tab. */
export default function TipsMoved() {
  redirect("/my-portfolio");
}
