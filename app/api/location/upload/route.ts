import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { busLocations, buses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pusherServer, CHANNELS, EVENTS } from "@/lib/pusher";
import { nanoid } from "nanoid";
import { calculateLiveState, getDistanceAlongGeometry, decodePolyline6, haversineDistance } from "@/lib/eta-calculator";

// Calculate cross-track distance (approximation on small scales)
// Given segment A->B and point P, return distance from P to line AB in km.
function pointLineDistanceApprox(latA: number, lngA: number, latB: number, lngB: number, latP: number, lngP: number) {
   const L2 = (latA - latB)**2 + (lngA - lngB)**2;
   if (L2 === 0) return haversineDistance(latA, lngA, latP, lngP);
   
   // t is projection parameter
   let t = ((latP - latA) * (latB - latA) + (lngP - lngA) * (lngB - lngA)) / L2;
   t = Math.max(0, Math.min(1, t)); // clamp to segment
   
   const projLat = latA + t * (latB - latA);
   const projLng = lngA + t * (lngB - lngA);
   
   return haversineDistance(latP, lngP, projLat, projLng);
}

export async function POST(req: NextRequest) {
   try {
      const body = await req.json();
      const { busId, latitude, longitude, speed, heading } = body;
      
      const bus = await db.query.buses.findFirst({
         where: eq(buses.id, busId),
         with: {
            location: true,
            route: {
               with: { routeStops: { with: { stop: true }, orderBy: (rs, {asc}) => [asc(rs.stopOrder)] } }
            }
         }
      });
      
      if (!bus || !bus.route) return NextResponse.json({ error: "Invalid bus" }, { status: 400 });
      
      if (bus.location?.trackingMode === "simulation") {
         return NextResponse.json({ success: true, ignored: true, message: "Simulation mode active; GPS upload ignored." });
      }
      
      const stops = bus.route.routeStops;
      const isReverse = bus.location?.isReverse || false;
      const currentStopIndex = bus.location?.currentStopIndex || 0;
      let nextStopIndex = isReverse ? currentStopIndex - 1 : currentStopIndex + 1;
      if (nextStopIndex < 0) nextStopIndex = 0;
      if (nextStopIndex >= stops.length) nextStopIndex = stops.length - 1;
      
      const s1 = stops[currentStopIndex].stop;
      const s2 = stops[nextStopIndex].stop;
      
      // Calculate Drift
      const driftKm = pointLineDistanceApprox(s1.latitude, s1.longitude, s2.latitude, s2.longitude, latitude, longitude);
      
      // Dynamic Drift Tolerance mapping
      const baseSpeedKmh = speed || 0;
      let allowedToleranceKm = 0.2; // 200m base
      if (baseSpeedKmh > 60) allowedToleranceKm = 0.5; // Highways 500m
      else if (baseSpeedKmh > 30) allowedToleranceKm = 0.3; // Arterial 300m
      
      let newStatus: "on_route" | "deviation" | "off_route" = "on_route";
      let deviationTime = bus.location?.deviationTime || null;
      
      if (driftKm > allowedToleranceKm) {
         if (!deviationTime) deviationTime = new Date(); // Start counter
         
         const deviationDurationSeconds = (Date.now() - new Date(deviationTime).getTime()) / 1000;
         
         if (deviationDurationSeconds > 15) {
            newStatus = "off_route";
         } else if (deviationDurationSeconds > 5) {
            newStatus = "deviation";
         } 
      } else {
         deviationTime = null; // Reset drift if back in bounds
      }

      // Calculate distanceCovered snapped to geometry
      const geometry = bus.route.geometry ? decodePolyline6(bus.route.geometry) : [];
      let distanceCovered = bus.location?.distanceCovered || 0;
      if (geometry.length >= 2) {
         distanceCovered = getDistanceAlongGeometry(geometry, latitude, longitude);
      }
      
      // Update Location
      await db.insert(busLocations).values({
         id: nanoid(),
         busId,
         latitude, longitude, speed, heading,
         currentStopIndex,
         nextStopId: stops[nextStopIndex].stopId,
         isReverse,
         routeStatus: newStatus,
         deviationTime: deviationTime,
         distanceCovered,
         updatedAt: new Date()
      }).onConflictDoUpdate({
         target: busLocations.busId,
         set: {
            latitude, longitude, speed, heading, routeStatus: newStatus, deviationTime: deviationTime, distanceCovered, updatedAt: new Date()
         }
      });

      // Fetch full updated bus
      const updatedBus = await db.query.buses.findFirst({
         where: eq(buses.id, busId),
         with: {
            location: true,
            route: {
               with: { routeStops: { with: { stop: true }, orderBy: (rs, {asc}) => [asc(rs.stopOrder)] } }
            }
         }
      });
      
      const liveState = calculateLiveState(updatedBus);

      // Broadcast Active State
      await pusherServer.trigger(CHANNELS.BUS_TRACKING, EVENTS.LOCATION_UPDATE, liveState);
      
      return NextResponse.json({ success: true, driftKm, status: newStatus });
      
   } catch(e) {
      return NextResponse.json({ error: "Failed to upload stream" }, { status: 500 });
   }
}
