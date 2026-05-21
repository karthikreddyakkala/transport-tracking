import { db } from "./db";
import { buses, busLocations, routeStops, etaPredictions } from "./db/schema";
import { eq } from "drizzle-orm";
import { pusherServer, CHANNELS, EVENTS } from "./pusher";
import { haversineDistance, decodePolyline6, getPointAtDistance, calculateLiveState } from "./eta-calculator";
import { nanoid } from "nanoid";

const INTERIM_DWELL_MS = 30_000; // 30 seconds at each stop


export async function simulateBus(busId: string): Promise<{ success: boolean; message: string }> {
  const bus = await db.query.buses.findFirst({
    where: eq(buses.id, busId),
    with: {
      route: {
        with: {
          routeStops: {
            with: { stop: true },
            orderBy: (rs, { asc }) => [asc(rs.stopOrder)],
          },
        },
      },
      location: true,
    },
  });

  if (!bus || bus.status !== "active" || !bus.route) {
    return { success: false, message: "Bus or route not found/active" };
  }

  const stops = bus.route.routeStops;
  const totalDistance = bus.route.distance || 0;
  const geometry = bus.route.geometry ? decodePolyline6(bus.route.geometry) : [];
  const now = Date.now();

  let trackingMode = bus.location?.trackingMode || "simulation";
  let fallbackAlert = false;

  // 30-second Fallback check if in live mode
  if (trackingMode === "live") {
     const lastUpdate = bus.location?.updatedAt ? new Date(bus.location.updatedAt).getTime() : now;
     const timeSinceLastUpdate = now - lastUpdate;
     
     if (timeSinceLastUpdate > 30000) {
        fallbackAlert = true;
        trackingMode = "simulation";
        
        await db.update(busLocations)
           .set({ trackingMode: "simulation", updatedAt: new Date() })
           .where(eq(busLocations.busId, busId));
     } else {
        return { success: true, message: "Live tracking mode is active and receiving updates. Simulator execution skipped." };
     }
  }

  // 1. Calculate Progress Differentially (preserve current distanceCovered and continue seamlessly)
  const lastUpdate = bus.location?.updatedAt ? new Date(bus.location.updatedAt).getTime() : now;
  const timeDeltaHr = Math.max(0, (now - lastUpdate) / 3600000);
  const simulatedSpeed = 40;
  const deltaDistance = timeDeltaHr * simulatedSpeed;
  
  // Update distance dynamically based on actual time elapsed
  let distanceCovered = bus.location?.distanceCovered || 0;
  distanceCovered += deltaDistance;
  distanceCovered = Math.min(totalDistance, distanceCovered);

  // 2. Completed State
  if (distanceCovered >= totalDistance - 0.05) {
    await db.update(buses).set({ 
      status: "completed",
      endTime: new Date()
    }).where(eq(buses.id, busId));

    const finalPos = geometry.length > 0 ? { lat: geometry[geometry.length-1][1], lng: geometry[geometry.length-1][0] } : { lat: stops[stops.length-1].stop.latitude, lng: stops[stops.length-1].stop.longitude };

    await db.insert(busLocations).values({
      id: nanoid(),
      busId,
      latitude: finalPos.lat,
      longitude: finalPos.lng,
      speed: 0,
      distanceCovered: totalDistance,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: busLocations.busId,
      set: {
        latitude: finalPos.lat,
        longitude: finalPos.lng,
        speed: 0,
        distanceCovered: totalDistance,
        updatedAt: new Date(),
      }
    });

    const completedBus = await db.query.buses.findFirst({
      where: eq(buses.id, busId),
      with: {
        route: {
          with: {
            routeStops: {
              with: { stop: true },
              orderBy: (rs, { asc }) => [asc(rs.stopOrder)],
            },
          },
        },
        location: true,
      },
    });

    const finalState = calculateLiveState(completedBus);
    if (finalState && fallbackAlert) {
       (finalState as any).fallbackAlert = true;
    }
    await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, finalState);

    return { success: true, message: `Bus ${bus.number} completed mission.` };
  }

  // 3. Status & Speed
  const isBoarding = bus.location?.boardingUntil && now < bus.location.boardingUntil.getTime();
  const speed = isBoarding ? 0 : simulatedSpeed;

  // 4. Calculations (STRICT FORMULAS)
  const pos = getPointAtDistance(geometry, distanceCovered);

  // Update Database
  await db.insert(busLocations).values({
    id: nanoid(),
    busId,
    latitude: pos.lat,
    longitude: pos.lng,
    speed,
    distanceCovered,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: busLocations.busId,
    set: {
      latitude: pos.lat,
      longitude: pos.lng,
      speed,
      distanceCovered,
      updatedAt: new Date(),
    }
  });

  // Fetch updated bus from db
  const updatedBus = await db.query.buses.findFirst({
    where: eq(buses.id, busId),
    with: {
      route: {
        with: {
          routeStops: {
            with: { stop: true },
            orderBy: (rs, { asc }) => [asc(rs.stopOrder)],
          },
        },
      },
      location: true,
    },
  });

  // Calculate live state centrally
  const liveState = calculateLiveState(updatedBus);
  if (liveState && fallbackAlert) {
     (liveState as any).fallbackAlert = true;
  }

  // Broadcast Unified State
  await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, liveState);

  return { success: true, message: `Bus ${bus.number} tracked at ${Math.round(distanceCovered * 10) / 10} km` };
}

function calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}
