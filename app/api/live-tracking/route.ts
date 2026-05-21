import { db } from "@/lib/db";
import { buses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { calculateLiveState } from "@/lib/eta-calculator";

export async function GET() {
  try {
    const activeBuses = await db.query.buses.findMany({
      where: eq(buses.status, "active"),
      with: {
        location: true,
        route: {
          with: {
            routeStops: {
              with: { stop: true },
              orderBy: (rs, { asc }) => [asc(rs.stopOrder)],
            },
          },
        },
      },
    });

    const results = activeBuses.map((bus) => calculateLiveState(bus)).filter(Boolean);

    return NextResponse.json({ buses: results });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch live tracking", details: error.message }, { status: 500 });
  }
}
