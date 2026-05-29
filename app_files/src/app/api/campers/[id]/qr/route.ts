import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const baseUrl = process.env.APP_BASE_URL ?? request.nextUrl.origin;
  const svg = await QRCode.toString(`${baseUrl}/registration?camper=${id}`, {
    type: "svg",
    margin: 1,
    width: 192,
    color: { dark: "#1f5336", light: "#ffffff" }
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
