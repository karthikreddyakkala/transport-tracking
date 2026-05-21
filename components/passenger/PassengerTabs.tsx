"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChatInterface from "@/components/chat/ChatInterface";
import {
  MapPin, Clock, Star, MessageSquare, Bus, Search,
  TrendingUp, Navigation, Gauge, Heart, HeartOff, SearchCheck, CheckCircle2, ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import BusFinder from "@/components/passenger/BusFinder";
import { formatTime, formatMinutes, cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const TrackingMap = dynamic(() => import("@/components/map/TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    </div>
  ),
});

interface BusInfo {
  id: string;
  number: string;
  status: string;
  route?: { id: string; name: string; color: string; number: string } | null;
  location?: { latitude: number; longitude: number; speed: number; heading: number } | null;
}

interface RouteInfo {
  id: string;
  number: string;
  name: string;
  color: string;
  status: string;
  routeStops: Array<{ stopOrder: number; stop: { id: string; name: string; latitude: number; longitude: number } }>;
}

interface InitialBus {
  busId: string;
  busNumber: string;
  routeId: string;
  routeColor: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
}

interface ETA {
  busId: string;
  busNumber: string;
  routeName: string;
  routeColor: string;
  stopName: string;
  minutesAway: number;
  arrivalTime: string;
  scheduledArrivalTime: string;
  distanceKm: number;
  confidence: number;
}

interface Props {
  userId: string;
  initialBuses: InitialBus[];
  activeBuses: BusInfo[];
  activeRoutes: RouteInfo[];
  favoriteRouteIds: string[];
}

export default function PassengerTabs({
  userId,
  initialBuses,
  activeBuses,
  activeRoutes,
  favoriteRouteIds: initialFavorites,
}: Props) {
  const [activeTab, setActiveTab] = useState("map");
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [isTimelineMinimized, setIsTimelineMinimized] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [etas, setEtas] = useState<any[]>([]);
  const [etaLoading, setEtaLoading] = useState(false);
  const [fromStop, setFromStop] = useState("");
  const [toStop, setToStop] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearestStop, setNearestStop] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const allStopsFlat = activeRoutes.flatMap((r) => r.routeStops.map((rs) => rs.stop));
  const uniqueStops = Array.from(new Map(allStopsFlat.map(s => [s.id, s])).values());
  const allStopNames = Array.from(new Set(uniqueStops.map(s => s.name))).sort();

  // Helper to find nearest stop
  const findNearestStop = useCallback((lat: number, lng: number) => {
    let minD = Infinity;
    let closest: any = null;
    uniqueStops.forEach(s => {
      const d = Math.sqrt(Math.pow(s.latitude - lat, 2) + Math.pow(s.longitude - lng, 2));
      if (d < minD) { minD = d; closest = s; }
    });
    return closest;
  }, [uniqueStops]);

  const handleLocate = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        const nearest = findNearestStop(latitude, longitude);
        if (nearest) {
          setNearestStop(nearest.name);
          setFromStop(nearest.name);
          toast.success(`Found nearest stop: ${nearest.name}`);
          // Switch to find tab to show results from this stop
          setActiveTab("find");
        }
      },
      () => toast.error("Location access denied")
    );
  };

  async function loadETAs() {
    setEtaLoading(true);
    try {
      const res = await fetch("/api/live-tracking");
      if (!res.ok) return;
      const data = await res.json();
      setEtas(data.buses || []);
    } finally {
      setEtaLoading(false);
    }
  }

  useEffect(() => {
    loadETAs();
    const t = setInterval(loadETAs, 5000);
    return () => clearInterval(t);
  }, []);

  async function toggleFavorite(routeId: string) {
    const isFav = favorites.has(routeId);
    // Optimistic update
    setFavorites((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(routeId) : next.add(routeId);
      return next;
    });

    try {
      await fetch("/api/favorites", {
        method: isFav ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId }),
      });
      toast.success(isFav ? "Removed from favorites" : "Added to favorites");
    } catch {
      // Revert on error
      setFavorites((prev) => {
        const next = new Set(prev);
        isFav ? next.add(routeId) : next.delete(routeId);
        return next;
      });
      toast.error("Failed to update favorites");
    }
  }

  const filteredRoutes = activeRoutes.filter(
    (r) =>
      r.name.toLowerCase().includes(routeSearch.toLowerCase()) ||
      r.number.toLowerCase().includes(routeSearch.toLowerCase()) ||
      r.routeStops.some((rs) => rs.stop.name.toLowerCase().includes(routeSearch.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <style jsx>{`
        .search-container { perspective: 1000px; margin-bottom: 2rem; }
        .search-bar-inner { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .search-bar-inner:focus-within { transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2); }
        .pulse-red { animation: pulse 2s infinite; }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(216, 78, 85, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(216, 78, 85, 0); }
          100% { box-shadow: 0 0 0 0 rgba(216, 78, 85, 0); }
        }
      `}</style>

      {/* ── Dashboard Search Bar (redBus style Overhaul) ──────────────── */}
      <div className="search-container relative">
        <div 
          className="flex flex-col md:flex-row items-stretch bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden border border-[#E5E7EB]"
          style={{ minHeight: "85px" }}
        >
          {/* FROM */}
          <div className="flex-1 flex items-center px-6 py-4 border-r border-[#E5E7EB] relative group">
            <Bus className="h-5 w-5 text-[#9CA3AF] mr-3" />
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-tight flex items-center gap-2">
                From
                <button 
                  onClick={handleLocate}
                  className="ml-auto flex items-center gap-1 text-[9px] text-[#3B82F6] hover:text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded transition-all font-bold"
                >
                  <Navigation className="h-2.5 w-2.5" />
                  Locate Me
                </button>
              </label>
              <select 
                value={fromStop}
                onChange={(e) => setFromStop(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[#111827] font-bold text-base appearance-none cursor-pointer"
              >
                <option value="" className="text-[#9CA3AF]">Select Origin</option>
                {allStopNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* TO */}
          <div className="flex-1 flex items-center px-6 py-4 border-r border-[#E5E7EB] relative group">
            <div 
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-white border border-[#E5E7EB] rounded-full p-2 shadow-sm text-[#6B7280] hover:text-[#EF4444] transition-all cursor-pointer hidden md:flex items-center justify-center hover:scale-110 active:scale-95"
              onClick={() => { const tmp = fromStop; setFromStop(toStop); setToStop(tmp); }}
            >
              <TrendingUp className="h-4 w-4 rotate-90" />
            </div>
            <Bus className="h-5 w-5 text-[#9CA3AF] mr-3" />
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-tight">To</label>
              <select 
                value={toStop}
                onChange={(e) => setToStop(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[#111827] font-bold text-base appearance-none cursor-pointer"
              >
                <option value="" className="text-[#9CA3AF]">Select Destination</option>
                {allStopNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* SEARCH BUTTON */}
          <button 
            onClick={() => setActiveTab("find")}
            className="bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold px-12 py-4 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm shadow-md active:scale-95"
          >
            <Search className="h-5 w-5 stroke-[3]" />
            Search
          </button>
        </div>

        {/* Floating Toggle (Cleaned up) */}
        <div className="mt-4 flex items-center gap-6 text-xs font-semibold text-[#6B7280]">
           <div className="flex items-center gap-2 cursor-pointer hover:text-[#111827] transition-colors">
              <div className="w-4 h-4 rounded-sm border border-[#E5E7EB] bg-white shadow-sm" />
              <span>Booking for women</span>
           </div>
           <div className="flex items-center gap-2 cursor-pointer hover:text-[#111827] transition-colors">
              <div className="w-4 h-4 rounded-sm border border-[#E5E7EB] bg-white shadow-sm" />
              <span>Primo (Premium)</span>
           </div>
           <div className="flex items-center gap-2 cursor-pointer hover:text-[#111827] transition-colors">
              <div className="w-4 h-4 rounded-sm border border-[#E5E7EB] bg-white shadow-sm" />
              <span>AC Available</span>
           </div>
        </div>
      </div>

      {/* ── Proactive Location Section ──────────────── */}
      {userLocation && nearestStop && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
               <div>
                  <h4 className="text-sm font-bold text-blue-600 flex items-center gap-2">
                    <Navigation className="h-4 w-4 animate-pulse" />
                    Buses arriving near you
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Based on your proximity to <span className="font-bold text-foreground">{nearestStop}</span></p>
               </div>
               <button onClick={() => { setUserLocation(null); setNearestStop(null); setFromStop(""); }} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">Dismiss</button>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {activeRoutes
                 .filter(r => r.routeStops.some(rs => rs.stop.name === nearestStop))
                 .slice(0, 3)
                 .map(route => {
                    const buses = activeBuses.filter(b => b.route?.id === route.id);
                    return (
                       <div key={route.id} className="p-3 bg-white rounded-xl border border-blue-100 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[10px]" style={{ background: route.color }}>{route.number}</div>
                          <div className="flex-1 min-w-0">
                             <p className="text-xs font-bold truncate text-gray-800">{route.name}</p>
                             <p className="text-[10px] text-emerald-600 font-medium">{buses.length > 0 ? "LIVE" : "Next: 4:30 AM"}</p>
                          </div>
                          <button 
                            onClick={() => { setFromStop(nearestStop); setActiveTab("find"); }}
                            className="bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-lg"
                          >
                            Track
                          </button>
                       </div>
                    );
                 })}
            </div>
          </div>
        </div>
      )}

    <Tabs
      value={activeTab}
      onValueChange={(v) => {
        setActiveTab(v);
        if (v === "arrivals") startTransition(() => { loadETAs(); });
      }}
      className="space-y-6"
    >
      <TabsList className="grid grid-cols-5 w-full max-w-xl h-11 bg-[#F3F4F6] p-1 rounded-xl">
        {[
          { id: "map", label: "Map", icon: MapPin },
          { id: "find", label: "Find Bus", icon: SearchCheck },
          { id: "arrivals", label: "Arrivals", icon: Clock },
          { id: "routes", label: "Routes", icon: Star },
          { id: "chat", label: "AI Chat", icon: MessageSquare },
        ].map((tab) => (
          <TabsTrigger 
            key={tab.id}
            value={tab.id} 
            className="gap-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-[#111827] data-[state=active]:shadow-[0_2px_6px_rgba(0,0,0,0.08)] text-[#6B7280]"
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* ── Find My Bus ─────────────────────────────── */}
      <TabsContent value="find">
        <BusFinder 
          activeRoutes={activeRoutes} 
          activeBuses={activeBuses} 
          externalFrom={fromStop}
          externalTo={toStop}
          onTrackOnMap={(busId) => {
            setSelectedBusId(busId);
            setActiveTab("map");
          }}
        />
      </TabsContent>

      {/* ── Live Map ───────────────────────────────── */}
      <TabsContent value="map" className="space-y-6">
        {selectedBusId ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
            {/* Left: Map */}
            <div className={isTimelineMinimized ? "lg:col-span-12" : "lg:col-span-8"}>
              <div className="h-[calc(100vh-280px)] min-h-[500px] rounded-xl overflow-hidden border border-[#E5E7EB] shadow-sm bg-white relative">
                {isTimelineMinimized && (
                  <Button 
                    className="absolute top-4 right-4 z-10 shadow-xl gap-2 font-bold bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => setIsTimelineMinimized(false)}
                  >
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                    Show Timeline
                  </Button>
                )}
                <TrackingMap 
                  routes={activeRoutes.filter(r => r.id === activeBuses.find(b => b.id === selectedBusId)?.route?.id)} 
                  initialBuses={initialBuses} 
                  liveBuses={etas}
                  selectedBusId={selectedBusId}
                  onBusClick={(id) => setSelectedBusId(id)}
                  fitToRoute={false}
                />
              </div>
            </div>

            {/* Right: Timeline */}
            {!isTimelineMinimized && (
              <div className="lg:col-span-4">
                 <PassengerTimeline 
                   selectedBusId={selectedBusId} 
                   etas={etas} 
                   activeBuses={activeBuses} 
                   activeRoutes={activeRoutes} 
                   onBack={() => setSelectedBusId(null)} 
                   onMinimize={() => setIsTimelineMinimized(true)}
                 />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="h-[calc(100vh-340px)] min-h-96 rounded-xl overflow-hidden border border-[#E5E7EB] shadow-sm bg-white">
              <TrackingMap 
                routes={activeRoutes} 
                initialBuses={initialBuses} 
                liveBuses={etas}
                selectedBusId={selectedBusId}
                onBusClick={(id) => setSelectedBusId(id)}
              />
            </div>

            {activeBuses.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3 text-[#6B7280]">
                  Active Buses
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeBuses.slice(0, 6).map((bus) => (
                    <div
                      key={bus.id}
                      className="flex items-center gap-3 p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-sm transition-all hover:shadow-md cursor-pointer"
                      onClick={() => { setSelectedBusId(bus.id); }}
                    >
                      {/* Badge */}
                      <div
                        className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-[11px] bg-[#3B82F6] shadow-[0_2px_10px_rgba(59,130,246,0.2)]"
                      >
                        {bus.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate text-[#111827]">
                          {bus.route?.name ?? "Unassigned"}
                        </p>
                        <div className="flex items-center gap-1 text-xs mt-1 text-[#6B7280] font-medium">
                          <Gauge className="h-3 w-3" />
                          {bus.location ? `${Math.round(bus.location.speed)} km/h` : "No GPS"}
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-1.5 text-[10px] font-bold shrink-0 px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] uppercase tracking-wider"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                        Live
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </TabsContent>

      {/* ── Arrivals ───────────────────────────────── */}
      <TabsContent value="arrivals">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Upcoming Arrivals
            </p>
            <Button variant="ghost" size="sm" onClick={loadETAs} className="h-7 text-xs gap-1">
              <Navigation className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {etaLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : etas.length === 0 && activeBuses.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Bus className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="font-medium text-muted-foreground">No active buses</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Check back during service hours.</p>
              </CardContent>
            </Card>
          ) : etas.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="font-medium text-muted-foreground">Click Refresh to load ETAs</p>
                <p className="text-sm text-muted-foreground/60 mt-1">ETA data requires the simulator to be running.</p>
                <Button variant="outline" size="sm" onClick={loadETAs} className="mt-4 gap-1">
                  <Navigation className="h-3 w-3" /> Load Arrivals
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
            <div className="space-y-4">
              {etas.map((bus: any) => (
                <div key={bus.id} className="p-4 rounded-xl border border-white/5 bg-[#111827] shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-xs" style={{ background: bus.routeColor || '#3B82F6' }}>
                        {bus.number}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{bus.nextStop}</p>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live Tracking</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                       {Math.round(bus.speed)} KM/H
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {bus.stops?.slice(0, 2).map((stop: any, idx: number) => (
                      <div key={stop.stopId} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{stop.stopName || stop.name}</p>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            LIVE: {formatTime(stop.liveArrivalTime)} • {(stop.roadDistance || stop.distanceKm || 0).toFixed(1)} KM
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                           <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Scheduled</p>
                           <p className="text-[10px] font-black text-white">{formatTime(stop.scheduledArrivalTime || stop.scheduledTime)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            </div>
          )}

          {etas.length === 0 && activeBuses.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#6B7280" }}>All Buses</p>
              {activeBuses.map((bus) => (
                <div
                  key={bus.id}
                  className="flex items-center gap-3 p-3.5 rounded-xl transition-all bg-card border"
                  style={{
                    borderLeft: `3px solid ${bus.route?.color ?? "#6366F1"}`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
                    style={{ background: bus.route?.color ?? "#6366F1", boxShadow: `0 0 10px ${bus.route?.color ?? "#6366F1"}55` }}
                  >
                    {bus.number}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: "#F9FAFB" }}>{bus.route?.name ?? "Unknown Route"}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                      {bus.location ? `${Math.round(bus.location.speed)} km/h` : "Location unknown"}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E" }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                    Active
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      {/* ── Routes ─────────────────────────────────── */}
      <TabsContent value="routes">
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search routes or stops…"
              value={routeSearch}
              onChange={(e) => setRouteSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>

          {/* Favorites first */}
          {favorites.size > 0 && routeSearch === "" && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Saved Routes
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {activeRoutes
                  .filter((r) => favorites.has(r.id))
                  .map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      isFav={true}
                      onToggleFav={toggleFavorite}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* All routes */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {routeSearch ? `Results (${filteredRoutes.length})` : "All Routes"}
            </p>
            {filteredRoutes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No routes match your search.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {filteredRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    isFav={favorites.has(route.id)}
                    onToggleFav={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      {/* ── AI Chat ────────────────────────────────── */}
      <TabsContent value="chat" className="h-[calc(100vh-320px)] min-h-96">
        <div className="h-full rounded-xl border overflow-hidden bg-card flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Transit AI Assistant</p>
              <p className="text-xs text-muted-foreground">Powered by Gemini</p>
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatInterface userId={userId} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
    </div>
  );
}

function RouteCard({
  route,
  isFav,
  onToggleFav,
}: {
  route: RouteInfo;
  isFav: boolean;
  onToggleFav: (id: string) => void;
}) {
  const firstStop = route.routeStops[0]?.stop?.name;
  const lastStop = route.routeStops[route.routeStops.length - 1]?.stop?.name;

  return (
    <div className="group flex items-start gap-3 p-3.5 rounded-xl border bg-card hover:shadow-sm transition-all">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5"
        style={{ backgroundColor: route.color }}
      >
        {route.number}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{route.name}</p>
        <p className="text-xs text-muted-foreground">
          {route.routeStops.length} stops
          {firstStop && lastStop && (
            <> · {firstStop} → {lastStop}</>
          )}
        </p>
      </div>
      <button
        onClick={() => onToggleFav(route.id)}
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
        title={isFav ? "Remove from favorites" : "Add to favorites"}
      >
        {isFav ? (
          <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
        ) : (
          <HeartOff className="h-4 w-4 text-muted-foreground group-hover:text-rose-400 transition-colors" />
        )}
      </button>
    </div>
  );
}

function PassengerTimeline({ 
  selectedBusId, 
  etas, 
  activeBuses, 
  activeRoutes, 
  onBack,
  onMinimize
}: { 
  selectedBusId: string; 
  etas: any[]; 
  activeBuses: any[]; 
  activeRoutes: any[]; 
  onBack: () => void;
  onMinimize?: () => void;
}) {
  const bus = activeBuses.find(b => b.id === selectedBusId);
  const route = activeRoutes.find(r => r.id === bus?.route?.id);
  const liveBusData = etas.find(e => e.busId === selectedBusId || e.id === selectedBusId);
  
  const timelineData = liveBusData?.stops?.length > 0 ? liveBusData.stops : (route?.routeStops || []);

  return (
    <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px] border-white/5 shadow-2xl overflow-hidden" style={{ background: '#0F172A' }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h3 className="text-sm font-bold text-white">{bus?.number || "Unknown Bus"}</h3>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{route?.name || "Tracking"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/5 font-bold">
            {timelineData.length} STOPS
          </Badge>
          {onMinimize && (
            <Button variant="ghost" size="icon" onClick={onMinimize} className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 rounded-full ml-1">
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full px-6 pb-6 pt-4">
          <div className="relative pt-2">
            <div className="absolute left-[15px] top-4 bottom-4 w-px bg-white/10" />
            
            <div className="space-y-6">
              {timelineData.map((item: any, i: number) => {
                const isEta = !!item.stopId;
                const stopName = isEta ? (item.stopName || item.name) : item.stop.name;
                const status = isEta ? item.status : "upcoming";
                const isArrived = status === "arrived" || status === "start" || item.isPassed;
                const distance = isEta ? (item.roadDistance ?? item.distanceKm ?? 0) : 0;
                const liveTime = isEta ? item.liveArrivalTime : null;
                const schedTime = isEta ? (item.scheduledArrivalTime ?? item.scheduledTime) : null;
                const isStart = i === 0 || status === "start";
                const isFinal = i === timelineData.length - 1 || status === "final";
                
                const isNextTarget = !isArrived && (i === 0 || (isEta ? timelineData[i-1]?.status === "arrived" : false));

                return (
                  <div key={isEta ? item.stopId : item.stop.id} className="flex gap-4">
                    <div className="relative flex flex-col items-center shrink-0">
                      <div className={cn(
                        "w-8 h-8 rounded-full border-4 border-[#0F172A] z-10 flex items-center justify-center",
                        isStart ? "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : 
                        isArrived ? "bg-emerald-500" : "bg-slate-700"
                      )}>
                        {isArrived && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    <div className={cn(
                      "flex-1 p-4 rounded-xl border transition-all duration-500",
                      isArrived ? "bg-emerald-500/5 border-emerald-500/20" : isNextTarget ? "bg-orange-500/5 border-orange-500/20" : "bg-white/5 border-white/5"
                    )}>
                       <div className="flex justify-between items-start mb-2">
                          <h4 className={cn(
                            "text-sm font-bold tracking-tight",
                            isArrived ? "text-emerald-400/60" : isStart ? "text-orange-400" : "text-white"
                          )}>
                            {stopName}
                            {isStart && <span className="text-[10px] ml-1 opacity-70">(START)</span>}
                            {isFinal && <span className="text-[10px] ml-1 opacity-70">(FINAL)</span>}
                          </h4>
                          <Badge variant="outline" className={cn(
                             "text-[9px] font-black uppercase tracking-widest border-none",
                             status === "start" ? "bg-orange-500/20 text-orange-400" :
                             status === "arrived" ? "bg-emerald-500/20 text-emerald-400" :
                             status === "final" ? "bg-blue-500/20 text-blue-400" :
                             "bg-slate-500/20 text-slate-400"
                          )}>
                             {status}
                          </Badge>
                       </div>
                       
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-300">
                             <span className={cn(isArrived ? "text-emerald-500/60" : "text-blue-400")}>
                                LIVE: {formatTime(liveTime)}
                             </span>
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                             SCHEDULED: {formatTime(schedTime)}
                          </div>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
