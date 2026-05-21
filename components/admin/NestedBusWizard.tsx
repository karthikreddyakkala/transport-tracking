"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, X, Bus, Route as RouteIcon, MapPin, Loader2, ArrowRight, ArrowLeft, Check, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { formatTime, formatMinutes } from "@/lib/utils";
import { snapToRoad } from "@/lib/mapbox";

// Reusable Autocomplete Input
function LocationAutocomplete({ label, placeholder, value, onChange, onSelect }: { label: string, placeholder: string, value: string, onChange: (val: string) => void, onSelect?: (item: any) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<{name: string, secondary?: string, fullName: string, lat?: number, lng?: number}[]>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [skipSearch, setSkipSearch] = useState(false);

  // Sync if parent clears the form
  useEffect(() => {
    if (value === "") {
       setQuery("");
       setResults([]);
       setShow(false);
    } else {
       setQuery(value);
    }
  }, [value]);

  useEffect(() => {
    if (skipSearch) {
      setSkipSearch(false);
      return;
    }

    if (!query || query.length < 2) {
      setResults([]);
      setShow(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/locations?search=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShow(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 400); 
    
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-1.5 relative">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label} <span className="text-red-500">*</span></Label>
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value); 
        }}
        onFocus={() => { if (results.length > 0 || query) setShow(true); }}
        onBlur={() => setTimeout(() => setShow(false), 200)} 
        required
      />
      {show && query && (
        <div className="absolute top-[60px] left-0 right-0 z-[100] bg-background border border-border/60 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto w-full">
          {loading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching Maps...
            </div>
          ) : results.length > 0 ? (
            results.map((r, i) => (
              <div key={i} className="px-3 py-2.5 text-sm hover:bg-muted cursor-pointer flex flex-col gap-0.5 border-b border-border/50 last:border-0" 
                  onMouseDown={async (e) => {
                    e.preventDefault(); 
                    setSkipSearch(true);
                    setQuery(r.name);
                    onChange(r.name);
                    
                    if (onSelect && r.lat && r.lng) {
                       setIsSnapping(true);
                       const snapped = await snapToRoad({ lat: r.lat, lng: r.lng });
                       onSelect({
                         ...r,
                         lat: snapped?.lat || r.lat,
                         lng: snapped?.lng || r.lng,
                         isSnapped: !!snapped
                       });
                       setIsSnapping(false);
                    } else if (onSelect) {
                       onSelect(r);
                    }
                    setShow(false);
                  }}>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-indigo-500 shrink-0" /> 
                  <span className="font-bold text-foreground text-sm">{r.name}</span>
                  {r.secondary && <span className="text-[10px] text-muted-foreground font-normal truncate">• {r.secondary}</span>}
                </div>
                <span className="text-[9px] opacity-60 truncate pl-5.5">{r.fullName}</span>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No locations found</div>
          )}
          {isSnapping && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
               <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" /> Snapping to road...
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutoStopsSuggester({ routeId, startPoint, endPoint, startTime, currentStops, onAdd, onRemove, onAutoFill }: any) {
  const [suggestions, setSuggestions] = useState<{name: string, lat: number, lng: number, distanceKm?: number, arrivalTime?: string}[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!startPoint || !endPoint) return;
    const fetchStops = async () => {
      setLoading(true);
      try {
        // Use full addresses for more accurate routing if they look like coordinates or full strings
        const res = await fetch(`/api/stops?start=${encodeURIComponent(startPoint)}&end=${encodeURIComponent(endPoint)}${startTime ? `&startTime=${encodeURIComponent(startTime)}` : ''}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          if (currentStops.length === 1 && !currentStops[0].name && !currentStops[0].latitude && data.length > 0) {
             onAutoFill(data);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStops();
  }, [startPoint, endPoint, startTime]);

  if (loading) return <div className="text-xs text-orange-600 py-3 flex items-center gap-2 px-1"><Loader2 className="w-3.5 h-3.5 animate-spin"/> Interpolating geographical route constraints...</div>;
  if (suggestions.length === 0) return null;

  return (
    <div className="bg-amber-500/10 p-4 rounded-lg border border-amber-500/20 mb-4 shadow-sm">
      <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-3 uppercase tracking-wider flex items-center gap-2">
         <MapPin className="h-3 w-3" /> Auto-Suggested Sequence Log
      </div>
      <div className="max-h-[180px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-amber-500/20">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => {
            const exists = currentStops.find((cs: any) => cs.name === s.name || (cs.latitude === String(s.lat) && cs.longitude === String(s.lng)));
            return (
               <button type="button" key={i} onClick={() => {
                  if (exists) onRemove(exists.id);
                  else onAdd(s);
               }} className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-full border transition-all ${exists ? 'bg-orange-500 text-white border-orange-600 shadow-sm' : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:border-orange-500/40 hover:shadow-sm'}`}>
                 <div className="flex flex-col items-start gap-1 text-left leading-none">
                   <span className="flex items-center gap-1.5">
                      {exists ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />} 
                      {s.name} {i === 0 && <span className="opacity-70 text-[10px] ml-1 font-bold">(START)</span>}
                   </span>
                   {s.distanceKm !== undefined && (
                     <span className={`text-[9.5px] font-bold tracking-wide uppercase ${exists ? 'text-white/80' : 'text-amber-600/80'} pl-4`}>
                       {s.distanceKm} km {s.arrivalTime && `| ${s.arrivalTime}`}
                     </span>
                   )}
                 </div>
               </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function NestedBusWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [drivers, setDrivers] = useState<{id: string, name: string, workload?: number}[]>([]);
  




  const [busData, setBusData] = useState({
    name: "", number: "", capacity: "40", busType: "Non-AC",
    driverId: "none", manualDriverName: "", scheduledStartTime: "", endTime: "", status: "assigned",
  });
  
  useEffect(() => {
    if (open && step === 1) {
      let url = "/api/users?role=driver";
      if (busData.scheduledStartTime && busData.endTime) {
         url += `&start=${busData.scheduledStartTime}&end=${busData.endTime}`;
      }
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setDrivers(data);
        })
        .catch(console.error);
    }
  }, [open, step, busData.scheduledStartTime, busData.endTime]);
  
  const [routes, setRoutes] = useState([
    {
      id: nanoid(),
      name: "", number: "", 
      startPoint: "", fullStartPoint: "", startLat: "", startLng: "",
      endPoint: "", fullEndPoint: "", endLat: "", endLng: "",
      color: "#3B82F6",
      stops: [
        { id: nanoid(), name: "", code: "", latitude: "", longitude: "", addressSecondary: "" }
      ]
    }
  ]);

  const ROUTE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4"];

  function calculateTotalTravelTime() {
    if (!routes[0] || routes[0].stops.length < 2) return 0;
    const stops = routes[0].stops;
    let accumulatedMinutes = 0;
    
    for (let i = 0; i < stops.length - 1; i++) {
       const lat1 = parseFloat(stops[i].latitude);
       const lon1 = parseFloat(stops[i].longitude);
       const lat2 = parseFloat(stops[i+1].latitude);
       const lon2 = parseFloat(stops[i+1].longitude);
       if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
          const R = 6371; 
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
          const segmentDistance = R * c;
          
          // Match Live Physics Context Engine
          const averageSegmentSpeed = segmentDistance > 4 ? 55 : 35;
          const travelMinutes = (segmentDistance / averageSegmentSpeed) * 60;
          const dwellTime = 2.5; // Realistic passenger loading dwell 
          
          accumulatedMinutes += (travelMinutes + dwellTime);
       }
    }
    
    // Final end point dwelling buffer
    accumulatedMinutes += 2.5;
    
    return Math.round(accumulatedMinutes);
  }

  function calculateStopMetrics(stops: any[], startTime: string) {
    if (stops.length === 0) return [];
    
    let accumulatedMinutes = 0;
    let accumulatedDistance = 0;
    const results = [];
    
    const [startH, startM] = startTime ? startTime.split(':').map(Number) : [0, 0];
    const baseDate = new Date();
    baseDate.setHours(startH, startM, 0, 0);

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      
      if (stop.roadDistance !== undefined) {
         // Use precise road distance from Mapbox legs
         accumulatedDistance = stop.roadDistance;
         
         // Interpolate travel time based on road distance
         if (i > 0) {
            const prevDist = stops[i-1].roadDistance || 0;
            const segmentDist = accumulatedDistance - prevDist;
            const averageSegmentSpeed = segmentDist > 4 ? 55 : 35;
            const travelMinutes = (segmentDist / averageSegmentSpeed) * 60;
            const dwellTime = 2.5;
            accumulatedMinutes += (travelMinutes + dwellTime);
         }
      } else if (i > 0) {
        // Fallback to Haversine if roadDistance is missing
        const lat1 = parseFloat(stops[i-1].latitude);
        const lon1 = parseFloat(stops[i-1].longitude);
        const lat2 = parseFloat(stops[i].latitude);
        const lon2 = parseFloat(stops[i].longitude);
        
        if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
          const R = 6371; 
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
          const segmentDistance = R * c;
          
          accumulatedDistance += segmentDistance;
          
          const averageSegmentSpeed = segmentDistance > 4 ? 55 : 35;
          const travelMinutes = (segmentDistance / averageSegmentSpeed) * 60;
          const dwellTime = 2.5; 
          
          accumulatedMinutes += (travelMinutes + dwellTime);
        }
      }

      const arrivalDate = new Date(baseDate.getTime() + (accumulatedMinutes * 60000));
      results.push({
        distance: Math.round(accumulatedDistance * 10) / 10,
        arrivalTime: startTime ? formatTime(arrivalDate) : null
      });
    }
    
    return results;
  }

  useEffect(() => {
    async function updateTimeline() {
      if (busData.scheduledStartTime && routes[0]?.stops?.length >= 2) {
         setLoading(true);
         try {
            const stops = routes[0].stops;
            let totalMins = 0;
            let roadGeometry = "";
            let roadDistanceKm = 0;
            const validStops = stops.filter(s => !isNaN(parseFloat(s.latitude)) && !isNaN(parseFloat(s.longitude)));
            
            if (validStops.length >= 2 && validStops.length <= 25 && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
               const coordinates = validStops.map(s => `${s.longitude},${s.latitude}`).join(';');
               const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
               
               // We fetch full geometry and accurate distance
               const rawUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?access_token=${mapboxToken}&geometries=polyline6&overview=full&steps=false`;
               const url = `/api/mapbox-proxy?url=${encodeURIComponent(rawUrl)}`;
               const res = await fetch(url);
               const data = await res.json();
               
               if (data.code === 'Ok' && data.routes?.length > 0) {
                  const bestRoute = data.routes[0];
                  totalMins = Math.round(bestRoute.duration / 60);
                  roadGeometry = bestRoute.geometry;
                  roadDistanceKm = Math.round((bestRoute.distance / 1000) * 10) / 10;
                  
                  // Calculate cumulative road distances for each stop from legs
                  let cumulativeRoadDist = 0;
                  const updatedStops = [...routes[0].stops];
                  
                  // First stop is always 0
                  if (updatedStops.length > 0) {
                    (updatedStops[0] as any).roadDistance = 0;
                  }
                  
                  bestRoute.legs.forEach((leg: any, i: number) => {
                    cumulativeRoadDist += (leg.distance / 1000);
                    if (updatedStops[i + 1]) {
                      (updatedStops[i + 1] as any).roadDistance = Math.round(cumulativeRoadDist * 10) / 10;
                    }
                  });
                  
                  // Save road metadata and updated stops to route state
                  updateRouteMulti(routes[0].id, {
                    geometry: roadGeometry,
                    distance: roadDistanceKm,
                    stops: updatedStops
                  });

               } else {
                  throw new Error("Mapbox parsing failed");
               }
            } else {
               throw new Error("Insufficient coordinates");
            }
            
            // Add schedule dwell time constraints (2 mins per stop)
            const dwellMins = validStops.length * 2; 
            totalMins += dwellMins;

            const [h, m] = busData.scheduledStartTime.split(':').map(Number);
            const d = new Date();
            d.setHours(h);
            d.setMinutes(m + totalMins);
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const newEndTime = `${hours}:${minutes}`;
            
            if (busData.endTime !== newEndTime) {
               setBusData(p => ({ ...p, endTime: newEndTime }));
            }
         } catch(e) {
            console.log("Timeline update skipped or failed", e);
         } finally {
            setLoading(false);
         }
      }
    }
    
    updateTimeline();
  }, [step, busData.scheduledStartTime, routes[0]?.stops?.length]); // Only re-run if stops length changes or start time changes

  const setBusField = (field: string, value: string) => setBusData(prev => ({ ...prev, [field]: value }));

  const addRoute = () => {
    setRoutes(prev => [
      ...prev,
      { 
        id: nanoid(), name: "", number: "", 
        startPoint: "", fullStartPoint: "", startLat: "", startLng: "",
        endPoint: "", fullEndPoint: "", endLat: "", endLng: "",
        color: ROUTE_COLORS[prev.length % ROUTE_COLORS.length], 
        stops: [{ id: nanoid(), name: "", code: "", latitude: "", longitude: "", addressSecondary: "" }] 
      }
    ]);
  };

  const removeRoute = (routeId: string) => {
    if (routes.length <= 1) {
      toast.error("You must have at least 1 route setup.");
      return;
    }
    setRoutes(prev => prev.filter(r => r.id !== routeId));
  };

  const updateRoute = (routeId: string, field: string, value: string | boolean) => {
    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, [field]: value } : r));
  };

  const updateRouteMulti = (routeId: string, updates: any) => {
    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, ...updates } : r));
  };

  const addStopWithData = (routeId: string, data: any) => {
    setRoutes(prev => prev.map(r => {
      if (r.id === routeId) {
        return { 
          ...r, 
          stops: [
            ...r.stops, 
            { 
              id: nanoid(), 
              name: data.name, 
              code: "", 
              latitude: String(data.lat), 
              longitude: String(data.lng),
              address: data.fullName || "",
              addressSecondary: data.secondary || ""
            }
          ] 
        };
      }
      return r;
    }));
  };

  const autoFillStops = (routeId: string, suggestions: any[]) => {
    setRoutes(prev => prev.map(r => {
      if (r.id === routeId) {
        const toAdd = suggestions.map(s => ({
           id: nanoid(),
           name: s.name,
           code: "",
           latitude: String(s.lat),
           longitude: String(s.lng),
           address: s.fullName || "",
           addressSecondary: s.secondary || ""
        }));
        if (toAdd.length === 0) return r;
        return { ...r, stops: toAdd };
      }
      return r;
    }));
  };

  const addStop = (routeId: string) => {
    setRoutes(prev => prev.map(r => {
      if (r.id === routeId) {
        return { ...r, stops: [...r.stops, { id: nanoid(), name: "", code: "", latitude: "", longitude: "", addressSecondary: "" }] };
      }
      return r;
    }));
  };

  const removeStop = (routeId: string, stopId: string) => {
    setRoutes(prev => prev.map(r => {
      if (r.id === routeId) {
        if (r.stops.length <= 2) {
          toast.error("A route must have a minimum of 2 stops.");
          return r;
        }
        return { ...r, stops: r.stops.filter(s => s.id !== stopId) };
      }
      return r;
    }));
  };

  const updateStop = (routeId: string, stopId: string, field: string, value: string) => {
    setRoutes(prev => prev.map(r => {
      if (r.id === routeId) {
        return { ...r, stops: r.stops.map(s => s.id === stopId ? { ...s, [field]: value } : s) };
      }
      return r;
    }));
  };

  const goToNextStep = () => {
    if (step === 1) {
      if (!busData.number.trim()) return toast.error("Bus Number is required.");
      setStep(2);
    } else if (step === 2) {
      if (routes.length === 0) return toast.error("You must define at least one route.");
      for (const route of routes) {
        if (!route.number.trim()) return toast.error("All routes must have a route number assigned.");
        if (!route.startPoint.trim()) return toast.error(`Route ${route.number || 'Unnamed'} requires a Start Point.`);
        if (!route.endPoint.trim()) return toast.error(`Route ${route.number || 'Unnamed'} requires an End Point.`);
      }
      setStep(3);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    
    for (const route of routes) {
      if (route.stops.length < 2) return toast.error(`Route ${route.number || 'Unnamed'} requires at least 2 stops.`);
      for (const stop of route.stops) {
        if (!stop.name.trim()) return toast.error(`A stop on Route ${route.number} is missing a name.`);
        if (isNaN(Number(stop.latitude)) || isNaN(Number(stop.longitude))) {
           return toast.error(`Stop "${stop.name}" has invalid coordinates.`);
        }
      }
    }

    setLoading(true);
    try {
      const response = await fetch("/api/buses/nested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Append Start and End point into the Route Name temporarily as metadata
        body: JSON.stringify({ 
          busData: {
             ...busData,
             status: "assigned",
             scheduledStartTime: busData.scheduledStartTime ? (() => {
                const [h, m] = busData.scheduledStartTime.split(":").map(Number);
                const d = new Date();
                d.setHours(h, m, 0, 0);
                return d;
             })() : null,
             endTime: busData.endTime ? (() => {
                const [h, m] = busData.endTime.split(":").map(Number);
                const d = new Date();
                d.setHours(h, m, 0, 0);
                return d;
             })() : null,
          }, 
          routesData: routes.map(r => {
            const metrics = calculateStopMetrics(r.stops, busData.scheduledStartTime);
            return {
              ...r,
              // Format name logically incorporating the new points
              name: `${r.startPoint.split(',')[0]} - ${r.endPoint.split(',')[0]} ${r.name ? `(${r.name})` : ''}`.trim(),
              geometry: (r as any).geometry || null,
              distance: (r as any).distance || metrics[metrics.length - 1]?.distance || 0,
              stops: r.stops.map((s, si) => ({
                ...s,
                distanceFromPrev: metrics[si]?.distance || 0
              }))
            };
          }) 
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save entire system hierarchy");
      }

      toast.success(`Successfully initialized Bus ${busData.number} along with its nested routes and stops!`);
      
      setBusData({ name: "", number: "", capacity: "40", busType: "Non-AC", driverId: "none", manualDriverName: "", scheduledStartTime: "", endTime: "", status: "assigned" });
      setRoutes([{ 
        id: nanoid(), 
        name: "", number: "", 
        startPoint: "", fullStartPoint: "", startLat: "", startLng: "",
        endPoint: "", fullEndPoint: "", endLat: "", endLng: "",
        color: "#3B82F6", 
        stops: [{ id: nanoid(), name: "", code: "", latitude: "", longitude: "", addressSecondary: "" }] 
      }]);
      setStep(1);
      setOpen(false);
      router.refresh();

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setStep(1);
    }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold shadow-md">
          <Plus className="h-4 w-4" /> Integrated Fleet Setup
        </Button>
      </DialogTrigger>
      
      <DialogContent className={isFullScreen 
        ? "max-w-[100vw] w-screen h-screen max-h-[100vh] rounded-none border-0 bg-background p-0 flex flex-col overflow-hidden transition-all duration-300"
        : "max-w-4xl max-h-[90vh] bg-background border-border p-0 flex flex-col overflow-hidden transition-all duration-300"
      }>
        <button 
          type="button" 
          onClick={() => setIsFullScreen(!isFullScreen)} 
          className="absolute right-11 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 hover:text-foreground text-muted-foreground outline-none z-50 p-1"
        >
          {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="sr-only">Toggle Fullscreen</span>
        </button>
        
        <DialogHeader className="p-6 pb-4 border-b shrink-0 bg-muted/20 relative">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
                <Bus className="h-6 w-6 text-indigo-500" /> Integrated Fleet Setup
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Configure Bus, link Routes, and plot Stops simultaneously.</p>
            </div>
            <div className="flex items-center gap-2">
               <div className={`w-8 h-2 rounded-full ${step >= 1 ? 'bg-indigo-500' : 'bg-muted'}`} />
               <div className={`w-8 h-2 rounded-full ${step >= 2 ? 'bg-emerald-500' : 'bg-muted'}`} />
               <div className={`w-8 h-2 rounded-full ${step >= 3 ? 'bg-orange-500' : 'bg-muted'}`} />
            </div>
          </div>
        </DialogHeader>

        <div id="nested-wizard-form" className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* STEP 1: BUS DETAILS */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-2 text-xl font-bold border-b pb-2 text-foreground">
                    <span className="bg-indigo-500/10 text-indigo-500 p-2 rounded-md"><Bus className="h-5 w-5" /></span>
                    Step 1: Primary Bus Details
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bus Name</Label>
                      <Input placeholder="e.g. Morning Star" value={busData.name} onChange={(e) => setBusField("name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bus Number <span className="text-red-500">*</span></Label>
                      <Input className="border-indigo-500/30 focus-visible:ring-indigo-500" placeholder="e.g. KA-01-F-1234" value={busData.number} onChange={(e) => setBusField("number", e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bus Type</Label>
                      <Select value={busData.busType} onValueChange={(v) => setBusField("busType", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Non-AC">Non-AC</SelectItem>
                          <SelectItem value="AC">AC</SelectItem>
                          <SelectItem value="Sleeper">Sleeper</SelectItem>
                          <SelectItem value="Premium AC">Premium AC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity / Seats</Label>
                      <Input type="number" placeholder="40" value={busData.capacity} onChange={(e) => setBusField("capacity", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-xs uppercase tracking-wider text-muted-foreground">Assign Driver</Label>
                       <Select value={busData.driverId} onValueChange={(v) => {
                          setBusField("driverId", v);
                          if (v !== "manual") setBusField("manualDriverName", "");
                       }}>
                         <SelectTrigger><SelectValue placeholder="Select Driver" /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="none">No Driver Assigned</SelectItem>
                           {drivers.map(d => (
                             <SelectItem key={d.id} value={d.id}>
                               {d.name} {d.workload !== undefined ? `(${d.workload} active bus${d.workload === 1 ? '' : 'es'})` : ''}
                             </SelectItem>
                           ))}
                           <SelectItem value="manual">Other (Manual Entry)</SelectItem>
                         </SelectContent>
                       </Select>
                       {busData.driverId === "manual" && (
                         <div className="pt-2">
                           <Input placeholder="Enter driver name..." value={busData.manualDriverName} onChange={(e) => setBusField("manualDriverName", e.target.value)} />
                         </div>
                       )}
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 flex flex-col justify-end">
                           <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bus Start Time</Label>
                           <Input type="time" value={busData.scheduledStartTime} onChange={(e) => setBusField("scheduledStartTime", e.target.value)} />
                        </div>
                        <div className="space-y-1.5 flex flex-col justify-end">
                           <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estimated End Time</Label>
                           <div className="h-10 px-3 py-2 text-sm bg-muted/50 border border-border/50 rounded-md text-muted-foreground flex items-center">
                              {busData.endTime && routes[0]?.stops?.length >= 2 ? (
                                <span className="font-bold text-foreground">
                                  {(() => {
                                     const [h, m] = busData.endTime.split(':');
                                     const d = new Date(); d.setHours(Number(h), Number(m));
                                     return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
                                  })()}
                                </span>
                              ) : (
                                "Calculated after route selection"
                              )}
                           </div>
                        </div>
                     </div>
                  </div>
                </div>
              )}

              {/* STEP 2: ROUTES ENTRY */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2 text-xl font-bold text-foreground">
                      <span className="bg-emerald-500/10 text-emerald-500 p-2 rounded-md"><RouteIcon className="h-5 w-5" /></span>
                      Step 2: Connected Routes
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addRoute} className="gap-1 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10">
                      <Plus className="h-4 w-4" /> Add Alternative Route
                    </Button>
                  </div>

                  <div className="space-y-6">
                    {routes.map((route, rIndex) => (
                      <div key={route.id} className="border border-border/60 rounded-xl overflow-visible shadow-sm p-5 bg-background/50 relative">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b">
                          <div className="flex items-center gap-3">
                             <div className="w-5 h-5 rounded-full shadow-inner border" style={{ backgroundColor: route.color }} />
                             <span className="font-bold text-lg">Route {rIndex + 1}</span>
                          </div>
                          {routes.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeRoute(route.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <X className="h-5 w-5" />
                            </Button>
                          )}
                        </div>

                          <div className="grid gap-6">
                          {/* Top Row: Points */}
                          <div className="grid md:grid-cols-2 gap-6 relative z-10">
                             <LocationAutocomplete 
                               label="Start Point" 
                               placeholder="e.g. Village or City" 
                               value={route.startPoint} 
                               onChange={(val) => updateRoute(route.id, "startPoint", val)} 
                               onSelect={(item) => updateRouteMulti(route.id, {
                                 startPoint: item.name,
                                 fullStartPoint: item.fullName,
                                 startLat: String(item.lat),
                                 startLng: String(item.lng)
                               })}
                             />
                             <LocationAutocomplete 
                               label="End Point" 
                               placeholder="e.g. Destination City" 
                               value={route.endPoint} 
                               onChange={(val) => updateRoute(route.id, "endPoint", val)} 
                               onSelect={(item) => updateRouteMulti(route.id, {
                                 endPoint: item.name,
                                 fullEndPoint: item.fullName,
                                 endLat: String(item.lat),
                                 endLng: String(item.lng)
                               })}
                             />
                          </div>

                          {/* Dynamic visual map embed */}
                          {(route.startPoint || route.endPoint) && (
                            <div className="w-full h-40 rounded-lg overflow-hidden border border-border/60 shadow-sm mt-1 bg-muted/20">
                              <iframe 
                                width="100%" 
                                height="100%" 
                                style={{ border: 0 }} 
                                loading="lazy" 
                               src={`https://maps.google.com/maps?q=${encodeURIComponent(route.fullEndPoint || route.endPoint || route.fullStartPoint || route.startPoint)}&t=m&z=11&output=embed`}
                              />
                            </div>
                          )}

                          {/* Bottom Row: Details */}
                          <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Route Number <span className="text-red-500">*</span></Label>
                              <Input className="border-emerald-500/30 focus-visible:ring-emerald-500" placeholder="e.g. 0001" value={route.number} onChange={(e) => updateRoute(route.id, "number", e.target.value)} required />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Route Name (Friendly)</Label>
                              <Input placeholder="e.g. City Circular" value={route.name} onChange={(e) => updateRoute(route.id, "name", e.target.value)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 3: STOPS ENTRY */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2 text-xl font-bold text-foreground">
                      <span className="bg-amber-500/10 text-amber-500 p-2 rounded-md"><MapPin className="h-5 w-5" /></span>
                      Step 3: Route Stops Sequence
                    </div>
                  </div>

                  <div className="space-y-6">
                    {routes.map((route, rIndex) => (
                      <div key={route.id} className="border border-border/80 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-muted/30 p-3 flex items-center justify-between border-b">
                          <div className="flex items-center gap-3">
                             <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: route.color }} />
                             <span className="font-bold text-sm">
                               Route {route.number || (rIndex + 1)} Stops 
                               <span className="text-muted-foreground font-normal ml-2">({route.startPoint || 'Unknown'} → {route.endPoint || 'Unknown'})</span>
                             </span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => addStop(route.id)} className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-transparent hover:border-amber-200">
                            <Plus className="h-3 w-3" /> Insert Manual Stop
                          </Button>
                        </div>
                        
                        <div className="p-4 bg-background space-y-3 max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-border">
                          <AutoStopsSuggester 
                             routeId={route.id}
                             startPoint={route.fullStartPoint || route.startPoint}
                             endPoint={route.fullEndPoint || route.endPoint}
                             startTime={busData.scheduledStartTime}
                             currentStops={route.stops}
                             onAdd={(suggestion: any) => addStopWithData(route.id, suggestion)}
                             onRemove={(stopId: string) => removeStop(route.id, stopId)}
                             onAutoFill={(suggestions: any[]) => autoFillStops(route.id, suggestions)}
                          />

                          {calculateStopMetrics(route.stops, busData.scheduledStartTime).map((metric, sIndex) => {
                            const stop = route.stops[sIndex];
                            return (
                              <div key={stop.id} className="space-y-1">
                                <div 
                                  className="flex flex-wrap md:flex-nowrap items-start gap-2 bg-muted/20 p-2.5 rounded-md border border-border/50 relative group transition-all hover:bg-muted/30"
                                  style={{ contentVisibility: 'auto', containIntrinsicSize: '0 100px' } as any}
                                >
                                 <div className="absolute -left-2 -top-2 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold shadow-md border border-white/20 z-10">
                                   {sIndex + 1}
                                 </div>
                                 <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 pl-3">
                                   <div className="space-y-1 col-span-2 md:col-span-1">
                                     <div className="flex items-center justify-between">
                                       <Label className="text-[10px] uppercase text-muted-foreground font-bold">Stop Name *</Label>
                                       <div className="text-[10px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded flex items-center gap-1.5 shadow-sm border border-indigo-500/20">
                                         {metric.distance} KM • {metric.arrivalTime || '--:--'}
                                       </div>
                                     </div>
                                     <div className="relative group/stop">
                                        <Input className="h-8 text-xs focus-visible:ring-emerald-500 bg-background" placeholder="Stop Name" value={stop.name} onChange={(e) => updateStop(route.id, stop.id, "name", e.target.value)} required />
                                        {stop.addressSecondary && (
                                          <div className="absolute left-0 -bottom-8 bg-popover text-popover-foreground text-[9px] px-2 py-1 rounded shadow-lg border border-border opacity-0 group-hover/stop:opacity-100 transition-opacity pointer-events-none z-[100] whitespace-nowrap">
                                            {stop.addressSecondary}
                                          </div>
                                        )}
                                     </div>
                                   </div>
                                   <div className="space-y-1">
                                     <Label className="text-[10px] uppercase text-muted-foreground font-bold">Code</Label>
                                     <Input className="h-8 text-xs font-mono bg-background" placeholder="Code" value={stop.code} onChange={(e) => updateStop(route.id, stop.id, "code", e.target.value)} />
                                   </div>
                                   <div className="space-y-1">
                                     <Label className="text-[10px] uppercase text-muted-foreground font-bold">Latitude *</Label>
                                     <Input type="number" step="any" className="h-8 text-xs font-mono focus-visible:ring-emerald-500 bg-background" placeholder="Lat" value={stop.latitude} onChange={(e) => updateStop(route.id, stop.id, "latitude", e.target.value)} required />
                                   </div>
                                   <div className="space-y-1">
                                     <Label className="text-[10px] uppercase text-muted-foreground font-bold">Longitude *</Label>
                                     <Input type="number" step="any" className="h-8 text-xs font-mono focus-visible:ring-emerald-500 bg-background" placeholder="Lng" value={stop.longitude} onChange={(e) => updateStop(route.id, stop.id, "longitude", e.target.value)} required />
                                   </div>
                                 </div>
                                 
                                 <div className="md:self-end self-center ml-2">
                                   <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => removeStop(route.id, stop.id)}>
                                     <X className="h-4 w-4" />
                                   </Button>
                                 </div>
                                </div>
                              
                              {/* Stop Visual Verify Map - Smaller and more discreet */}
                              {stop.latitude && stop.longitude && !isNaN(Number(stop.latitude)) && !isNaN(Number(stop.longitude)) && (
                                <div className="w-full h-24 mt-0.5 rounded-lg overflow-hidden border border-border/50 opacity-60 hover:opacity-100 transition-opacity bg-muted/20">
                                  <iframe 
                                    width="100%" 
                                    height="100%" 
                                    style={{ border: 0 }} 
                                    loading="lazy"
                                    src={`https://maps.google.com/maps?q=${stop.latitude},${stop.longitude}&t=m&z=15&output=embed`}
                                  />
                                </div>
                              )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 3: REVIEW AND CONFIRM */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-2 text-xl font-bold text-foreground border-b pb-2">
                     <span className="bg-indigo-500/10 text-indigo-500 p-2 rounded-md"><Check className="h-5 w-5" /></span>
                     Step 3: Review Transit Details
                  </div>
                  <div className="bg-muted/20 p-6 rounded-xl border border-border shadow-sm space-y-4">
                     <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex flex-col">
                           <span className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bus Configuration</span>
                           <span className="font-bold text-lg">{busData.number} - {busData.name} ({busData.busType})</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Driver Assignment</span>
                           <span className="font-bold text-lg">{busData.driverId === 'manual' ? busData.manualDriverName : (drivers.find(d => d.id === busData.driverId)?.name || 'None')}</span>
                        </div>
                     </div>
                     <div className="pt-4 border-t border-border/50 grid grid-cols-3 gap-4 text-sm">
                        <div className="flex flex-col">
                           <span className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Transit Time</span>
                           <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">{formatMinutes(calculateTotalTravelTime())}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Start Bound</span>
                           <span className="font-bold text-base">
                              {formatTime(busData.scheduledStartTime)}
                           </span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Estimated End</span>
                           <span className="font-bold text-base">
                             {busData?.endTime ? (() => {
                                 const [h,m] = busData.endTime.split(":");
                                 const d = new Date(); d.setHours(Number(h), Number(m));
                                 return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
                              })() : "Not Set"}
                           </span>
                        </div>
                     </div>
                  </div>
                </div>
              )}

          </div>
          
          <div className="shrink-0 p-4 border-t bg-muted/20 flex items-center justify-between z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            
            <div className="flex items-center gap-3">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
              )}
              
              {step < 3 ? (
                <Button type="button" onClick={goToNextStep} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]">
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={loading} className="px-8 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 font-bold min-w-[200px]">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm & Initialize Database
                </Button>
              )}
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
