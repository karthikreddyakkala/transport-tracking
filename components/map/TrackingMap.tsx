"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getPusherClient, CHANNELS, EVENTS } from "@/lib/pusher";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface BusLocation {
  busId: string;
  busNumber: string;
  routeId: string;
  routeColor: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  prevStopDist?: number;
  nextStopDist?: number;
  prevStopETA?: string;
  nextStopETA?: string;
  totalRoadDistance?: number;
  distanceCovered?: number;
  status?: string;
  geometry?: string;
  trackingMode?: "live" | "simulation";
}

interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Route {
  id: string;
  number: string;
  name: string;
  color: string;
  routeStops: Array<{ stop: Stop; stopOrder: number }>;
  geometry?: string;
}

interface TrackingMapProps {
  routes?: Route[];
  initialBuses?: BusLocation[];
  liveBuses?: any[];
  center?: [number, number];
  zoom?: number;
  onBusClick?: (busId: string) => void;
  onStopClick?: (stopId: string) => void;
  selectedBusId?: string | null;
  fitToRoute?: boolean;
  trackingMode?: "live" | "simulation";
  onTrackingModeChange?: (mode: "live" | "simulation") => void;
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Decode polyline6 (1.0e6 precision) into [lng, lat] coordinates */
function decodePolyline6(encoded: string): [number, number][] {
  let index = 0, lat = 0, lng = 0, coordinates: [number, number][] = [], shift = 0, result = 0, byte = null, latitude_change, longitude_change, factor = 1e6;
  while (index < encoded.length) {
    byte = null; shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change;
    byte = null; shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += longitude_change;
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

/** Nearest point on segment [a→b] to point p, all [lng, lat] */
function nearestPointOnSegment(
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

/** Snap a [lng, lat] point to the nearest position on a polyline */
function snapToPolyline(lng: number, lat: number, geom: [number, number][]): [number, number] {
  let minDist = Infinity;
  let best: [number, number] = [lng, lat];
  for (let i = 0; i < geom.length - 1; i++) {
    const p = nearestPointOnSegment([lng, lat], geom[i], geom[i + 1]);
    const d = (p[0] - lng) ** 2 + (p[1] - lat) ** 2;
    if (d < minDist) { minDist = d; best = p; }
  }
  return best;
}

/** Haversine formula — distance in km between two lat/lng points */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Total length of a polyline in km */
function getLineLength(coords: [number, number][]): number {
  let length = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    length += haversineDistance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }
  return length;
}

/** Get [lng, lat] point at a specific distance (km) along a polyline */
function getPointAtDistance(geometry: [number, number][], distanceKm: number): [number, number] {
  if (geometry.length === 0) return [0, 0];
  if (distanceKm <= 0) return geometry[0];

  let currentDist = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    const segmentDist = haversineDistance(p1[1], p1[0], p2[1], p2[0]);
    
    if (currentDist + segmentDist >= distanceKm) {
      const remaining = distanceKm - currentDist;
      const t = segmentDist > 0 ? remaining / segmentDist : 0;
      return [
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t,
      ];
    }
    currentDist += segmentDist;
  }
  
  return geometry[geometry.length - 1];
}

/** Get distance (km) along a polyline to the snapped point */
function getDistanceAlongGeometry(geometry: [number, number][], snappedPoint: [number, number]): number {
  let totalDist = 0;
  let minDistToSegment = Infinity;
  let bestDist = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    
    const closest = nearestPointOnSegment(snappedPoint, p1, p2);
    const distToSegment = (closest[0] - snappedPoint[0]) ** 2 + (closest[1] - snappedPoint[1]) ** 2;
    
    const segmentDist = haversineDistance(p1[1], p1[0], p2[1], p2[0]);
    
    if (distToSegment < minDistToSegment) {
      minDistToSegment = distToSegment;
      const distFromP1 = haversineDistance(p1[1], p1[0], closest[1], closest[0]);
      bestDist = totalDist + distFromP1;
    }
    
    totalDist += segmentDist;
  }
  
  return bestDist;
}

/** Slice geometry starting from a specific distance (km) to the end */
function sliceGeometryAtDistance(geometry: [number, number][], startDistanceKm: number): [number, number][] {
  if (geometry.length === 0) return [];
  if (startDistanceKm <= 0) return [...geometry];

  const sliced: [number, number][] = [];
  let currentDist = 0;
  let startPointAdded = false;

  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    const segmentDist = haversineDistance(p1[1], p1[0], p2[1], p2[0]);

    if (!startPointAdded) {
      if (currentDist + segmentDist >= startDistanceKm) {
        const remaining = startDistanceKm - currentDist;
        const t = segmentDist > 0 ? remaining / segmentDist : 0;
        const startPoint: [number, number] = [
          p1[0] + (p2[0] - p1[0]) * t,
          p1[1] + (p2[1] - p1[1]) * t,
        ];
        sliced.push(startPoint);
        startPointAdded = true;
      }
    }

    if (startPointAdded) {
      sliced.push(p2);
    }

    currentDist += segmentDist;
  }

  if (sliced.length === 0) {
    return [geometry[geometry.length - 1]];
  }

  return sliced;
}


// ─── Mapbox Directions API ───────────────────────────────────────────────────

async function fetchRoadGeometry(stops: Stop[], token: string): Promise<[number, number][] | null> {
  if (stops.length < 2) return null;
  const waypoints = stops
    .slice(0, 25)
    .map((s) => `${s.longitude},${s.latitude}`)
    .join(";");
  try {
    const rawUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?geometries=polyline6&overview=full&access_token=${token}`;
    const url = `/api/mapbox-proxy?url=${encodeURIComponent(rawUrl)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.routes?.[0]?.geometry) {
       return decodePolyline6(data.routes[0].geometry);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Bus SVG icon ────────────────────────────────────────────────────────────

const BUS_SVG = (color: string) => `
<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="17" cy="17" r="16" fill="${color}" stroke="white" stroke-width="2.5"/>
  <text x="17" y="22" text-anchor="middle" fill="white" font-size="15" font-weight="bold">🚌</text>
</svg>`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function TrackingMap({
  routes = [],
  initialBuses = [],
  liveBuses = [],
  center,
  zoom,
  onBusClick,
  onStopClick,
  selectedBusId,
  fitToRoute = false,
  trackingMode,
  onTrackingModeChange,
}: TrackingMapProps) {
  const [localTrackingMode, setLocalTrackingMode] = useState<"live" | "simulation">("simulation");

  useEffect(() => {
    if (trackingMode) {
      setLocalTrackingMode(trackingMode);
    }
  }, [trackingMode]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const busMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const stopMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // Cache road geometry per routeId so bus positions can be snapped
  const routeGeomRef = useRef<Map<string, [number, number][]>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const busInterpolationRef = useRef<Map<string, BusLocation>>(new Map());
  const requestRef = useRef<number>(null);

  const updateRouteLine = useCallback((routeId: string, currentDistKm: number) => {
    if (!map.current) return;
    const sourceId = `route-${routeId}`;
    const geom = routeGeomRef.current.get(routeId);
    if (!geom) return;

    const slicedGeom = sliceGeometryAtDistance(geom, currentDistKm);
    
    const source = map.current.getSource(sourceId) as mapboxgl.GeoJSONSource;
    if (source) {
      if (slicedGeom.length < 2) {
        source.setData({
          type: "FeatureCollection",
          features: []
        } as any);
      } else {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: slicedGeom,
          },
        });
      }
    }
  }, []);

  // ── Navigation & Auto-Follow State ──
  const [isAutoFollowing, setIsAutoFollowing] = useState(false);
  const [is3DNavMode, setIs3DNavMode] = useState(false);
  const [hasInterrupted, setHasInterrupted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"LIVE" | "WEAK" | "DISCONNECTED">("DISCONNECTED");
  
  const autoFollowRef = useRef(isAutoFollowing);
  const navModeRef = useRef(is3DNavMode);
  const lastPingMapRef = useRef<Map<string, number>>(new Map());
  const resumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { autoFollowRef.current = isAutoFollowing; }, [isAutoFollowing]);
  useEffect(() => { navModeRef.current = is3DNavMode; }, [is3DNavMode]);

  // Sync Nav Mode to storage
  useEffect(() => {
     const saved = localStorage.getItem("tracking_nav_mode");
     if (saved === "3d") setIs3DNavMode(true);
  }, []);

  const centerLng = center?.[0] ?? parseFloat(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? "80.6480");
  const centerLat = center?.[1] ?? parseFloat(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? "16.5062");
  const mapZoom = zoom ?? parseFloat(process.env.NEXT_PUBLIC_MAP_ZOOM ?? "14");

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [centerLng, centerLat],
      zoom: mapZoom
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("error", (e: any) => {
      // Gracefully log transient styling or network failures, preventing overlay crashes
      if (e.message?.includes("style") || e.error?.message?.includes("style") || e.message?.includes("fetch")) {
        console.warn("Gracefully handled Mapbox loading error:", e.message || e.error?.message);
        return;
      }
      console.warn("Mapbox GL error:", e);
    });
    
    // Disable auto-follow when the user explicitly interacts (drags/zooms) the map manually
    const handleInterrupt = (e: any) => {
       if (e.originalEvent && autoFollowRef.current) {
          setIsAutoFollowing(false);
          setHasInterrupted(true);
          
          if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
          resumeTimeoutRef.current = setTimeout(() => {
             setIsAutoFollowing(true);
             setHasInterrupted(false);
          }, 15000); // 15s auto-resume
       }
    };
    
    map.current.on("dragstart", handleInterrupt);
    map.current.on("zoomstart", handleInterrupt);

    const safetyTimer = setTimeout(() => {
      console.warn("Mapbox load took too long or failed; triggering safety load fallback.");
      setMapLoaded(true);
    }, 4500);

    map.current.on("style.load", () => {
      clearTimeout(safetyTimer);
      setMapLoaded(true);
    });

    map.current.on("load", () => {
      clearTimeout(safetyTimer);
      setMapLoaded(true);
    });

    // Handle tab switching / visibility changes
    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize();
    });
    resizeObserver.observe(mapContainer.current);

    return () => {
      clearTimeout(safetyTimer);
      resizeObserver.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ── Draw road-following routes + stop markers ──────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    routes.forEach(async (route) => {
      const stops = [...(route.routeStops || [])]
        .sort((a, b) => a.stopOrder - b.stopOrder)
        .map((rs) => rs.stop);

      if (stops.length < 2) return;

      const sourceId = `route-${route.id}`;

      // Fetch road geometry; prioritize stored geometry, fall back to API, then straight lines
      let geometry: [number, number][] = [];
      
      if (route.geometry) {
         try {
            geometry = decodePolyline6(route.geometry);
         } catch {
            geometry = [];
         }
      }
      
      if (geometry.length === 0) {
         const roadCoords = await fetchRoadGeometry(stops, token);
         geometry = roadCoords ?? stops.map((s) => [s.longitude, s.latitude]);
      }

      // Initial trim if bus position is known
      const busForRoute = initialBuses.find(b => b.routeId === route.id) || liveBuses?.find(b => b.routeId === route.id);
      let initialGeom = geometry;
      if (busForRoute && busForRoute.distanceCovered !== undefined && busForRoute.distanceCovered > 0) {
         initialGeom = sliceGeometryAtDistance(geometry, busForRoute.distanceCovered);
      }

      // Cache FULL geometry for bus snapping logic
      routeGeomRef.current.set(route.id, geometry);

      if (!map.current) return;

      const addRouteLayers = () => {
        if (!map.current || map.current.getSource(sourceId)) return;
        try {
          map.current.addSource(sourceId, {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: initialGeom } },
          });

          // White outline underneath for readability
          map.current.addLayer({
            id: `casing-${route.id}`,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.85 },
          });

          // Colored route line on top
          map.current.addLayer({
            id: `line-${route.id}`,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": route.color, "line-width": 5, "line-opacity": 1 },
          });
        } catch (error) {
          console.warn("Failed mapping route layer:", error);
        }
      };

      if (map.current.isStyleLoaded()) {
        addRouteLayers();
      } else {
        map.current.once("style.load", addRouteLayers);
      }

      // ── Stop markers ──────────────────────────────────────────────────────
      stops.forEach((stop, i) => {
        if (stopMarkersRef.current.has(stop.id)) return;

        const isTerminal = i === 0 || i === stops.length - 1;

        /**
         * KEY FIX: Mapbox GL uses `transform: translate(X,Y)` on the MARKER
         * ELEMENT to position it on screen. Applying scale/other transforms to
         * that element overrides Mapbox's translate and teleports the marker.
         *
         * Solution: `wrapper` is the element Mapbox controls — never touch its
         * transform. `inner` is a child element we control for hover/animation.
         */
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `
          width: ${isTerminal ? 24 : 18}px;
          height: ${isTerminal ? 24 : 18}px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        `;

        const inner = document.createElement("div");
        inner.style.cssText = `
          width: ${isTerminal ? 16 : 11}px;
          height: ${isTerminal ? 16 : 11}px;
          background: ${isTerminal ? route.color : "#ffffff"};
          border: ${isTerminal ? "3" : "2.5"}px solid ${route.color};
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          transition: transform 0.15s ease;
          flex-shrink: 0;
        `;
        wrapper.appendChild(inner);

        // Popup for hover — attached to map, not marker, to avoid click toggle
        const popup = new mapboxgl.Popup({
          offset: isTerminal ? 16 : 12,
          closeButton: false,
          closeOnClick: false,
          className: "stop-popup",
        }).setHTML(`
          <div style="font-weight:700;color:${route.color};font-size:13px">
            ${isTerminal && i === 0 ? "● " : isTerminal ? "■ " : ""}${stop.name}
          </div>
          <div style="font-size:11px;color:#666;margin-top:3px">
            Stop ${i + 1} of ${stops.length} · Route ${route.number}
          </div>
        `);

        // Scale inner on hover, show/hide popup
        wrapper.addEventListener("mouseenter", () => {
          inner.style.transform = "scale(1.5)";
          popup.setLngLat([stop.longitude, stop.latitude]).addTo(map.current!);
        });
        wrapper.addEventListener("mouseleave", () => {
          inner.style.transform = "";
          popup.remove();
        });

        wrapper.addEventListener("click", () => onStopClick?.(stop.id));

        const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
          .setLngLat([stop.longitude, stop.latitude])
          .addTo(map.current!);

        stopMarkersRef.current.set(stop.id, marker);
      });
    });
  }, [mapLoaded, routes]);

  // ── Place/update a bus marker, snapping to road geometry ──────────────────
  const updateBusMarker = useCallback(
    (bus: BusLocation, durationMs: number = 1200) => {
      if (!map.current) return;

      // Snap position to the road geometry for this route
      const geom = routeGeomRef.current.get(bus.routeId);
      
      let displayLng = bus.longitude;
      let displayLat = bus.latitude;

      if (geom) {
         if (bus.distanceCovered !== undefined) {
            // Priority 1: Use simulated distanceCovered for perfect sync
            const totalDist = bus.totalRoadDistance || getLineLength(geom);
            let effectiveDist = bus.distanceCovered;
            
            // Clamp distance to total route distance
            if (effectiveDist >= totalDist || bus.status === 'completed') {
               effectiveDist = totalDist;
            }
            
            // Debug Log
            console.log(`[MAP DEBUG] Bus: ${bus.busNumber}, Dist: ${effectiveDist.toFixed(2)}/${totalDist.toFixed(2)} KM, Status: ${bus.status}`);

            const pos = getPointAtDistance(geom, effectiveDist);
            displayLng = pos[0];
            displayLat = pos[1];
            
            updateRouteLine(bus.routeId, effectiveDist);
         } else {
            // Priority 2: Use GPS with snapping
            const snapped = snapToPolyline(bus.longitude, bus.latitude, geom);
            displayLng = snapped[0];
            displayLat = snapped[1];
            
            const effectiveDist = getDistanceAlongGeometry(geom, snapped);
            updateRouteLine(bus.routeId, effectiveDist);
         }
      }

      const existing = busMarkersRef.current.get(bus.busId);
      if (existing) {
        // If the animation loop is handling this bus, don't set transitions here
        if (!bus.nextStopETA) {
           existing.getElement().style.transition = `transform ${durationMs}ms linear`;
           existing.setLngLat([displayLng, displayLat]);
        }

        // Rotate the INNER element (not the wrapper Mapbox controls)
        const inner = existing.getElement().querySelector<HTMLElement>(".bus-inner");
        if (inner) inner.style.transform = `rotate(${bus.heading}deg)`;

        // Update popup content
        const popup = existing.getPopup();
        if (popup) {
          popup.setHTML(`
            <div style="font-weight:700;font-size:13px">Bus ${bus.busNumber}</div>
            <div style="font-size:11px;color:#666;margin-top:3px">🚀 ${Math.round(bus.speed)} km/h</div>
          `);
        }
        return;
      }

      // Create new bus marker — wrapper for Mapbox, inner for our transforms
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `
        width: 38px;
        height: 38px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 3px 8px rgba(0,0,0,0.45));
        /* Transition is managed dynamically by loop or updateBusMarker */
      `;

      const inner = document.createElement("div");
      inner.className = "bus-inner";
      inner.innerHTML = BUS_SVG(bus.routeColor || "#3B82F6");
      inner.style.cssText = `
        width: 34px;
        height: 34px;
        transform: rotate(${bus.heading}deg);
        transform-origin: center;
        transition: transform 0.5s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      wrapper.appendChild(inner);

      wrapper.addEventListener("click", () => onBusClick?.(bus.busId));

      if (displayLng === undefined || displayLat === undefined) return;

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
        .setLngLat([displayLng, displayLat])
        .setPopup(
          new mapboxgl.Popup({ offset: 22, closeButton: false }).setHTML(`
            <div style="font-weight:700;font-size:13px">Bus ${bus.busNumber}</div>
            <div style="font-size:11px;color:#666;margin-top:3px">🚀 ${Math.round(bus.speed)} km/h</div>
          `)
        )
        .addTo(map.current);

      busMarkersRef.current.set(bus.busId, marker);
    },
    [onBusClick]
  );

  // ── Animation loop for smooth movement ──────────────────────────────────
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      
      busInterpolationRef.current.forEach((bus) => {
        const marker = busMarkersRef.current.get(bus.busId);
        if (!marker || !bus.nextStopETA || !bus.prevStopETA) return;

        const geom = routeGeomRef.current.get(bus.routeId);
        if (!geom) return;

        const prevTime = new Date(bus.prevStopETA).getTime();
        const nextTime = new Date(bus.nextStopETA).getTime();
        const totalSegmentTime = nextTime - prevTime;
        
        if (totalSegmentTime <= 0) return;

        // 1. Calculate progress (0 -> 1)
        let progress = (now - prevTime) / totalSegmentTime;
        
        // 2. Handle Stop Dwell / Clamping
        // If boarding, keep at previous stop distance
        if (bus.status === "boarding") {
           progress = 0;
        } else {
           progress = Math.max(0, Math.min(1, progress));
        }

        // 3. Current Distance along route
        const segmentDist = (bus.nextStopDist || 0) - (bus.prevStopDist || 0);
        const currentDist = (bus.prevStopDist || 0) + (progress * segmentDist);

        // 4. Get Coordinate
        const [lng, lat] = getPointAtDistance(geom, currentDist);

        // 5. Update Marker Position (Remove CSS transition for frame-perfect loop)
        marker.getElement().style.transition = 'none';
        marker.setLngLat([lng, lat]);

        // Update Route Line dynamically!
        if (bus.status === 'completed') {
           const totalDist = bus.totalRoadDistance || getLineLength(geom);
           updateRouteLine(bus.routeId, totalDist);
        } else {
           updateRouteLine(bus.routeId, currentDist);
        }

        // Auto-follow logic in loop for maximum smoothness
        if (bus.busId === selectedBusId && map.current && autoFollowRef.current) {
          map.current.setCenter([lng, lat]);
          if (navModeRef.current) {
            map.current.setBearing(bus.heading);
            map.current.setPitch(60);
          }
        }
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [selectedBusId]);

  // ── Render initial buses ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    initialBuses.forEach((bus) => updateBusMarker(bus));
  }, [mapLoaded, initialBuses, updateBusMarker]);

  // ── liveBuses from API polling (Single Source of Truth) ───────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current || !liveBuses || liveBuses.length === 0) return;
    
    liveBuses.forEach((data) => {
      const now = Date.now();
      const lastPing = lastPingMapRef.current.get(data.busId) || now;
      let durationMs = now - lastPing;
      if (durationMs < 500) durationMs = 1200;
      if (durationMs > 10000) durationMs = 10000;
      
      lastPingMapRef.current.set(data.busId, now);
      
      if (durationMs < 15000) setConnectionStatus("LIVE");
      else if (durationMs < 30000) setConnectionStatus("WEAK");
      else setConnectionStatus("DISCONNECTED");
      
      if (data.geometry) {
         try {
            const decoded = decodePolyline6(data.geometry);
            routeGeomRef.current.set(data.routeId, decoded);
         } catch (e) {
            console.error("Failed to decode geometry update", e);
         }
      }

      busInterpolationRef.current.set(data.busId, data);

      if (data.busId === selectedBusId) {
         if (data.trackingMode) {
            setLocalTrackingMode(data.trackingMode);
         }
         if (data.fallbackAlert) {
            toast.warning("GPS SIGNAL LOST — FALLING BACK TO SIMULATION", {
               duration: 8000,
               position: "top-center"
            });
         }
      }
      
      updateBusMarker(data, durationMs);
    });
  }, [mapLoaded, liveBuses, updateBusMarker, selectedBusId]);


  // ── Pusher real-time updates ───────────────────────────────────────────────
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(CHANNELS.BUS_TRACKING);

    channel.bind(EVENTS.LOCATION_UPDATE, (data: BusLocation) => {
      // Diagnostic Calculations
      const now = Date.now();
      const lastPing = lastPingMapRef.current.get(data.busId) || now;
      let durationMs = now - lastPing;
      if (durationMs < 500) durationMs = 1200; // default smoothly
      if (durationMs > 10000) durationMs = 10000; // clamp excessive jumping distances
      
      lastPingMapRef.current.set(data.busId, now);
      
      // Update global Connection Status
      if (durationMs < 15000) setConnectionStatus("LIVE");
      else if (durationMs < 30000) setConnectionStatus("WEAK");
      else setConnectionStatus("DISCONNECTED");
      
      // Update geometry cache if provided
      if (data.geometry) {
         try {
            const decoded = decodePolyline6(data.geometry);
            routeGeomRef.current.set(data.routeId, decoded);
         } catch (e) {
            console.error("Failed to decode geometry update", e);
         }
      }

      // Update interpolation target
      busInterpolationRef.current.set(data.busId, data);

      if (data.busId === selectedBusId) {
         if (data.trackingMode) {
            setLocalTrackingMode(data.trackingMode);
         }
         if ((data as any).fallbackAlert) {
            toast.warning("GPS SIGNAL LOST — FALLING BACK TO SIMULATION", {
               duration: 8000,
               position: "top-center"
            });
         }
      }
      
      // Update marker (initial placement or static updates)
      updateBusMarker(data, durationMs);
      
      // Auto-follow logic removed from here, handled in animation loop
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(CHANNELS.BUS_TRACKING);
    };
  }, [updateBusMarker, selectedBusId, fitToRoute]);

  // ── Highlight selected bus (scale the inner element) ──────────────────────

  
  useEffect(() => {
    busMarkersRef.current.forEach((marker, busId) => {
      const inner = marker.getElement().querySelector<HTMLElement>(".bus-inner");
      if (!inner) return;
      const isSelected = busId === selectedBusId;
      const currentRotate = inner.style.transform.match(/rotate\([^)]+\)/)?.[0] ?? "";
      inner.style.transform = `${currentRotate} scale(${isSelected ? 1.45 : 1})`;
      marker.getElement().style.filter = isSelected
        ? "drop-shadow(0 5px 14px rgba(0,0,0,0.65))"
        : "drop-shadow(0 3px 8px rgba(0,0,0,0.45))";
      marker.getElement().style.zIndex = isSelected ? "10" : "1";
    });
  }, [selectedBusId]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    
    if (fitToRoute && routes.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      routes.forEach(route => {
        const geom = routeGeomRef.current.get(route.id);
        if (geom) {
          geom.forEach(coord => bounds.extend(coord));
        } else {
          route.routeStops.forEach(rs => bounds.extend([rs.stop.longitude, rs.stop.latitude]));
        }
      });
      
      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, { padding: 80, duration: 1500 });
      }
    } else if (selectedBusId) {
      setIsAutoFollowing(true); // Automatically engage follow on snap
      const marker = busMarkersRef.current.get(selectedBusId);
      if (marker) {
        const coords = marker.getLngLat();
        map.current.flyTo({
          center: coords,
          zoom: 16,
          duration: 2000,
          essential: true
        });
      }
    }
  }, [mapLoaded, fitToRoute, selectedBusId, routes]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
         {selectedBusId && (
            onTrackingModeChange ? (
               <div className="flex bg-[#0F172A]/80 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] gap-1 shrink-0 select-none transition-all duration-300">
                  <button
                     onClick={() => onTrackingModeChange("live")}
                     className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 flex items-center gap-1.5 border border-transparent",
                        localTrackingMode === "live"
                           ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                           : "text-slate-400 hover:text-white"
                     )}
                  >
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                     📍 Live Location
                  </button>
                  <button
                     onClick={() => onTrackingModeChange("simulation")}
                     className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 flex items-center gap-1.5 border border-transparent",
                        localTrackingMode === "simulation"
                           ? "bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.4)]"
                           : "text-slate-400 hover:text-white"
                     )}
                  >
                     <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                     🚍 Simulation
                  </button>
               </div>
            ) : (
               <div className="flex bg-[#0F172A]/80 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] select-none transition-all duration-300">
                  {localTrackingMode === "live" ? (
                     <span className="px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5">
                        🟢 LIVE GPS
                     </span>
                  ) : (
                     <span className="px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.3)] flex items-center gap-1.5">
                        🟠 SIMULATION
                     </span>
                  )}
               </div>
            )
         )}
         {selectedBusId && (
            <button 
               onClick={() => {
                  setIsAutoFollowing(!isAutoFollowing);
                  setHasInterrupted(false);
               }}
               className={isAutoFollowing 
                  ? "bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-2 rounded-lg shadow-lg flex items-center justify-center gap-2" 
                  : "bg-white/90 hover:bg-white text-slate-800 font-bold text-xs px-3 py-2 rounded-lg shadow-lg border border-slate-200 flex items-center justify-center gap-2"
               }
            >
               {isAutoFollowing ? "📍 Following" : hasInterrupted ? "⚠️ Resume Follow" : "📍 Follow: OFF"}
            </button>
         )}
         <button 
            onClick={() => {
               if (!map.current) return;
               const bounds = new mapboxgl.LngLatBounds();
               busMarkersRef.current.forEach(m => bounds.extend(m.getLngLat()));
               if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 80, duration: 1500 });
               setIsAutoFollowing(false);
               setHasInterrupted(false);
            }}
            className="bg-slate-900/80 hover:bg-slate-900 text-white font-bold text-xs px-3 py-2 rounded-lg shadow-lg backdrop-blur-md transition-all flex items-center justify-center gap-2"
         >
            🌍 Fit All Buses
         </button>
      </div>

      <div className="absolute top-4 right-14 z-10 flex flex-wrap gap-2 justify-end max-w-[50%]">
         {/* Hybrid Tracking Mode */}
         {selectedBusId && isAutoFollowing && (
            <button
               onClick={() => {
                   const next = !is3DNavMode;
                   setIs3DNavMode(next);
                   localStorage.setItem("tracking_nav_mode", next ? "3d" : "north");
               }}
               className={is3DNavMode 
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] sm:text-xs px-3 py-2 rounded-lg shadow-lg transition-colors border border-indigo-500" 
                  : "bg-slate-800/90 hover:bg-slate-900 text-white font-bold text-[10px] sm:text-xs px-3 py-2 rounded-lg shadow-lg transition-colors backdrop-blur-sm"
               }
            >
               {is3DNavMode ? "🧭 3D Mode" : "⬆️ North-Up"}
            </button>
         )}

         {/* Connection Pill */}
         {selectedBusId && (
            <div className={`px-3 py-2 rounded-lg shadow-lg font-bold text-[10px] sm:text-xs flex items-center gap-2 transition-colors ${
               connectionStatus === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400 backdrop-blur-md border border-emerald-500/30' :
               connectionStatus === 'WEAK' ? 'bg-amber-500/20 text-amber-500 backdrop-blur-md border border-amber-500/30' :
               'bg-red-500/20 text-red-500 backdrop-blur-md border border-red-500/30'
            }`}>
               <span className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'LIVE' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' :
                  connectionStatus === 'WEAK' ? 'bg-amber-500' : 'bg-red-500'
               }`} />
               {connectionStatus === 'LIVE' ? 'LIVE' : connectionStatus === 'WEAK' ? 'WEAK SIGNAL' : 'OFFLINE'}
            </div>
         )}
      </div>

      <div ref={mapContainer} className="w-full h-full" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <div className="w-9 h-9 border-[3px] border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">Loading map…</p>
          </div>
        </div>
      )}
    </div>
  );
}
