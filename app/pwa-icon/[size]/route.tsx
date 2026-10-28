import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/icon-art";

/** PNG icons for the web app manifest: /pwa-icon/192 and /pwa-icon/512. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "512" ? 512 : 192;
  return new ImageResponse(<IconArt size={px} />, { width: px, height: px });
}
