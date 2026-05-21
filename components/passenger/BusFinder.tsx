"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Bus, ChevronRight, ArrowLeft, CheckCircle2, Gauge, Clock, AlertTriangle, TrendingUp, MapPin } from "lucide-react";
import { formatTime, formatMinutes, cn } from "@/lib/utils";

interface RouteInfo {
  id: string;
  number: string;
  name: string;
  color: string;
  routeStops: Array<{
    stopOrder: number;
    stop: { id: string; name: string; latitude: number; longitude: number };
  }>;
}

interface BusInfo {
  id: string;
  number: string;
  status: string;
  route?: { id: string; name: string; color: string; number: string } | null;
  location?: { latitude: number; longitude: number; speed: number; heading: number; trackingMode?: "live" | "simulation" } | null;
}

interface Props {
  activeRoutes: RouteInfo[];
  activeBuses: BusInfo[];
  externalFrom?: string;
  externalTo?: string;
  onTrackOnMap?: (busId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BusFinder({ activeRoutes, activeBuses, externalFrom, externalTo, onTrackOnMap }: Props) {
  const [fromStop, setFromStop] = useState("");
  const [toStop, setToStop] = useState("");
  const [date, setDate] = useState("Today");

  useEffect(() => {
    if (externalFrom !== undefined) setFromStop(externalFrom);
    if (externalTo !== undefined) setToStop(externalTo);
  }, [externalFrom, externalTo]);

  const [routeSearch, setRouteSearch]   = useState("");
  const [selectedBus, setSelectedBus]   = useState<BusInfo | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteInfo | null>(null);
  const [etaData, setEtaData] = useState<any[]>([]);
  const [etaLoading, setEtaLoading] = useState(false);

  useEffect(() => {
    if (!selectedBus) {
      setEtaData([]);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/buses/${selectedBus.id}/details`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.stops) {
            setEtaData(data.stops);
            setSelectedBus(prev => {
              if (!prev) return null;
              return {
                ...prev,
                status: data.status,
                location: data.position ? {
                  latitude: data.position.lat,
                  longitude: data.position.lng,
                  speed: data.speed,
                  heading: prev.location?.heading || 0,
                  trackingMode: data.trackingMode
                } : prev.location
              };
            });
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [selectedBus]);

  const filteredRoutes = activeRoutes.filter((r) => {
    const s = r.routeStops.map(rs => rs.stop.name.toLowerCase());
    const f = fromStop ? s.indexOf(fromStop.toLowerCase()) : -1;
    const t = toStop ? s.indexOf(toStop.toLowerCase()) : -1;
    if (fromStop && toStop) return f !== -1 && t !== -1 && f < t;
    if (fromStop) return f !== -1;
    if (toStop) return t !== -1;
    return routeSearch ? (r.name.toLowerCase().includes(routeSearch.toLowerCase()) || r.number.toLowerCase().includes(routeSearch.toLowerCase())) : true;
  });

  const getBusesForRoute = (id: string) => activeBuses.filter(b => b.route?.id === id);

  if (selectedBus && selectedRoute) {
    const isMissionActive = selectedBus.status === "active" || selectedBus.status === "moving" || selectedBus.status === "boarding";

    return (
      <div className="space-y-4">
        <button onClick={() => { setSelectedBus(null); setSelectedRoute(null); setEtaData([]); }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-700 text-gray-400">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="p-4 rounded-xl border border-gray-700 bg-gray-900" style={{ borderLeft: `4px solid ${selectedRoute.color}` }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-[0_0_15px_rgba(255,255,255,0.1)]" style={{ background: selectedRoute.color }}>{selectedBus.number}</div>
            <div className="flex-1">
               <div className="font-bold text-white text-lg">{selectedRoute.name}</div>
               <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">{selectedBus.status}</span>
                  {isMissionActive && (
                     selectedBus.location?.trackingMode === "live" ? (
                        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0 select-none shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                           🟢 LIVE GPS
                        </span>
                     ) : (
                        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/20 shrink-0 select-none shadow-[0_0_10px_rgba(249,115,22,0.15)]">
                           🟠 SIMULATION
                        </span>
                     )
                  )}
               </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onTrackOnMap?.(selectedBus.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-500/40 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"><MapPin className="h-3.5 w-3.5 inline mr-1" />Map</button>
              <div className="px-3 py-1.5 rounded-xl text-xs font-bold border border-cyan-500/30 text-cyan-400 bg-cyan-500/10"><Gauge className="h-3.5 w-3.5 inline mr-1" />{Math.round(selectedBus.location?.speed || 0)} km/h</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 overflow-hidden p-6 space-y-6 shadow-2xl" style={{ background: '#111827' }}>
          {(etaData.length > 0 ? etaData : selectedRoute.routeStops).map((item, i) => {
            const isEta = !!(item as any).stopId;
            const stopName = isEta ? (item as any).stopName : (item as any).stop.name;
            const status = isEta ? (item as any).status : "upcoming";
            const isArrived = status === "arrived" || status === "start" || (item as any).isPassed;
            const distance = isEta ? ((item as any).roadDistance ?? (item as any).distanceKm ?? 0) : 0;
            const liveTime = isEta ? (item as any).liveArrivalTime : null;
            const schedTime = isEta ? ((item as any).scheduledArrivalTime ?? (item as any).scheduledTime) : null;

            return (
              <div key={isEta ? (item as any).stopId : (item as any).stop.id} className="relative flex items-start gap-6 group">
                <div className="flex flex-col items-center w-6 shrink-0">
                  <div className={`w-4 h-4 rounded-full border-2 z-10 transition-all duration-500 ${
                    isArrived ? "bg-emerald-500 border-emerald-400" : (status === "upcoming" && i === 0 ? "bg-orange-500 border-orange-400" : "bg-gray-800 border-gray-700")
                  }`} />
                  {i < (etaData.length || selectedRoute.routeStops.length) - 1 && (
                    <div className={`w-0.5 absolute top-4 bottom-[-24px] transition-colors duration-1000 ${isArrived ? "bg-emerald-500/50" : "bg-gray-800"}`} />
                  )}
                </div>
                <div className="flex-1 pb-2 flex items-center justify-between group-last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-[14px] font-semibold transition-colors",
                      isArrived ? "text-[#10B981]" : "text-[#FFFFFF]"
                    )}>{stopName}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold uppercase tracking-tighter tabular-nums bg-white/5 px-1.5 py-0.5 rounded text-gray-400">
                        LIVE: {formatTime(liveTime)} • {distance.toFixed(1)} KM
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      SCHEDULED: {formatTime(schedTime)}
                    </div>
                    <span className={cn(
                       "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-white/5",
                       status === "start" ? "bg-orange-500/20 text-orange-400 border-orange-500/20" :
                       status === "arrived" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20" :
                       status === "final" ? "bg-blue-500/20 text-blue-400 border-blue-500/20" :
                       "bg-slate-500/20 text-slate-400 border-slate-500/20"
                    )}>
                       {status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {etaData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 opacity-50">
               <Clock className="h-8 w-8 text-gray-600 animate-pulse" />
               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Fetching Real-Time Tracking...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-white">Search Results</h3>
        {(fromStop || toStop) && <button onClick={() => { setFromStop(""); setToStop(""); }} className="text-xs font-bold text-red-500">Clear</button>}
      </div>
      <div className="space-y-3">
        {filteredRoutes.map((route) => {
          const buses = getBusesForRoute(route.id);
          const stops = [...route.routeStops].sort((a,b) => a.stopOrder - b.stopOrder);
          return (
            <div key={route.id} className="rounded-2xl border border-gray-700 bg-gray-900 p-5 flex flex-col md:flex-row gap-6 hover:ring-2 hover:ring-red-500/20">
              <div className="flex gap-4 md:w-1/3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black" style={{ background: route.color }}>{route.number}</div>
                <div>
                  <div className="font-bold text-white leading-tight">{route.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{stops.length} Stops</div>
                  <div className={`mt-2 text-[10px] font-bold uppercase ${buses.length > 0 ? "text-emerald-500" : "text-gray-600"}`}>{buses.length > 0 ? "● Live" : "Offline"}</div>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center border-dashed border-gray-800 md:border-x px-4">
                <div className="flex justify-between items-center max-w-sm mx-auto w-full text-center">
                  <div><div className="text-sm font-black text-white">{stops[0]?.stop.name || "Start"}</div><div className="text-[10px] uppercase text-gray-500">Origin</div></div>
                  <div className="flex-1 px-4"><div className="h-[2px] bg-gray-800 w-full relative"><div className="absolute -top-1 left-0 w-2 h-2 rounded-full bg-gray-700" /><div className="absolute -top-1 right-0 w-2 h-2 rounded-full bg-gray-700" /></div></div>
                  <div><div className="text-sm font-black text-white">{stops[stops.length-1]?.stop.name || "End"}</div><div className="text-[10px] uppercase text-gray-600">Destination</div></div>
                </div>
              </div>
              <div className="md:w-1/4 flex flex-col justify-center items-end gap-3">
                {buses.length > 0 ? (
                  <button onClick={() => { setSelectedBus(buses[0]); setSelectedRoute(route); }} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase bg-red-600 text-white">Track Bus</button>
                ) : (
                  <div className="px-5 py-2.5 rounded-xl text-xs font-black uppercase bg-gray-800 text-gray-600 italic">No Live Bus</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
