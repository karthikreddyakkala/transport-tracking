import { db } from "@/lib/db";
import { buses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { calculateLiveState } from "@/lib/eta-calculator";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bus = await db.query.buses.findFirst({
      where: eq(buses.id, id),
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

    if (!bus) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const liveState = calculateLiveState(bus);

    return NextResponse.json(liveState);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch details", details: error.message }, { status: 500 });
  }
}
