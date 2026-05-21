import { NextRequest, NextResponse } from "next/server";
import { haversineDistance } from "@/lib/eta-calculator";
import { formatTime } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json([]);
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;

    if (!token) {
      // Mock Data Fallback
      return NextResponse.json([
        { name: "Centennial Square", lat: 15.3, lng: 75.1, distanceKm: 0 },
        { name: "Transit Hub East", lat: 15.4, lng: 75.2, distanceKm: 5.2 },
        { name: "Midway Crossings", lat: 15.6, lng: 75.4, distanceKm: 16.4 }
      ]);
    }

    // 1. Geocode Start Location
    const startRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(start)}.json?access_token=${token}&country=IN`);
    const startData = await startRes.json();
    const startCoords = startData.features?.[0]?.center;

    // 2. Geocode End Location
    const endRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(end)}.json?access_token=${token}&country=IN`);
    const endData = await endRes.json();
    const endCoords = endData.features?.[0]?.center;

    if (!startCoords || !endCoords) {
      return NextResponse.json([]);
    }

    // 3. Mapbox Directions API for Shortest Route Polyline
    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&overview=full&annotations=duration,distance&access_token=${token}`;
    const dirRes = await fetch(directionsUrl);
    const dirData = await dirRes.json();

    if (dirData.code !== "Ok" || !dirData.routes || dirData.routes.length === 0) {
       return NextResponse.json([]);
    }

    const route = dirData.routes[0];
    const coordinates = route.geometry.coordinates; // Array of [lng, lat]
    const legAnnotations = route.legs[0]?.annotation; // { distance: number[], duration: number[] }
    
    // 4. Sample evenly spaced intermediate points
    const numIntermediate = 14; 
    const totalDistance = route.distance / 1000;
    const intervalDist = totalDistance / (numIntermediate + 1);

    const startTimeParam = searchParams.get("startTime");
    let baseTime = null;
    if (startTimeParam) {
       const [h, m] = startTimeParam.split(':').map(Number);
       baseTime = new Date();
       baseTime.setHours(h, m, 0, 0);
    }
    
    const sampledPoints = [];
    sampledPoints.push({ lng: startCoords[0], lat: startCoords[1], dist: 0, seconds: 0 });

    let cumulativeDist = 0;
    let cumulativeSeconds = 0;
    let nextTargetDist = intervalDist;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const coord = coordinates[i+1];
        
        // Use annotation data if available for strict physical precision over traffic segments
        if (legAnnotations?.distance?.[i]) {
            cumulativeDist += (legAnnotations.distance[i] / 1000);
            cumulativeSeconds += legAnnotations.duration[i];
        } else {
            // Geographic Fallback
            const prev = coordinates[i];
            cumulativeDist += haversineDistance(prev[1], prev[0], coord[1], coord[0]);
            cumulativeSeconds += 60; // baseline primitive fallback
        }

        if (cumulativeDist >= nextTargetDist && sampledPoints.length <= numIntermediate) {
            sampledPoints.push({ lng: coord[0], lat: coord[1], dist: cumulativeDist, seconds: Math.round(cumulativeSeconds) });
            nextTargetDist += intervalDist;
        }
    }

    sampledPoints.push({ lng: endCoords[0], lat: endCoords[1], dist: totalDistance, seconds: route.duration });

    // 5. Reverse Geocode exact localities along the sampled geographical points
    const results: Array<{ name: string; lat: number; lng: number, distanceKm: number, arrivalTime?: string }> = [];
    
    for (let i = 0; i < sampledPoints.length; i++) {
        const p = sampledPoints[i];
        let placeName = "";

        if (i === 0 && start) {
            placeName = start.split(",")[0].trim();
        } else if (i === sampledPoints.length - 1 && end) {
            placeName = end.split(",")[0].trim();
        } else {
            const rRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${p.lng},${p.lat}.json?types=locality,place,neighborhood,poi&access_token=${token}`);
            const rData = await rRes.json();
            
            let feat = rData.features?.find((f: any) => f.place_type?.includes('place') || f.place_type?.includes('locality'));
            if (!feat) feat = rData.features?.[0];

            if (feat) {
               placeName = (feat.place_name || feat.text || "").split(",")[0].trim();
            }
        }
        
        if (placeName) {
            const cleanName = placeName.charAt(0).toUpperCase() + placeName.slice(1);
            // Deduplicate proximity explicitly over strict 2KM mathematical bounds
            const exists = results.find(x => x.name.toLowerCase() === cleanName.toLowerCase() || 
                                           haversineDistance(x.lat, x.lng, p.lat, p.lng) <= 2.0);
            
            if (!exists) {
                let formattedArrival = undefined;
                if (baseTime) {
                    const arrivalDate = new Date(baseTime.getTime() + (p.seconds * 1000));
                    formattedArrival = formatTime(arrivalDate);
                }

                results.push({
                   name: cleanName,
                   lat: p.lat,
                   lng: p.lng,
                   distanceKm: Math.round(p.dist * 10) / 10,
                   arrivalTime: formattedArrival
                });
            }
        }
    }

    return NextResponse.json(results);
    
  } catch (error) {
    console.error("Auto Stops Suggestion Error:", error);
    return NextResponse.json({ error: "Failed to generate route stops" }, { status: 500 });
  }
}
