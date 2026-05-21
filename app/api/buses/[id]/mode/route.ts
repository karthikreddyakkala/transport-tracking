import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { busLocations, buses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pusherServer, CHANNELS, EVENTS } from "@/lib/pusher";
import { calculateLiveState } from "@/lib/eta-calculator";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { mode } = await req.json();

    if (mode !== "live" && mode !== "simulation") {
      return NextResponse.json({ error: "Invalid tracking mode" }, { status: 400 });
    }

    // Update trackingMode on the busLocation table, setting updatedAt to now so the 30s fallback timer resets
    await db.update(busLocations)
      .set({ trackingMode: mode, updatedAt: new Date() })
      .where(eq(busLocations.busId, id));

    // Get full updated bus to recalculate and broadcast
    const bus = await db.query.buses.findFirst({
      where: eq(buses.id, id),
      with: {
        location: true,
        route: {
          with: {
            routeStops: {
              with: { stop: true },
              orderBy: (rs, { asc }) => [asc(rs.stopOrder)]
            }
          }
        }
      }
    });

    if (!bus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }

    const state = calculateLiveState(bus);
    
    // Broadcast updates to Pusher channels
    await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, state);
    await pusherServer.trigger(CHANNELS.bus(id), EVENTS.STATUS_UPDATE, bus);

    return NextResponse.json({ success: true, mode, state });
  } catch (error: any) {
    console.error("Failed to toggle tracking mode:", error);
    return NextResponse.json({ error: "Failed to update tracking mode", details: error.message }, { status: 500 });
  }
}
