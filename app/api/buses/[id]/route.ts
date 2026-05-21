import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buses, routes, busStops, routeStops } from "@/lib/db/schema";
import { eq, inArray, asc } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const bus = await db.query.buses.findFirst({
      where: eq(buses.id, id),
      with: { route: { with: { routeStops: { with: { stop: true }, orderBy: (rs, { asc }) => [asc(rs.stopOrder)] } } }, location: true, driver: { columns: { id: true, name: true } } },
    });
    if (!bus) return NextResponse.json({ error: "Bus not found" }, { status: 404 });

    // Daily Mission Reset Logic
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
             // Reset to assigned for the new day
             await db.update(buses)
               .set({ status: "assigned", actualStartTime: null, endTime: null, updatedAt: today })
               .where(eq(buses.id, id));
               
             bus.status = "assigned";
             bus.actualStartTime = null;
             bus.endTime = null;
             bus.updatedAt = today;
          }
       }
    }

    return NextResponse.json(bus);
  } catch {
    return NextResponse.json({ error: "Failed to fetch bus" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    
    // Convert date strings to Date objects for Drizzle compatibility
    const updateData: any = { ...body };
    if (updateData.scheduledStartTime) updateData.scheduledStartTime = new Date(updateData.scheduledStartTime);
    if (updateData.actualStartTime) updateData.actualStartTime = new Date(updateData.actualStartTime);
    if (updateData.endTime) updateData.endTime = new Date(updateData.endTime);
    if (updateData.createdAt) updateData.createdAt = new Date(updateData.createdAt);
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(buses)
      .set(updateData)
      .where(eq(buses.id, id))
      .returning();
      
    const fullUpdatedBus = await db.query.buses.findFirst({
        where: eq(buses.id, id),
        with: { 
            route: { with: { routeStops: { with: { stop: true }, orderBy: (rs, { asc }) => [asc(rs.stopOrder)] } } }, 
            location: true, 
            driver: { columns: { id: true, name: true } } 
        },
    });
    
    if (fullUpdatedBus) {
        try {
            const { pusherServer, CHANNELS, EVENTS } = await import("@/lib/pusher");
            await pusherServer.trigger(CHANNELS.bus(id), EVENTS.STATUS_UPDATE, fullUpdatedBus);
            await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, {
                busId: id,
                status: fullUpdatedBus.status,
                actualStartTime: fullUpdatedBus.actualStartTime
            });
        } catch (pusherError) {
            console.error("Pusher Trigger Failed (ignoring):", pusherError);
        }
    }
    
    return NextResponse.json(fullUpdatedBus);
  } catch (error: any) {
    console.error("PATCH Bus Error:", error);
    return NextResponse.json({ error: "Failed to update bus", details: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const targetBus = await db.query.buses.findFirst({
      where: eq(buses.id, id)
    });

    if (!targetBus) return new NextResponse(null, { status: 204 });

    try {
      db.transaction((tx) => {
        // 1. Identify the route associated with this bus
        const routeId = targetBus.currentRouteId;

        // 2. Delete the Bus (cascade will handle locations, etas, etc.)
        tx.delete(buses).where(eq(buses.id, id)).run();

        // 3. Delete the Route if it exists
        if (routeId) {
          // This will cascade to route_stops, but NOT bus_stops (which are shared)
          tx.delete(routes).where(eq(routes.id, routeId)).run();
        }
      });

      // 4. Broadcast deletion to update all dashboards (Async, outside transaction)
      const { pusherServer, CHANNELS, EVENTS } = await import("@/lib/pusher");
      await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, {
        busId: id,
        status: "deleted"
      });

    } catch (e) {
      console.error("Failed to execute deletion or broadcast:", e);
      // Even if broadcast fails, the bus was deleted in the transaction
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error("Cascade Delete Failed:", error);
    return NextResponse.json({ error: "Failed to cascade delete the bus entity matrix", details: error.message }, { status: 500 });
  }
}
