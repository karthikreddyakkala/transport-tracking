"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Route, Activity, Clock, Navigation, MapPin, Gauge, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatTime, cn } from "@/lib/utils";
import { getPusherClient, CHANNELS, EVENTS } from "@/lib/pusher";

export function BusDetailsSheet({
  busId,
  open,
  onOpenChange,
}: {
  busId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !busId) return;
    
    let isMounted = true;
    if (!data) setLoading(true);
    setError("");
    
    const fetchBus = () => {
       fetch(`/api/buses/${busId}/details`)
         .then((res) => {
           if (!res.ok) throw new Error("Failed to fetch details");
           return res.json();
         })
         .then((json) => {
           if (isMounted) setData(json);
         })
         .catch((err) => {
           if (isMounted && !data) setError(err.message);
         })
         .finally(() => {
           if (isMounted) setLoading(false);
         });
    };
    
    fetchBus();

    // Pusher Integration for Real-Time Sync
    const pusher = getPusherClient();
    const channel = pusher.subscribe(CHANNELS.BUS_TRACKING);
    channel.bind(EVENTS.LOCATION_UPDATE, (update: any) => {
      if (update.busId === busId && isMounted) {
        // If the update has the same structure, merge it
        setData((prev: any) => {
          if (!prev) return prev;
          return { ...prev, ...update };
        });
      }
    });

    const interval = setInterval(fetchBus, 3000); // High frequency polling as fallback
      
    return () => { 
       isMounted = false; 
       pusher.unsubscribe(CHANNELS.BUS_TRACKING);
       clearInterval(interval);
    };
  }, [busId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md lg:max-w-lg overflow-hidden flex flex-col p-0 bg-[#0F172A] border-l border-white/10 transition-all duration-300">
        <div className="p-6 bg-[#1E293B] border-b border-white/5 shrink-0">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-2xl font-black text-white flex items-center gap-3">
                Bus {data?.number || "..."}
                {data?.status && (
                  <Badge className={cn(
                    "uppercase tracking-widest font-black",
                    data.status === "active" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"
                  )}>
                    {data.status}
                  </Badge>
                )}
                {data?.status === "active" && (
                  data?.trackingMode === "live" ? (
                    <Badge className="bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-black tracking-widest uppercase hover:bg-[#10B981]/20">
                      🟢 LIVE GPS
                    </Badge>
                  ) : (
                    <Badge className="bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30 font-black tracking-widest uppercase hover:bg-[#F97316]/20">
                      🟠 SIMULATION
                    </Badge>
                  )
                )}
              </SheetTitle>
            </div>
            <SheetDescription className="text-slate-400 font-medium">
              Real-time traffic route tracking
            </SheetDescription>
          </SheetHeader>

          {data?.route && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                <Route className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="truncate">{data.route.startPoint}</span>
                <span className="text-slate-500 mx-1">→</span>
                <span className="truncate">{data.route.endPoint}</span>
              </div>
              <div className="flex items-center gap-4 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  <span>START: {formatTime(data.actualStartTime || data.scheduledStartTime)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 relative bg-[#0F172A] transition-opacity duration-500">
          {loading && !data && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0F172A]/50 z-10">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          )}
          
          {error && !data && (
            <div className="text-center p-6 text-red-500 bg-red-500/10 rounded-lg border border-red-500/20">
              {error}
            </div>
          )}

          {!loading && !error && data && data.status === "unassigned" && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 pt-12">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                <Navigation className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="text-lg font-bold text-white">Not in Service</h3>
              <p className="text-sm text-slate-400 max-w-[250px]">
                No route assigned to this bus yet.
              </p>
            </div>
          )}

          {!loading && !error && data && data.status !== "unassigned" && (
            <div className="space-y-8 pb-12">
              
              {/* Delay & Speed Status */}
              <div className="grid grid-cols-2 gap-3">
                 <div className={cn(
                    "p-3 rounded-lg border flex items-center gap-2 font-black text-xs uppercase tracking-widest",
                    data.delayMinutes > 5 ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                 )}>
                   {data.delayMinutes > 5 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                   {data.delayMinutes > 0 ? `${data.delayMinutes} MIN DELAY` : "ON TIME"}
                 </div>
                 <div className="p-3 rounded-lg border border-white/5 bg-white/5 flex items-center gap-2 font-black text-xs uppercase tracking-widest text-blue-400">
                   <Gauge className="w-3.5 h-3.5" />
                   {Math.round(data.speed)} KM/H
                 </div>
              </div>

              {/* Progress Summary */}
              <div className="p-5 rounded-2xl bg-[#1E293B] border border-white/5 shadow-xl space-y-4">
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Next Destination</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Live</span>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-xl font-black text-white tracking-tight">{data.nextStop}</h4>
                    <p className="text-xs font-bold text-slate-400">{Math.round(data.remainingDistance * 10) / 10} KM REMAINING</p>
                 </div>
                 <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                       className="bg-emerald-500 h-full transition-all duration-1000" 
                       style={{ width: `${Math.round((data.distanceCovered / (data.totalDistance || 1)) * 100)}%` }} 
                    />
                 </div>
              </div>

              {/* Route Sequence Timeline (Strict Format) */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                   <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Route Sequence</h3>
                   <span className="text-[10px] font-bold text-slate-600">({data.stops?.length || 0} STOPS)</span>
                </div>
                
                <div className="relative space-y-4 before:absolute before:inset-y-2 before:left-[15px] before:w-px before:bg-white/10">
                  {data.stops?.map((stop: any, idx: number) => {
                     const isArrived = stop.status === "arrived" || stop.status === "start" || stop.isPassed;
                     const isStart = idx === 0 || stop.status === "start";
                     const isFinal = idx === data.stops.length - 1 || stop.status === "final";
                     
                     return (
                        <div key={stop.stopId} className="relative pl-10">
                           {/* Marker Circle */}
                           <div className={cn(
                              "absolute left-0 top-1.5 w-8 h-8 -translate-x-1/2 rounded-full border-4 border-[#0F172A] z-10 flex items-center justify-center",
                              isStart ? "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : 
                              isArrived ? "bg-emerald-500" : "bg-slate-700"
                           )}>
                              {isArrived && <CheckCircle2 className="w-3 h-3 text-white" />}
                           </div>
                           
                           {/* Stop Card */}
                           <div className={cn(
                              "p-4 rounded-xl border transition-all duration-500",
                              isArrived ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white/5 border-white/5"
                           )}>
                              <div className="flex justify-between items-start mb-2">
                                 <h4 className={cn(
                                   "text-sm font-bold tracking-tight",
                                   isArrived ? "text-emerald-400" : isStart ? "text-orange-400" : "text-white"
                                 )}>
                                   {stop.stopName || stop.name} 
                                   {isStart && <span className="text-[10px] ml-1 opacity-70">(START)</span>}
                                   {isFinal && <span className="text-[10px] ml-1 opacity-70">(FINAL)</span>}
                                 </h4>
                                 <Badge variant="outline" className={cn(
                                    "text-[9px] font-black uppercase tracking-widest border-none",
                                    stop.status === "start" ? "bg-orange-500/20 text-orange-400" :
                                    stop.status === "arrived" ? "bg-emerald-500/20 text-emerald-400" :
                                    stop.status === "final" ? "bg-blue-500/20 text-blue-400" :
                                    "bg-slate-500/20 text-slate-400"
                                 )}>
                                    {stop.status}
                                 </Badge>
                              </div>
                              
                              <div className="space-y-1">
                                 <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-300">
                                    <span className={cn(isArrived ? "text-emerald-500" : "text-blue-400")}>
                                       LIVE: {formatTime(stop.liveArrivalTime)}
                                    </span>
                                    <span className="text-slate-600">•</span>
                                    <span>{(stop.roadDistance || stop.distanceKm || 0).toFixed(1)} KM</span>
                                 </div>
                                 <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    SCHEDULED: {formatTime(stop.scheduledArrivalTime || stop.scheduledTime)}
                                 </div>
                              </div>
                           </div>
                        </div>
                     );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
