"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Loader2, Save, Trash2, Plus, ArrowUp, ArrowDown, Search, X, Wand2, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Stop     { id: string; name: string; }
interface RouteStop { id: string; stopOrder: number; stop: Stop; }

interface Route {
  id: string;
  name: string;
  number: string;
  color: string;
  status: string;
  description: string | null;
  routeStops: RouteStop[];
}

interface Props {
  route: Route;
  allStops: Stop[];   // every global stop from DB
}

const STATUS_OPTIONS = ["active", "inactive", "suspended"] as const;
const COLORS = [
  "#6366F1", "#A855F7", "#06B6D4", "#22C55E",
  "#F59E0B", "#EF4444", "#EC4899", "#3B82F6",
];



export default function EditRouteDialog({ route, allStops }: Props) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab]           = useState<"info" | "stops">("info");

  // ── Info fields ───────────────────────────────────────
  const [name, setName]        = useState(route.name ?? "");
  const [number, setNumber]    = useState(route.number ?? "");
  const [color, setColor]      = useState(route.color);
  const [status, setStatus]    = useState(route.status);
  const [description, setDesc] = useState(route.description ?? "");

  // ── Stop assignment ───────────────────────────────────
  const initialOrdered = [...route.routeStops]
    .sort((a, b) => a.stopOrder - b.stopOrder)
    .map((rs) => rs.stop);
  const [orderedStops, setOrderedStops] = useState<Stop[]>(initialOrdered);
  const [stopSearch, setStopSearch]     = useState("");

  // ── Auto-generate stops from city pair ───────────────
  const [autoStart, setAutoStart]   = useState("");
  const [autoEnd, setAutoEnd]       = useState("");
  const [startSuggestions, setStartSuggestions] = useState<any[]>([]);
  const [endSuggestions, setEndSuggestions]     = useState<any[]>([]);
  const [autoGenning, setAutoGenning] = useState(false);

  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  /** Fetch suggestions from Mapbox as user types */
  async function fetchSuggestions(query: string, type: "start" | "end") {
    if (query.length < 3) {
      if (type === "start") setStartSuggestions([]);
      else setEndSuggestions([]);
      return;
    }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=IN&types=place,locality&limit=5&access_token=${MAPBOX_TOKEN}`;
      const r = await fetch(url);
      const d = await r.json();
      if (type === "start") setStartSuggestions(d.features || []);
      else setEndSuggestions(d.features || []);
    } catch {
      // ignore
    }
  }

  /** Geocode a city name → [lng, lat] */
  async function geocodeCity(city: string): Promise<[number, number] | null> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?country=IN&types=place,locality&limit=1&access_token=${MAPBOX_TOKEN}`;
    const r = await fetch(url);
    const d = await r.json();
    const f = d.features?.[0];
    return f ? (f.center as [number, number]) : null;
  }

  /** Sample N evenly spaced points along a GeoJSON LineString coordinates array */
  function samplePoints(coords: [number, number][], n: number): [number, number][] {
    if (coords.length === 0) return [];
    if (n >= coords.length) return coords;
    const result: [number, number][] = [];
    const step = (coords.length - 1) / (n - 1);
    for (let i = 0; i < n; i++) {
      result.push(coords[Math.round(i * step)]);
    }
    return result;
  }

  /** Reverse geocode [lng, lat] → place name string */
  async function reverseGeocode(lng: number, lat: number): Promise<string> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,neighborhood&limit=1&access_token=${MAPBOX_TOKEN}`;
    const r = await fetch(url);
    const d = await r.json();
    return d.features?.[0]?.text ?? `Stop (${lat.toFixed(3)},${lng.toFixed(3)})`;
  }

  async function handleAutoGenerate() {
    if (!autoStart.trim() || !autoEnd.trim()) {
      toast.error("Enter both start and end city.");
      return;
    }
    setAutoGenning(true);
    try {
      const [startCoord, endCoord] = await Promise.all([
        geocodeCity(autoStart),
        geocodeCity(autoEnd),
      ]);
      if (!startCoord || !endCoord) {
        toast.error("Could not find one or both cities. Try more specific names.");
        return;
      }

      // Get driving route
      const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      const dirRes = await fetch(dirUrl);
      const dirData = await dirRes.json();
      const allCoords: [number, number][] = dirData.routes?.[0]?.geometry?.coordinates ?? [];

      if (allCoords.length === 0) {
        toast.error("No route found between those cities.");
        return;
      }

      // Sample ~8 intermediate points (incl. start + end = 10 total)
      const NUM_POINTS = Math.min(10, allCoords.length);
      const sampled = samplePoints(allCoords, NUM_POINTS);

      // Reverse geocode all points in parallel
      toast.loading("Detecting stops along route...", { id: "autogen" });
      const names = await Promise.all(sampled.map(([lng, lat]) => reverseGeocode(lng, lat)));

      // Deduplicate consecutive same names
      const unique: { name: string; lat: number; lng: number }[] = [];
      for (let i = 0; i < names.length; i++) {
        if (unique.length === 0 || names[i] !== unique[unique.length - 1].name) {
          unique.push({ name: names[i], lat: sampled[i][1], lng: sampled[i][0] });
        }
      }

      // Create each stop in DB if not already in allStops, then assign
      toast.loading(`Creating ${unique.length} stops...`, { id: "autogen" });
      const createdStops: Stop[] = [];
      for (const pt of unique) {
        // Check if stop already exists in pool
        const existing = allStops.find(
          (s) => s.name.toLowerCase() === pt.name.toLowerCase()
        );
        if (existing) {
          createdStops.push(existing);
        } else {
          const res = await fetch("/api/stops", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: pt.name,
              latitude: pt.lat,
              longitude: pt.lng,
            }),
          });
          if (res.ok) {
            const s = await res.json();
            createdStops.push({ id: s.id, name: s.name });
          }
        }
      }

      setOrderedStops(createdStops);
      toast.success(`✅ ${createdStops.length} stops auto-generated!`, { id: "autogen" });
    } catch (e) {
      console.error(e);
      toast.error("Failed to auto-generate stops.", { id: "autogen" });
    } finally {
      setAutoGenning(false);
    }
  }


  const assignedIds = new Set(orderedStops.map((s) => s.id));
  const filteredPool = allStops.filter(
    (s) =>
      !assignedIds.has(s.id) &&
      s.name.toLowerCase().includes(stopSearch.toLowerCase())
  );

  function addStop(stop: Stop) {
    setOrderedStops((prev) => [...prev, stop]);
    setStopSearch("");
  }
  function removeStop(id: string) {
    setOrderedStops((prev) => prev.filter((s) => s.id !== id));
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    setOrderedStops((prev) => {
      const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n;
    });
  }
  function moveDown(idx: number) {
    setOrderedStops((prev) => {
      if (idx === prev.length - 1) return prev;
      const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n;
    });
  }

  // ── Save ─────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim() || !number.trim()) { toast.error("Name and Number required."); return; }
    setSaving(true);
    try {
      // 1. Update route info
      const r = await fetch(`/api/routes/${route.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, number, color, status, description: description || null }),
      });
      if (!r.ok) throw new Error("route");

      // 2. Delete existing route-stops
      await fetch(`/api/route-stops?routeId=${route.id}`, { method: "DELETE" });

      // 3. Re-insert in new order
      for (let i = 0; i < orderedStops.length; i++) {
        await fetch("/api/route-stops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: route.id,
            stopId: orderedStops[i].id,
            stopOrder: i + 1,
            distanceFromPrev: 0,
            estimatedMinutesFromStart: i * 9,
          }),
        });
      }

      toast.success(`Route "${name}" saved with ${orderedStops.length} stops.`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to save route.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete route "${route.name}"? All linked stops will be removed.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/routes/${route.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Route "${route.name}" deleted.`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to delete route.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Tab pill ──────────────────────────────────────────
  function TabPill({ id, label, count }: { id: "info" | "stops"; label: string; count?: number }) {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-muted text-muted-foreground border-border hover:bg-muted/80"}`}
      >
        {label}
        {count !== undefined && (
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setTab("info"); setStopSearch(""); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" style={{ cursor: "pointer" }} title={`Edit Route ${route.number}`}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground">
            Edit Route{" "}
            <span className="ml-1 px-2 py-0.5 rounded text-sm font-bold bg-muted border border-border" style={{ color: route.color }}>
              {route.number}
            </span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{route.name}</p>
        </DialogHeader>

        {/* Tab pills */}
        <div className="flex gap-2 mt-1 shrink-0">
          <TabPill id="info"  label="Route Info" />
          <TabPill id="stops" label="Stop Points" count={orderedStops.length} />
        </div>

        {/* ── INFO TAB ── */}
        {tab === "info" && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mt-1">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Route Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} 
                className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
                placeholder="e.g. ISBT ↔ Urban Estate" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Route Number</label>
              <input value={number} onChange={(e) => setNumber(e.target.value)}
                className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
                placeholder="e.g. JL-1" />
            </div>

            {/* Color */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Route Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
                      border: color === c ? "3px solid #F9FAFB" : "2px solid transparent",
                      boxShadow: color === c ? `0 0 10px ${c}88` : "none",
                      transform: color === c ? "scale(1.15)" : "scale(1)", transition: "all 0.15s" }} />
                ))}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                  style={{ width: 28, height: 28, borderRadius: "50%", background: "transparent",
                    border: "1px solid #374151", padding: "1px", cursor: "pointer" }} title="Custom" />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Status</label>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((s) => {
                  const c = { active: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
                    inactive: { bg: "bg-muted", border: "border-border", text: "text-muted-foreground" },
                    suspended: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-600 dark:text-rose-400" } }[s];
                  const sel = status === s;
                  return (
                    <button key={s} onClick={() => setStatus(s)} className={`py-2 rounded-lg text-xs font-bold capitalize border transition-all ${sel ? `${c!.bg} ${c!.border} ${c!.text}` : "bg-muted/50 border-border text-muted-foreground"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Description (optional)</label>
              <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2}
                placeholder="Short notes about this route..."
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors resize-none" />
            </div>
          </div>
        )}

        {/* ── STOPS TAB ── */}
        {tab === "stops" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-1">
            {/* ── AUTO-GENERATE from city pair ── */}
            <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#6366F1" }}>
                <Wand2 className="h-3.5 w-3.5" /> Auto-Generate Stops from Route
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-emerald-500" />
                  <input
                    value={autoStart}
                    onChange={(e) => {
                      setAutoStart(e.target.value);
                      fetchSuggestions(e.target.value, "start");
                    }}
                    placeholder="Start City"
                    className="w-full h-10 bg-muted border border-border rounded-lg pl-8 pr-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
                  />
                  {startSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden border border-border bg-popover">
                      {startSuggestions.map((f) => (
                        <button
                          key={f.id}
                          className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted transition-colors border-b border-border last:border-0"
                          style={{ color: "var(--muted-foreground)", cursor: "pointer" }}
                          onClick={() => {
                            setAutoStart(f.text);
                            setStartSuggestions([]);
                          }}
                        >
                          {f.place_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-purple-500" />
                  <input
                    value={autoEnd}
                    onChange={(e) => {
                      setAutoEnd(e.target.value);
                      fetchSuggestions(e.target.value, "end");
                    }}
                    placeholder="End City"
                    className="w-full h-10 bg-muted border border-border rounded-lg pl-8 pr-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
                  />
                  {endSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden border border-border bg-popover">
                      {endSuggestions.map((f) => (
                        <button
                          key={f.id}
                          className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted transition-colors border-b border-border last:border-0"
                          style={{ color: "var(--muted-foreground)", cursor: "pointer" }}
                          onClick={() => {
                            setAutoEnd(f.text);
                            setEndSuggestions([]);
                          }}
                        >
                          {f.place_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleAutoGenerate}
                disabled={autoGenning || !autoStart.trim() || !autoEnd.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: autoGenning ? "#1f2937" : "linear-gradient(135deg, #6366F1, #A855F7)",
                  color: "#fff",
                  border: "none",
                  cursor: autoGenning || !autoStart.trim() || !autoEnd.trim() ? "not-allowed" : "pointer",
                  opacity: !autoStart.trim() || !autoEnd.trim() ? 0.5 : 1,
                }}
              >
                {autoGenning
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting stops...</>
                  : <><Wand2 className="h-3.5 w-3.5" /> Generate Stops Automatically</>}
              </button>
              <p className="text-[10px] text-center text-muted-foreground">
                Uses Mapbox Directions to detect ~10 towns between the two cities
              </p>
            </div>

            {/* Search pool */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Add Stops from Pool</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={stopSearch}
                  onChange={(e) => setStopSearch(e.target.value)}
                  placeholder="Type stop name to search..."
                  className="w-full h-10 bg-muted border border-border rounded-lg pl-9 pr-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              {/* Dropdown results */}
              {stopSearch && (
                <div className="mt-1 rounded-lg overflow-hidden max-h-36 overflow-y-auto border border-border bg-popover">
                  {filteredPool.length === 0 ? (
                    <p className="text-xs text-center py-3 text-muted-foreground">No stops match</p>
                  ) : (
                    filteredPool.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => addStop(s)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                        style={{ color: "var(--foreground)", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: "#6366F1" }} />
                        {s.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Ordered stop list */}
            <div className="flex-1 overflow-y-auto">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Stop Order ({orderedStops.length} stops) — drag ↑↓ to reorder
              </label>
              {orderedStops.length === 0 ? (
                <div className="text-center py-10 rounded-xl bg-muted/50 border border-border border-dashed">
                  <p className="text-sm text-muted-foreground">No stops assigned yet.</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">Search and add stops above.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {orderedStops.map((stop, idx) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-muted border border-border"
                      style={{
                        borderLeft: `3px solid ${idx === 0 ? "#22C55E" : idx === orderedStops.length - 1 ? "#A855F7" : route.color}`,
                      }}
                    >
                      {/* Order badge */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                        style={{ background: idx === 0 ? "#22C55E" : idx === orderedStops.length - 1 ? "#A855F7" : "#374151" }}
                      >
                        {idx + 1}
                      </div>

                      {/* Stop name */}
                      <span className="flex-1 text-sm font-medium truncate text-foreground">{stop.name}</span>

                      {/* Tags */}
                      {idx === 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}>START</span>
                      )}
                      {idx === orderedStops.length - 1 && orderedStops.length > 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.15)", color: "#A855F7" }}>END</span>
                      )}

                      {/* Controls */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveUp(idx)} style={{ padding: "4px", cursor: "pointer", color: "#6B7280", background: "none", border: "none" }}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => moveDown(idx)} style={{ padding: "4px", cursor: "pointer", color: "#6B7280", background: "none", border: "none" }}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeStop(stop.id)} style={{ padding: "4px", cursor: "pointer", color: "#EF4444", background: "none", border: "none" }}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t shrink-0 mt-2 border-border">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-rose-500 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Route
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-md">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save All
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
