import "../../../dns-hack.js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    
    // Security: Only allow proxying requests to mapbox.com domains
    if (!parsedUrl.hostname.endsWith("mapbox.com")) {
      return NextResponse.json({ error: "Forbidden target hostname" }, { status: 403 });
    }

    // Server-side fetch. Preloaded dns-hack.js ensures mapbox.com is resolved via Google Public DNS (8.8.8.8)
    const res = await fetch(targetUrl, {
      method: "GET",
    });

    if (!res.ok) {
      return new NextResponse(res.body, { 
        status: res.status, 
        statusText: res.statusText 
      });
    }

    // Read as arrayBuffer to perfectly preserve binary vector tiles (PBF)
    const buffer = await res.arrayBuffer();

    // Set up standard headers, keeping critical encoding, cache, and content-type headers
    const responseHeaders = new Headers();
    const headersToCopy = [
      "content-type",
      "cache-control",
      "etag",
      "timing-allow-origin"
    ];

    headersToCopy.forEach((header) => {
      const val = res.headers.get(header);
      if (val) {
        responseHeaders.set(header, val);
      }
    });

    // Ensure client can read the response properly
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(buffer, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Mapbox proxy request failed:", error);
    return NextResponse.json({ error: "Failed to proxy Mapbox API request" }, { status: 500 });
  }
}
