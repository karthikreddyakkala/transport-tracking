import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    if (!search) {
      return NextResponse.json([]);
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;
    
    // Fallback static list (just for demo/safeguard if Mapbox token is missing)
    if (!token) {
      const mockCities = [
        "Shimla", "Shirdi", "Shimoga", "Shillong", "Mumbai", "Delhi", "Bengaluru", 
        "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur", "Surat", "Lucknow", "Visakhapatnam"
      ];
      const matches = mockCities.filter(c => c.toLowerCase().startsWith(search.toLowerCase()));
      return NextResponse.json(matches.map(name => ({ name })));
    }

    // Call Mapbox API with broader types for road/stop precision
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search)}.json?access_token=${token}&country=IN&types=place,locality,address,poi&limit=8`
    );
    
    if (!res.ok) {
      throw new Error("Failed to fetch from Mapbox");
    }

    const data = await res.json();
    
    const results = data.features?.map((f: any) => {
      const fullName = f.place_name || "";
      const parts = fullName.split(",");
      const name = f.text || parts[0].trim();
      const secondary = parts.slice(1).join(",").trim();
      
      return {
        name,
        secondary,
        fullName,
        lng: f.center[0],
        lat: f.center[1]
      };
    }) || [];

    return NextResponse.json(results);
    
  } catch (error) {
    console.error("Location search Error:", error);
    return NextResponse.json({ error: "Failed to search locations" }, { status: 500 });
  }
}
