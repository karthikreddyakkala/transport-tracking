import { db } from "./db";
import { historicalData, busStops, routeStops, busLocations, buses } from "./db/schema";
import { and, eq, between } from "drizzle-orm";
import { getMapboxDirections } from "./mapbox";
import { pusherServer, CHANNELS, EVENTS } from "./pusher";

/** Haversine formula — distance in km between two lat/lng points */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

/** Decode polyline6 (1.0e6 precision) into [lng, lat] coordinates */
export function decodePolyline6(encoded: string): [number, number][] {
  let index = 0, lat = 0, lng = 0, coordinates: [number, number][] = [], shift = 0, result = 0, byte = null, factor = 1e6;
  while (index < encoded.length) {
    byte = null; shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
    byte = null; shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

/** Nearest point on segment [a→b] to point p, all [lng, lat] */
export function nearestPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Get [lat, lng] point at a specific distance (km) along a polyline */
export function getPointAtDistance(geometry: [number, number][], distanceKm: number): { lat: number, lng: number } {
  if (geometry.length === 0) return { lat: 0, lng: 0 };
  if (distanceKm <= 0) return { lat: geometry[0][1], lng: geometry[0][0] };

  let currentDist = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    const segmentDist = haversineDistance(p1[1], p1[0], p2[1], p2[0]);
    
    if (currentDist + segmentDist >= distanceKm) {
      const remaining = distanceKm - currentDist;
      const t = segmentDist > 0 ? remaining / segmentDist : 0;
      return {
        lat: p1[1] + (p2[1] - p1[1]) * t,
        lng: p1[0] + (p2[0] - p1[0]) * t,
      };
    }
    currentDist += segmentDist;
  }
  
  const last = geometry[geometry.length - 1];
  return { lat: last[1], lng: last[0] };
}

/** Get distance along geometry in km to the nearest point to (lat, lng) */
export function getDistanceAlongGeometry(geometry: [number, number][], lat: number, lng: number): number {
  if (geometry.length < 2) return 0;
  let minDist = Infinity;
  let distanceAlong = 0;
  let bestDistanceAlong = 0;
  
  for (let i = 0; i < geometry.length - 1; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const segmentLength = haversineDistance(a[1], a[0], b[1], b[0]);
    
    const p = nearestPointOnSegment([lng, lat], a, b);
    const d = (p[0] - lng) ** 2 + (p[1] - lat) ** 2;
    
    if (d < minDist) {
      minDist = d;
      const distFromA = haversineDistance(a[1], a[0], p[1], p[0]);
      bestDistanceAlong = distanceAlong + distFromA;
    }
    distanceAlong += segmentLength;
  }
  return bestDistanceAlong;
}

export interface ETAPrediction {
  stopId: string;
  stopName: string;
  minutesAway: number;
  arrivalTime: string;
  scheduledArrivalTime: string;
  confidence: number;
  distanceKm: number; // cumulative from start
  remainingDistToStopKm: number; // distance from bus to this stop
  isPassed: boolean;
}

/**
 * Calculate ETAs for all stops on a route using Mapbox and current GPS data.
 * Keeping for backward compatibility if called, but uses calculateLiveState logic internally.
 */
export async function calculateETAs(params: {
  busId: string;
  routeId: string;
  currentLat: number;
  currentLng: number;
  currentSpeed: number; // km/h
  currentStopIndex: number;
  isReverse?: boolean;
  scheduledStartTime?: string | null;
}): Promise<ETAPrediction[]> {
  const { busId } = params;
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
  if (!bus) return [];
  const state = calculateLiveState(bus);
  if (!state) return [];
  return state.stops.map((s: any) => ({
    stopId: s.stopId,
    stopName: s.stopName,
    minutesAway: Math.round((Math.max(0, s.roadDistance - state.distanceCovered) / (state.speed || 40)) * 60),
    arrivalTime: s.liveArrivalTime,
    scheduledArrivalTime: s.scheduledArrivalTime,
    confidence: bus.status === "active" ? 90 : 70,
    distanceKm: s.roadDistance,
    remainingDistToStopKm: Math.max(0, s.roadDistance - state.distanceCovered),
    isPassed: s.status === "arrived" || s.status === "start"
  }));
}

/**
 * CENTRALIZED CALCULATIONS ENGINE
 * Calculates unified real-time tracking properties for a pre-fetched bus.
 */
export function calculateLiveState(bus: any) {
  if (!bus) return null;
  const loc = bus.location;
  const trackingMode = loc?.trackingMode || "simulation";
  const stops = bus.route?.routeStops || [];
  const totalDistance = bus.route?.distance || 0;
  const geometry = bus.route?.geometry ? decodePolyline6(bus.route.geometry) : [];
  
  const distanceCovered = loc?.distanceCovered || 0;
  const speed = loc?.speed || 0;
  const safeSpeed = speed > 0 ? speed : 40;
  const startTime = bus.actualStartTime ? new Date(bus.actualStartTime).getTime() : Date.now();
  
  // Position
  const position = getPointAtDistance(geometry, distanceCovered);

  // progress
  const progress = totalDistance > 0 ? Math.min(100, Math.round((distanceCovered / totalDistance) * 100)) : 0;

  // estimatedEndTime = startTime + (totalDistance / safeSpeed) * 3600000
  const estimatedEndTime = new Date(startTime + (totalDistance / safeSpeed) * 3600000).toISOString();

  // Scheduled Start Time
  let scheduledBase = new Date();
  const sTime = bus.scheduledStartTime;
  if (sTime instanceof Date) {
    scheduledBase = new Date(sTime);
  } else if (typeof sTime === "string" && sTime.includes(":")) {
    const [h, m] = sTime.split(":").map(Number);
    scheduledBase.setHours(h, m, 0, 0);
  } else if (sTime) {
    scheduledBase = new Date(sTime);
  } else {
    scheduledBase.setHours(9, 0, 0, 0);
  }

  // Scheduled end time
  let scheduledEnd = new Date(scheduledBase.getTime() + 60 * 60 * 1000); // 1 hour duration default
  if (bus.endTime) {
    if (bus.endTime instanceof Date) {
      scheduledEnd = new Date(bus.endTime);
    } else if (typeof bus.endTime === "string" && bus.endTime.includes(":")) {
      const [h, m] = bus.endTime.split(":").map(Number);
      scheduledEnd.setHours(h, m, 0, 0);
      if (scheduledEnd <= scheduledBase) {
        scheduledEnd.setDate(scheduledEnd.getDate() + 1);
      }
    } else {
      scheduledEnd = new Date(bus.endTime);
    }
  }
  const totalDurationMins = (scheduledEnd.getTime() - scheduledBase.getTime()) / 60000;

  // Expected distance at this current time for delay calculation
  let expectedDistance = distanceCovered;
  if (bus.scheduledStartTime && bus.endTime) {
    const sStart = new Date(bus.scheduledStartTime).getTime();
    let sEnd = new Date(bus.endTime).getTime();
    if (sEnd <= sStart) sEnd += 24 * 3600000;
    const totalRouteTime = (sEnd - sStart);
    const elapsedSinceScheduled = Date.now() - sStart;
    expectedDistance = Math.min(totalDistance, Math.max(0, (elapsedSinceScheduled / totalRouteTime) * totalDistance));
  }
  const delayMinutes = Math.round(((distanceCovered - expectedDistance) / safeSpeed) * 60);

  let nextStopData: any = null;
  let prevStopData: any = null;
  let lastStopData: any = null;
  let cumulativeDist = 0;
  
  const stopsTimeline = stops.map((rs: any, idx: number) => {
    const lat = Number(rs.stop?.latitude);
    const lng = Number(rs.stop?.longitude);
    
    if (geometry.length > 0 && !isNaN(lat) && !isNaN(lng)) {
      const calculatedDist = getDistanceAlongGeometry(geometry, lat, lng);
      cumulativeDist = idx === 0 ? 0 : Math.max(cumulativeDist + 0.01, calculatedDist);
    } else {
      const stopDist = rs.distanceFromPrev || 0;
      cumulativeDist = stopDist > 0 ? stopDist : (idx === 0 ? 0 : cumulativeDist + 1);
    }
    
    const isPassed = distanceCovered >= cumulativeDist - 0.05;
    const remainingDist = Math.max(0, cumulativeDist - distanceCovered);
    
    // Live time: predicted live arrival
    let liveTime: Date;
    if (idx === 0) {
      liveTime = new Date(startTime);
    } else if (idx === stops.length - 1) {
      liveTime = new Date(estimatedEndTime);
    } else {
      liveTime = new Date(startTime + (cumulativeDist / safeSpeed) * 3600000);
    }

    // Scheduled time: use estimatedMinutesFromStart or proportional
    let scheduledTime: Date;
    if (rs.estimatedMinutesFromStart !== undefined && rs.estimatedMinutesFromStart !== null && rs.estimatedMinutesFromStart > 0) {
      scheduledTime = new Date(scheduledBase.getTime() + rs.estimatedMinutesFromStart * 60000);
    } else {
      const progressFraction = totalDistance > 0 ? cumulativeDist / totalDistance : 0;
      scheduledTime = new Date(scheduledBase.getTime() + (progressFraction * totalDurationMins * 60000));
    }

    // Status: start | arrived | upcoming | final
    let status: "start" | "arrived" | "upcoming" | "final" = "upcoming";
    if (idx === 0) {
      status = "start";
    } else if (isPassed) {
      status = "arrived";
    } else if (idx === stops.length - 1) {
      status = "final";
    }

    const stopData = {
      stopId: rs.stopId,
      stopName: rs.stop.name,
      name: rs.stop.name, // fallback
      roadDistance: Math.round(cumulativeDist * 10) / 10,
      distanceKm: Math.round(cumulativeDist * 10) / 10, // fallback
      liveArrivalTime: liveTime.toISOString(),
      scheduledArrivalTime: scheduledTime.toISOString(),
      scheduledTime: scheduledTime.toISOString(), // fallback
      status,
      isPassed // fallback
    };

    if (!isPassed && !nextStopData) {
      nextStopData = stopData;
      prevStopData = lastStopData;
    }

    lastStopData = stopData;
    return stopData;
  });

  return {
    busId: bus.id,
    id: bus.id, // fallback
    number: bus.number, // fallback
    status: bus.status, // fallback
    speed,
    progress,
    trackingMode,
    prevStopDist: trackingMode === "simulation" ? (prevStopData ? prevStopData.roadDistance : 0) : undefined,
    nextStopDist: trackingMode === "simulation" ? (nextStopData ? nextStopData.roadDistance : (stopsTimeline[0]?.roadDistance || 0)) : undefined,
    prevStopETA: trackingMode === "simulation" ? (prevStopData ? prevStopData.liveArrivalTime : new Date(startTime).toISOString()) : undefined,
    nextStopETA: trackingMode === "simulation" ? (nextStopData ? nextStopData.liveArrivalTime : estimatedEndTime) : undefined,
    nextStop: nextStopData ? nextStopData.stopName : "FINISH",
    nextStopArrivalTime: nextStopData ? nextStopData.liveArrivalTime : estimatedEndTime,
    actualStartTime: bus.actualStartTime ? new Date(bus.actualStartTime).toISOString() : new Date().toISOString(),
    estimatedEndTime,
    distanceCovered,
    routeDistance: totalDistance,
    totalDistance, // fallback
    currentPosition: { lat: position.lat, lng: position.lng },
    position: { lat: position.lat, lng: position.lng }, // fallback
    delayMinutes,
    remainingDistance: nextStopData ? Math.max(0, nextStopData.roadDistance - distanceCovered) : 0,
    route: bus.route ? {
      name: bus.route.name,
      startPoint: bus.route.startPoint,
      endPoint: bus.route.endPoint,
    } : null, // fallback
    stops: stopsTimeline
  };
}
