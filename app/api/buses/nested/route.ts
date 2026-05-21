import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buses, routes, busStops, routeStops } from "@/lib/db/schema";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { busData, routesData } = body;

    if (!busData || !routesData || !Array.isArray(routesData) || routesData.length === 0) {
      return NextResponse.json({ error: "Validation failed: You must define a bus and at least 1 route." }, { status: 400 });
    }

    // Driver Availability Check
    if (busData.driverId && busData.driverId !== "none" && busData.driverId !== "manual") {
       if (busData.scheduledStartTime && busData.endTime) {
          const startTime = new Date(busData.scheduledStartTime);
          const endTime = new Date(busData.endTime);
          
          const overlaps = await db.query.buses.findMany({
             where: (bus, { and, eq, lt, gt, ne }) => and(
               eq(bus.driverId, busData.driverId),
               ne(bus.status, 'inactive'),
               lt(bus.scheduledStartTime, endTime),
               gt(bus.endTime, startTime)
             )
          });
          
          if (overlaps.length > 0) {
             return NextResponse.json({ 
                error: `Driver is not available for the selected time slot. They are already assigned to Bus ${overlaps[0].number}.`
             }, { status: 409 });
          }
       }
    }

    // Run within a transaction to guarantee all-or-nothing database inserts
    const result = db.transaction((tx) => {
      let firstRouteId: string | null = null;
      
      for (const routeData of routesData) {
        if (!routeData.stops || !Array.isArray(routeData.stops) || routeData.stops.length === 0) {
          throw new Error("Validation failed: Each route must contain at least one stop.");
        }

        const routeId = nanoid();
        if (!firstRouteId) firstRouteId = routeId;

        // 1. Insert Route
        tx.insert(routes).values({
          id: routeId,
          name: routeData.name || `Generated Route ${routeData.number}`,
          number: routeData.number,
          color: routeData.color || "#3B82F6",
          startAddress: routeData.fullStartPoint || routeData.startPoint || null,
          endAddress: routeData.fullEndPoint || routeData.endPoint || null,
          startLat: Number(routeData.startLat) || null,
          startLng: Number(routeData.startLng) || null,
          endLat: Number(routeData.endLat) || null,
          endLng: Number(routeData.endLng) || null,
          geometry: routeData.geometry || null,
          distance: Number(routeData.distance) || 0,
          status: "active"
        }).run();

        // 2. Insert Stops and Link them to the Route
        for (let i = 0; i < routeData.stops.length; i++) {
          const stopData = routeData.stops[i];
          const stopId = nanoid();
          
          tx.insert(busStops).values({
            id: stopId,
            name: stopData.name,
            code: stopData.code || null,
            latitude: Number(stopData.latitude) || 0,
            longitude: Number(stopData.longitude) || 0,
            address: stopData.address || null
          }).run();

          tx.insert(routeStops).values({
            id: nanoid(),
            routeId: routeId,
            stopId: stopId,
            stopOrder: i,
            distanceFromPrev: stopData.distanceFromPrev || 0,
            estimatedMinutesFromStart: i * 5
          }).run();
        }
      }

      // 3. Insert Bus and tie to the first route
      const busId = nanoid();
      const payload: any = {
        id: busId,
        name: busData.name,
        number: busData.number,
        capacity: Number(busData.capacity) || 40,
        busType: busData.busType || "Non-AC",
        status: busData.status || "assigned",
        currentRouteId: firstRouteId
      };

      if (busData.registrationNumber) payload.registrationNumber = busData.registrationNumber;
      if (busData.driverId && busData.driverId !== "none" && busData.driverId !== "manual") payload.driverId = busData.driverId;
      if (busData.driverId === "manual" && busData.manualDriverName) payload.manualDriverName = busData.manualDriverName;
      if (busData.manualDriverName) payload.manualDriverName = busData.manualDriverName;
      if (busData.scheduledStartTime) payload.scheduledStartTime = new Date(busData.scheduledStartTime);
      if (busData.endTime) payload.endTime = new Date(busData.endTime);

      return tx.insert(buses).values(payload).returning().get();
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    
    if (errorMsg.includes("UNIQUE constraint failed: routes.number")) {
      return NextResponse.json({ error: "The Route Number you provided is already active in the system. Please use a uniquely identifiable Route Number." }, { status: 400 });
    }
    
    if (errorMsg.includes("UNIQUE constraint failed: buses.number")) {
      return NextResponse.json({ error: "The Bus Number you provided is already registered to another vehicle. Please use a unique Bus Number." }, { status: 400 });
    }

    return NextResponse.json({ error: errorMsg || "Failed to orchestrate nested system creation" }, { status: 500 });
  }
}
