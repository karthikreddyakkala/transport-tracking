import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buses, busLocations, routeStops } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { pusherServer, CHANNELS, EVENTS } from "@/lib/pusher";

export async function POST(req: NextRequest) {
  try {
    const { busId } = await req.json();

    if (!busId) {
      return NextResponse.json({ error: "busId is required" }, { status: 400 });
    }

    const bus = await db.query.buses.findFirst({
      where: eq(buses.id, busId),
    });

    if (!bus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }

    if (bus.status === "active") {
        // Idempotent: If already active, just return the full updated bus structure
        const fullUpdatedBus = await db.query.buses.findFirst({
            where: eq(buses.id, busId),
            with: {
                route: {
                    with: {
                        routeStops: {
                            with: { stop: true },
                            orderBy: (rs, { asc }) => [asc(rs.stopOrder)]
                        }
                    }
                },
                location: true,
                driver: { columns: { id: true, name: true } },
            }
        });
        return NextResponse.json(fullUpdatedBus);
    }

    // Daily Mission Reset Logic (just in case they hit start on a stale completed mission)
    if (bus.status === "completed") {
       const timestamp = bus.updatedAt || bus.endTime || bus.actualStartTime;
       if (timestamp) {
          const today = new Date();
          const updatedDate = new Date(timestamp);
          if (
            today.getDate() !== updatedDate.getDate() ||
            today.getMonth() !== updatedDate.getMonth() ||
            today.getFullYear() !== updatedDate.getFullYear()
          ) {
             bus.status = "assigned";
             // Will update to active below
          }
       }
    }

    if (bus.status !== "assigned") {
       return NextResponse.json({ error: `Cannot start mission. Bus is currently ${bus.status}.` }, { status: 400 });
    }

    const now = new Date();
    
    const [updated] = await db
      .update(buses)
      .set({ 
        status: "active", 
        actualStartTime: now,
        updatedAt: now 
      })
      .where(eq(buses.id, busId))
      .returning();

    // 1. Ensure initial location exists at first stop with default speed
    const existingLocation = await db.query.busLocations.findFirst({
        where: eq(busLocations.busId, busId)
    });

    if (!existingLocation && bus.currentRouteId) {
        const firstStop = await db.query.routeStops.findFirst({
            where: eq(routeStops.routeId, bus.currentRouteId),
            with: { stop: true },
            orderBy: (rs, { asc }) => [asc(rs.stopOrder)]
        });

        if (firstStop) {
            await db.insert(busLocations).values({
                id: nanoid(),
                busId,
                latitude: firstStop.stop.latitude,
                longitude: firstStop.stop.longitude,
                speed: 40, // Default 40 km/h as requested
                heading: 0,
                currentStopIndex: 0,
                isReverse: false,
                updatedAt: now
            });
        }
    } else if (existingLocation) {
        await db.update(busLocations)
            .set({ 
                speed: 40, 
                updatedAt: now,
                currentStopIndex: 0,
                isReverse: false,
                distanceCovered: 0
            })
            .where(eq(busLocations.busId, busId));
    }

    // 2. Fetch full updated bus with relations to ensure valid broadcast and response
    const fullUpdatedBus = await db.query.buses.findFirst({
        where: eq(buses.id, busId),
        with: {
            route: {
                with: {
                    routeStops: {
                        with: { stop: true },
                        orderBy: (rs, { asc }) => [asc(rs.stopOrder)]
                    }
                }
            },
            location: true,
            driver: { columns: { id: true, name: true } },
        }
    });

    if (!fullUpdatedBus) {
        throw new Error("Failed to retrieve bus details after update");
    }

    // Safety: Ensure stops exists in structure for frontend
    if (fullUpdatedBus.route && !fullUpdatedBus.route.routeStops) {
        (fullUpdatedBus.route as any).routeStops = [];
    }

    // 3. Broadcast update via Pusher for real-time dashboard sync
    await pusherServer.trigger(CHANNELS.bus(busId), EVENTS.STATUS_UPDATE, fullUpdatedBus);
    await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, {
        busId,
        status: "active",
        actualStartTime: fullUpdatedBus.actualStartTime
    });

    // 4. Trigger simulator to start ticking
    try {
        await fetch(`${req.nextUrl.origin}/api/simulator`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ busId })
        });
    } catch (e) {
        console.error("Failed to trigger simulator:", e);
    }

    return NextResponse.json(fullUpdatedBus);
  } catch (error: any) {
    console.error("Error starting mission:", error);
    return NextResponse.json({ error: error.message || "Failed to start mission" }, { status: 500 });
  }
}
