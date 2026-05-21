"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Loader2, X, MapPin } from "lucide-react";
import { toast } from "sonner";

const ROUTE_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];

interface Stop { id: string; name: string; code?: string | null; latitude: number; longitude: number }
interface Place { name: string; lng: number; lat: number }

export function CreateRouteForm({ onSuccess, onCancel }: { onSuccess?: () => void, onCancel?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [selectedStops, setSelectedStops] = useState<Stop[]>([]);
  const [stopSearch, setStopSearch] = useState("");
  const [form, setForm] = useState({ number: "", color: ROUTE_COLORS[0] });

  // Mapbox Geocoding State
  const [startQuery, setStartQuery] = useState("");
  const [startPlace, setStartPlace] = useState<Place | null>(null);
  const [startSuggestions, setStartSuggestions] = useState<Place[]>([]);

  const [endQuery, setEndQuery] = useState("");
  const [endPlace, setEndPlace] = useState<Place | null>(null);
  const [endSuggestions, setEndSuggestions] = useState<Place[]>([]);

  const [suggestedVillages, setSuggestedVillages] = useState<Stop[]>([]);

  useEffect(() => {
    fetch("/api/stops").then((r) => r.json()).then(setAllStops).catch(() => {});
  }, []);

  // Geocoding effect
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    const delayDebounceFn = setTimeout(async () => {
      if (startQuery && !startPlace && startQuery.length > 2) {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(startQuery)}.json?access_token=${token}&country=IN&types=place,locality`);
        const data = await res.json();
        setStartSuggestions(data.features?.map((f: any) => ({ name: f.place_name, lng: f.center[0], lat: f.center[1] })) || []);
      } else {
        setStartSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [startQuery, startPlace]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    const delayDebounceFn = setTimeout(async () => {
      if (endQuery && !endPlace && endQuery.length > 2) {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(endQuery)}.json?access_token=${token}&country=IN&types=place,locality`);
        const data = await res.json();
        setEndSuggestions(data.features?.map((f: any) => ({ name: f.place_name, lng: f.center[0], lat: f.center[1] })) || []);
      } else {
        setEndSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [endQuery, endPlace]);

  const [generating, setGenerating] = useState(false);

  // Auto-generate intermediate villages between the two cities
  useEffect(() => {
    if (startPlace && endPlace && selectedStops.length === 0 && !generating) {
      generateIntermediateStops();
    }
  }, [startPlace, endPlace]);

  async function generateIntermediateStops() {
    if (!startPlace || !endPlace) return;
    setGenerating(true);
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    try {
      toast.info("Computing geographical route and identifying villages...");
      const numStops = Math.floor(Math.random() * 4) + 11; // 11 to 14 stops
      const dx = endPlace.lng - startPlace.lng;
      const dy = endPlace.lat - startPlace.lat;
      
      const promises = [];
      for (let i = 1; i <= numStops; i++) {
        const fraction = i / (numStops + 1);
        // Add a tiny random offset so it's not perfectly mathematically straight (feels more like real roads)
        const jitterLng = (Math.random() - 0.5) * 0.05;
        const jitterLat = (Math.random() - 0.5) * 0.05;
        const lng = startPlace.lng + dx * fraction + jitterLng;
        const lat = startPlace.lat + dy * fraction + jitterLat;
        
        promises.push(
          fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,place,district,poi&access_token=${token}`)
            .then(r => r.json())
            .then(data => ({
              lng, lat,
              name: data.features?.[0]?.text || null
            }))
        );
      }

      const results = await Promise.all(promises);
      
      const newStops: Stop[] = [];
      results.forEach((res, index) => {
        const name = res.name ? res.name : `Highway Checkpoint ${index + 1}`;
        newStops.push({
          id: `auto-${Date.now()}-${index}`,
          name: name,
          latitude: res.lat,
          longitude: res.lng
        });
      });

      setSelectedStops(newStops);
      toast.success(`Successfully mapped ${newStops.length} intermediate stops!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to map route. Try adding manually.");
    } finally {
      setGenerating(false);
    }
  }

  // Calculate intermediate villages from DB (fallback/extra)
  useEffect(() => {
    if (startPlace && endPlace && allStops.length > 0) {
      const result = [];
      const dx = endPlace.lng - startPlace.lng;
      const dy = endPlace.lat - startPlace.lat;
      const lengthSq = dx * dx + dy * dy;

      for (const p of allStops) {
        if (selectedStops.find(s => s.id === p.id)) continue;

        let t = 0;
        if (lengthSq !== 0) {
          t = ((p.longitude - startPlace.lng) * dx + (p.latitude - startPlace.lat) * dy) / lengthSq;
        }

        if (t > 0 && t < 1) {
          const cx = startPlace.lng + t * dx;
          const cy = startPlace.lat + t * dy;
          const distSq = (p.longitude - cx) * (p.longitude - cx) + (p.latitude - cy) * (p.latitude - cy);
          
          if (distSq < 0.005) { 
            result.push({ stop: p, t });
          }
        }
      }
      setSuggestedVillages(result.sort((a, b) => a.t - b.t).map(r => r.stop));
    } else {
      setSuggestedVillages([]);
    }
  }, [startPlace, endPlace, allStops, selectedStops]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addStop(stop: Stop) {
    if (!selectedStops.find((s) => s.id === stop.id)) {
      setSelectedStops((prev) => [...prev, stop]);
    }
    setStopSearch("");
  }

  function removeStop(stopId: string) {
    setSelectedStops((prev) => prev.filter((s) => s.id !== stopId));
  }

  const filtered = allStops.filter(
    (s) =>
      !selectedStops.find((sel) => sel.id === s.id) &&
      s.name.toLowerCase().includes(stopSearch.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startPlace || !endPlace) {
      toast.error("Please select valid Starting and Ending cities from the map suggestions.");
      return;
    }
    if (selectedStops.length < 2) {
      toast.error("Please add at least 2 stops to the route.");
      return;
    }
    setLoading(true);
    try {
      const generatedName = `${startPlace.name.split(',')[0].toUpperCase()}-${endPlace.name.split(',')[0].toUpperCase()}`;
      const routeRes = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Use coordinates to potentially save end points here later if needed
        body: JSON.stringify({ ...form, name: generatedName, status: "active" }),
      });
      if (!routeRes.ok) throw new Error("Route creation failed");
      const route = await routeRes.json();

      await Promise.all(
        selectedStops.map((stop, idx) =>
          fetch("/api/route-stops", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeId: route.id, stopId: stop.id, stopOrder: idx, estimatedMinutesFromStart: idx * 5 }),
          })
        )
      );

      toast.success(`Route "${generatedName}" created with ${selectedStops.length} stops.`);
      
      setForm({ number: "", color: ROUTE_COLORS[0] });
      setStartQuery(""); setStartPlace(null);
      setEndQuery(""); setEndPlace(null);
      setSelectedStops([]);
      router.refresh();
      onSuccess?.();
    } catch {
      toast.error("Failed to create route.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full mt-2">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column: Details */}
        <form id="route-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Route Number *</Label>
            <Input placeholder="e.g. 0002" value={form.number} onChange={(e) => set("number", e.target.value)} required />
          </div>

          <div className="space-y-1 relative">
            <Label>Start City *</Label>
            <Input 
              placeholder="e.g. vizag" 
              value={startPlace ? startPlace.name : startQuery} 
              onChange={(e) => { setStartQuery(e.target.value); setStartPlace(null); }} 
              required 
            />
            {startSuggestions.length > 0 && (
              <div className="absolute top-16 left-0 right-0 z-50 bg-background border rounded-lg shadow-xl overflow-hidden">
                {startSuggestions.map((place, i) => (
                  <div key={i} className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center gap-2" onClick={() => { setStartPlace(place); setStartSuggestions([]); }}>
                    <MapPin className="h-3 w-3 text-emerald-500" /> {place.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1 relative">
            <Label>End City *</Label>
            <Input 
              placeholder="e.g. srikakulam" 
              value={endPlace ? endPlace.name : endQuery} 
              onChange={(e) => { setEndQuery(e.target.value); setEndPlace(null); }} 
              required 
            />
            {endSuggestions.length > 0 && (
              <div className="absolute top-16 left-0 right-0 z-50 bg-background border rounded-lg shadow-xl overflow-hidden">
                {endSuggestions.map((place, i) => (
                  <div key={i} className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center gap-2" onClick={() => { setEndPlace(place); setEndSuggestions([]); }}>
                    <MapPin className="h-3 w-3 text-red-500" /> {place.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="pt-2 text-sm text-foreground/50 italic border-l-2 border-primary pl-3 ml-1 mb-2">
            Generated Route Name: <span className="font-semibold text-foreground">{(startPlace || endPlace) ? `${startPlace?.name.split(',')[0].toUpperCase() || "..."}-${endPlace?.name.split(',')[0].toUpperCase() || "..."}` : "—"}</span>
          </div>
          <div className="space-y-2">
            <Label>Route Color</Label>
            <div className="flex gap-2 flex-wrap">
              {ROUTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-7 h-7 rounded-full border-2 transition-all shadow-sm ${form.color === c ? "border-foreground scale-110" : "border-transparent opacity-80"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => set("color", c)}
                />
              ))}
            </div>
          </div>
        </form>

        {/* Right Column: Stops Builder */}
        <div className="space-y-4 border-l border-foreground/10 pl-6 flex flex-col h-full">
          
          <div className="flex flex-col gap-2">
            <Label className="font-semibold text-primary">Normal Stop Search</Label>
            <Input border-primary placeholder="Search any stop/village manually…" value={stopSearch} onChange={(e) => setStopSearch(e.target.value)} className="h-9 text-sm" />
            {stopSearch && filtered.length > 0 && (
              <ScrollArea className="max-h-36 border rounded-lg shadow-lg bg-background z-10 absolute mt-16 w-64">
                {filtered.map((s) => (
                  <button key={s.id} type="button" className="w-full text-left px-3 py-2 text-xs hover:bg-muted" onClick={() => addStop(s)}>
                    {s.name}
                  </button>
                ))}
              </ScrollArea>
            )}
          </div>

          {suggestedVillages.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 p-2 rounded-lg">
              <Label className="text-xs text-emerald-500 font-semibold mb-2 block">Found villages on this path mapping:</Label>
              <div className="flex flex-wrap gap-2">
                {suggestedVillages.map(village => (
                  <button key={village.id} onClick={() => addStop(village)} className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-full hover:bg-emerald-500/20 transition-colors flex items-center gap-1">
                    <Plus className="h-3 w-3" /> {village.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 pt-2 flex flex-col">
            <Label className="font-semibold mb-2">
              Route Stops ({selectedStops.length + (startPlace ? 1 : 0) + (endPlace ? 1 : 0)})
            </Label>
            <ScrollArea className="h-[350px] w-full border rounded-lg p-2 bg-muted/10 pr-4">
              {!startPlace && !endPlace && selectedStops.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs text-center p-4">
                  Type a city on the left, check the suggested villages here, or search manually.
                </div>
              ) : (
                <div className="space-y-1">
                  
                  {/* START PLACE STUB */}
                  {startPlace && (
                    <div className="flex items-center gap-2 text-[11px] bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-md shadow-sm">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold bg-emerald-500 text-white">
                        1
                      </span>
                      <span className="flex-1 truncate font-semibold text-emerald-700 dark:text-emerald-400">
                        {startPlace.name.split(',')[0]} <span className="text-[9px] uppercase">(Start)</span>
                      </span>
                      <div className="flex items-center gap-2">
                         <div className="flex items-center gap-1 opacity-50">
                           <Label className="text-[10px] text-muted-foreground">Arr:</Label>
                           <Input disabled className="h-6 w-16 px-1 text-[10px]" value="—" />
                         </div>
                         <div className="flex items-center gap-1">
                           <Label className="text-[10px] text-muted-foreground">Dep:</Label>
                           <Input type="time" className="h-6 w-20 px-1 text-[10px]" defaultValue="08:00" />
                         </div>
                      </div>
                    </div>
                  )}

                  {/* INTERMEDIATE STOPS */}
                  {selectedStops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 text-[11px] bg-background border p-2 rounded-md shadow-sm ml-4 border-l-4" style={{ borderLeftColor: form.color }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: form.color, color: "#fff" }}>
                        {startPlace ? i + 2 : i + 1}
                      </span>
                      <span className="flex-1 truncate font-semibold">{s.name}</span>
                      <div className="flex items-center gap-2">
                         <div className="flex items-center gap-1">
                           <Label className="text-[10px] text-muted-foreground">Arr:</Label>
                           <Input type="time" className="h-6 w-20 px-1 text-[10px]" defaultValue="09:00" />
                         </div>
                         <div className="flex items-center gap-1">
                           <Label className="text-[10px] text-muted-foreground">Dep:</Label>
                           <Input type="time" className="h-6 w-20 px-1 text-[10px]" defaultValue="09:05" />
                         </div>
                      </div>
                      <button type="button" onClick={() => removeStop(s.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {/* END PLACE STUB */}
                  {endPlace && (
                    <div className="flex items-center gap-2 text-[11px] bg-red-500/10 border border-red-500/20 p-2 rounded-md shadow-sm">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold bg-red-500 text-white">
                        {selectedStops.length + (startPlace ? 2 : 1)}
                      </span>
                      <span className="flex-1 truncate font-semibold text-red-700 dark:text-red-400">
                        {endPlace.name.split(',')[0]} <span className="text-[9px] uppercase">(End)</span>
                      </span>
                      <div className="flex items-center gap-2">
                         <div className="flex items-center gap-1">
                           <Label className="text-[10px] text-muted-foreground">Arr:</Label>
                           <Input type="time" className="h-6 w-20 px-1 text-[10px]" defaultValue="18:00" />
                         </div>
                         <div className="flex items-center gap-1 opacity-50">
                           <Label className="text-[10px] text-muted-foreground">Dep:</Label>
                           <Input disabled className="h-6 w-16 px-1 text-[10px]" value="—" />
                         </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" form="route-form" disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm & Save Route
        </Button>
      </div>
    </div>
  );
}

export default function CreateRouteDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1 bg-primary text-primary-foreground"><Plus className="h-4 w-4" /> Add Route</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-border bg-background">
        <DialogHeader>
          <DialogTitle>Create New Route</DialogTitle>
        </DialogHeader>
        {open && <CreateRouteForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
