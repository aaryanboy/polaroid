import { NextResponse } from "next/server";

export async function GET() {
  const domain = process.env.METERED_DOMAIN;
  const secretKey = process.env.METERED_SECRET_KEY;

  if (!domain || !secretKey) {
    return NextResponse.json(
      { error: "METERED_DOMAIN or METERED_SECRET_KEY is missing in env" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${secretKey}`,
      { cache: "no-store" }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Metered API returned ${response.status}: ${errorText}`);
    }

    const iceServers = await response.json();
    return NextResponse.json(iceServers);
  } catch (error: any) {
    console.error("Failed to fetch TURN credentials:", error);
    return NextResponse.json(
      { error: "Failed to fetch TURN credentials", details: error.message },
      { status: 500 }
    );
  }
}
