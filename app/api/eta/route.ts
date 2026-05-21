import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { busLocations, buses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { calculateETAs } from "@/lib/eta-calculator";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const busId = searchParams.get("busId");
  const stopId = searchParams.get("stopId");

  try {
    if (busId) {
      // Get ETAs for a specific bus
      const bus = await db.query.buses.findFirst({
        where: eq(buses.id, busId),
        with: { location: true },
      });

      if (!bus || !bus.currentRouteId) {
        return NextResponse.json([]);
      }

      const etas = await calculateETAs({
        busId,
        routeId: bus.currentRouteId,
        currentLat: bus.location?.latitude ?? 0, 
        currentLng: bus.location?.longitude ?? 0,
        currentSpeed: bus.location?.speed ?? 0,
        currentStopIndex: bus.location?.currentStopIndex ?? 0,
        isReverse: bus.location?.isReverse ?? false,
        scheduledStartTime: bus.scheduledStartTime?.toISOString() || null,
      });

      return NextResponse.json(etas);
    }

    if (stopId) {
      // Get all buses heading to a specific stop
      const allBuses = await db.query.buses.findMany({
        where: eq(buses.status, "active"),
        with: { location: true },
      });

      const results = [];
      for (const bus of allBuses) {
        if (!bus.location || !bus.currentRouteId) continue;
        const etas = await calculateETAs({
          busId: bus.id,
          routeId: bus.currentRouteId,
          currentLat: bus.location.latitude,
          currentLng: bus.location.longitude,
          currentSpeed: bus.location.speed,
          currentStopIndex: bus.location.currentStopIndex ?? 0,
        });
        const stopEta = etas.find((e) => e.stopId === stopId);
        if (stopEta) {
          results.push({ busNumber: bus.number, busId: bus.id, ...stopEta });
        }
      }

      results.sort((a, b) => a.minutesAway - b.minutesAway);
      return NextResponse.json(results);
    }

    return NextResponse.json({ error: "Provide busId or stopId" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "ETA calculation failed" }, { status: 500 });
  }
}
