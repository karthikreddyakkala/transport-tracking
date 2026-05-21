import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buses, busLocations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const allBuses = await db.query.buses.findMany({
      with: {
        route: {
          with: {
            routeStops: {
              with: { stop: true }
            }
          }
        },
        location: true,
        driver: { columns: { id: true, name: true } },
      },
    });
    const today = new Date();
    
    // Daily Mission Reset Logic for all fetched buses
    for (const bus of allBuses) {
      if (bus.status === "completed") {
         const timestamp = bus.updatedAt || bus.endTime || bus.actualStartTime;
         if (timestamp) {
            const updatedDate = new Date(timestamp);
            if (
              today.getDate() !== updatedDate.getDate() ||
              today.getMonth() !== updatedDate.getMonth() ||
              today.getFullYear() !== updatedDate.getFullYear()
            ) {
               // Reset to assigned for the new day
               await db.update(buses)
                 .set({ status: "assigned", actualStartTime: null, endTime: null, updatedAt: today })
                 .where(eq(buses.id, bus.id));
                 
               bus.status = "assigned";
               bus.actualStartTime = null;
               bus.endTime = null;
               bus.updatedAt = today;
            }
         }
      }
    }

    return NextResponse.json(allBuses);
  } catch (error) {
    console.error("GET /api/buses error:", error);
    return NextResponse.json({ error: "Failed to fetch buses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = nanoid();
    const [bus] = await db
      .insert(buses)
      .values({ id, ...body })
      .returning();
    return NextResponse.json(bus, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create bus" }, { status: 500 });
  }
}
