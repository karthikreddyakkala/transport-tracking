export interface Coordinate {
  lat: number;
  lng: number;
}

export interface MapboxRouteLeg {
  distance: number; // meters
  duration: number; // seconds
  summary: string;
}

export interface MapboxRouteResponse {
  routes: {
    distance: number;
    duration: number;
    legs: MapboxRouteLeg[];
    geometry: string; // polyline
  }[];
  code: string;
}

// Simple in-memory cache to prevent API spam for same queries
// Cache keys format: "profile:[coords]"
const routeCache = new Map<string, { timestamp: number; data: MapboxRouteResponse }>();
const CACHE_TTL_MS = 45000; // 45 seconds

export async function getMapboxDirections(
  coordinates: Coordinate[],
  profile: "driving-traffic" | "driving" = "driving-traffic"
): Promise<MapboxRouteResponse | null> {
  if (coordinates.length < 2) return null;

  const cappedCoords = coordinates.slice(0, 25);
  const coordsString = cappedCoords.map((c) => `${c.lng},${c.lat}`).join(";");
  
  const cacheKey = `${profile}:${coordsString}`;
  const cached = routeCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  // Optimized for high fidelity: polyline6 for precision, overview=full for complete path
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsString}?access_token=${token}&geometries=polyline6&overview=full`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox API error: ${res.statusText}`);

    const data = await res.json() as MapboxRouteResponse;
    if (data.code === "Ok" && data.routes.length > 0) {
      routeCache.set(cacheKey, { timestamp: Date.now(), data });
      return data;
    }
    return null;
  } catch (error) {
    console.error("Mapbox routing failed", error);
    if (profile === "driving-traffic") return getMapboxDirections(coordinates, "driving");
    return null;
  }
}

/**
 * Snaps a single coordinate to the nearest road using Mapbox Map Matching API
 */
export async function snapToRoad(coord: Coordinate): Promise<Coordinate | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  // We use map-matching with a single point to find the nearest road coordinate
  // Radius of 25m ensures it snaps only to nearby roads
  const rawUrl = `https://api.mapbox.com/matching/v5/mapbox/driving/${coord.lng},${coord.lat}?access_token=${token}&radiuses=25&tidy=true`;
  const url = `/api/mapbox-proxy?url=${encodeURIComponent(rawUrl)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.code === "Ok" && data.matchings?.[0]?.waypoints?.[0]) {
      const snapped = data.matchings[0].waypoints[0].location;
      return { lng: snapped[0], lat: snapped[1] };
    }
    return null;
  } catch (e) {
    console.error("Snapping failed", e);
    return null;
  }
}
