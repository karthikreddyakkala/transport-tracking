"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPusherClient, CHANNELS, EVENTS } from "@/lib/pusher";
import {
  BusIcon, MapPin, Navigation, Clock, AlertTriangle, CheckCircle, CheckCircle2,
  XCircle, Flag, Gauge, Radio, ChevronRight, Zap, Users, TrendingUp, Activity
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatTime, formatMinutes } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";

const TrackingMap = dynamic(() => import("@/components/map/TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted/30">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface RouteRecommendation {
  recommendationId: string;
  reason: string;
  timeSavedMinutes: number;
  priority: number;
  expiresAt: string;
}

interface NextStop {
  stopId?: string;
  stopName?: string;
  name: string;
  minutesAway: number;
  confidence: number;
  isPassed?: boolean;
  arrivalTime?: string;
  liveArrivalTime?: string;
  scheduledArrivalTime?: string;
  scheduledTime?: string;
  distanceKm?: number;
  roadDistance?: number;
  status?: string;
}

export default function DriverDashboard() {
  const [assignedBuses, setAssignedBuses] = useState<any[]>([]);
  const [busData, setBusData] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [recommendation, setRecommendation] = useState<RouteRecommendation | null>(null);
  const [nextStops, setNextStops] = useState<NextStop[]>([]);
  const [speed, setSpeed] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(0);

  const isMissionActive = busData?.status === "active";
  const isAssigned = busData?.status === "assigned";
  const isCompleted = busData?.status === "completed";

  // Driver can start mission anytime (no restriction for late start)
  const isLockedByTime = false;

  const handleSelectMission = (bus: any) => {
    if (bus) {
      setBusData(bus);
      window.history.pushState({ busId: bus.id }, '', `?bus=${bus.id}`);
    } else {
      setBusData(null);
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const urlBusId = new URLSearchParams(window.location.search).get('bus');
      if (!urlBusId) {
        setBusData(null);
      } else {
        setAssignedBuses((prevBuses) => {
          const found = prevBuses.find(b => b.id === urlBusId);
          if (found) setBusData(found);
          return prevBuses;
        });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Smooth Speed Animation
  useEffect(() => {
    const duration = 2000; // 2 seconds to reach the next speed
    const steps = 60;
    const increment = (speed - displaySpeed) / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      if (currentStep < steps) {
        setDisplaySpeed(prev => Math.round(prev + increment));
        currentStep++;
      } else {
        setDisplaySpeed(speed);
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [speed]);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issuePriority, setIssuePriority] = useState<"low" | "medium" | "high" | "critical">("medium");

  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [missionStatusState, setMissionStatusState] = useState<string>("inactive");
  const [realSystemTime, setRealSystemTime] = useState<Date>(new Date());
  const trackingMode = busData?.location?.trackingMode || busData?.trackingMode || "simulation";
  const gpsBufferRef = useRef<GeolocationCoordinates[]>([]);
  const { data: session } = useSession();

  const [serverTimeDelta, setServerTimeDelta] = useState(0);
  const [simulatedDistance, setSimulatedDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(40); // default simulated speed km/h

  useEffect(() => {
    fetch("/api/time").then(res => res.json()).then(data => {
       setServerTimeDelta(data.serverTime - Date.now());
    }).catch(() => {});
  }, []);

  useEffect(() => {
     const t = setInterval(() => setRealSystemTime(new Date(Date.now() + serverTimeDelta)), 1000);
     return () => clearInterval(t);
  }, [serverTimeDelta]);

  useEffect(() => {
    fetch("/api/routes").then((r) => r.json()).then(setRoutes).catch(() => {});
    
    fetch("/api/buses")
      .then((r) => r.json())
      .then((buses: any[]) => {
        // Strict Assignment Logic for multiple buses
        const matchingBuses = buses.filter((b) => 
          b.driverId === session?.user?.id || 
          (b.manualDriverName && b.manualDriverName.toLowerCase() === session?.user?.name?.toLowerCase())
        );
        
        if (matchingBuses.length > 0) {
          setAssignedBuses(matchingBuses);
          
          setBusData((prev: any) => {
            if (!prev) {
               const urlBusId = new URLSearchParams(window.location.search).get('bus');
               if (urlBusId) {
                  return matchingBuses.find(b => b.id === urlBusId) || null;
               }
               return null;
            }
            const updated = matchingBuses.find((b: any) => b.id === prev.id);
            return updated || null;
          });

        }
      })
      .catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    if (!busData?.id) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(CHANNELS.bus(busData.id));
    channel.bind(EVENTS.STATUS_UPDATE, (data: any) => {
       setBusData(data);
    });

    // Global tracking channel for route recommendations
    const trackingChannel = pusher.subscribe(CHANNELS.BUS_TRACKING);
    trackingChannel.bind(EVENTS.ROUTE_RECOMMENDATION, (data: RouteRecommendation) => {
      setRecommendation(data);
      setTimeout(() => {
        setRecommendation((prev) =>
          prev?.recommendationId === data.recommendationId ? null : prev
        );
      }, new Date(data.expiresAt).getTime() - Date.now());
    });

    const trackChannel = pusher.subscribe(CHANNELS.BUS_TRACKING);
    trackChannel.bind(EVENTS.LOCATION_UPDATE, (data: any) => {
      if (data.busId === busData.id) {
         setSpeed(Math.round(data.speed));
         setCurrentSpeed(data.speed > 0 ? data.speed : 40);
         if (data.progress !== undefined) setCompletionPercentage(data.progress);
         if (data.status) setMissionStatusState(data.status);
         setBusData((prev: any) => ({ ...prev, ...data }));
         if (data.stops) setNextStops(data.stops);
      }
    });

    const fetchETAs = () => {
      fetch(`/api/live-tracking`)
        .then((r) => r.json())
        .then((data: any) => {
          const myBus = data.buses.find((b: any) => b.busId === busData.id || b.id === busData.id);
          if (myBus) {
            setBusData((prev: any) => ({ ...prev, ...myBus }));
            setNextStops(myBus.stops || []);
            setSpeed(Math.round(myBus.speed));
            setCurrentSpeed(myBus.speed > 0 ? myBus.speed : 40);
            if (myBus.progress !== undefined) setCompletionPercentage(myBus.progress);
            if (myBus.status) setMissionStatusState(myBus.status);
          } else {
            // Fallback: If not found in active live tracking, query the specific bus directly to see if it completed!
            fetch(`/api/buses/${busData.id}`)
              .then((r) => r.json())
              .then((individualBus: any) => {
                 if (individualBus && individualBus.status === "completed") {
                    setBusData(individualBus);
                    setMissionStatusState("completed");
                    setCompletionPercentage(100);
                    setSpeed(0);
                    if (individualBus.route?.routeStops) {
                       const stops = individualBus.route.routeStops;
                       let cumulative = 0;
                       const finalStops = stops.map((rs: any, idx: number) => {
                          const stopDist = rs.distanceFromPrev || 0;
                          cumulative = stopDist > 0 ? stopDist : (idx === 0 ? 0 : cumulative + 1);
                          return {
                             stopId: rs.stopId,
                             stopName: rs.stop.name,
                             name: rs.stop.name,
                             roadDistance: cumulative,
                             liveArrivalTime: individualBus.endTime || new Date().toISOString(),
                             scheduledArrivalTime: new Date().toISOString(),
                             status: "arrived" as const,
                             isPassed: true
                          };
                       });
                       setNextStops(finalStops);
                    }
                 }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    };

    fetchETAs();
    let interval = setInterval(fetchETAs, 3000); 

    return () => {
      pusher.unsubscribe(CHANNELS.bus(busData.id));
      pusher.unsubscribe(CHANNELS.BUS_TRACKING);
      clearInterval(interval);
    };
  }, [busData?.id, isMissionActive]);

  // Native GPS & Drift Architecture Stream Engine
  useEffect(() => {
     if (isMissionActive && busData?.id) {
        const isLiveMode = trackingMode === "live";

        if (isLiveMode && "geolocation" in navigator) {
           let lastUploadTime = 0;

           const geoId = navigator.geolocation.watchPosition(
              (pos) => {
                 const now = Date.now();
                 // Throttle uploads to once every 3-5 seconds
                 if (now - lastUploadTime < 3000) return;
                 lastUploadTime = now;

                 const geoSpeed = pos.coords.speed !== null ? pos.coords.speed * 3.6 : 0; 
                 const heading = pos.coords.heading || 0;
                 const accuracy = pos.coords.accuracy;

                 fetch("/api/location/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                       busId: busData.id,
                       latitude: pos.coords.latitude,
                       longitude: pos.coords.longitude,
                       speed: geoSpeed,
                       heading,
                       accuracy
                    })
                 }).catch((err) => {
                    console.error("Failed to upload GPS location:", err);
                 });
              },
              (err) => {
                 console.warn("GPS lost or permissions denied, falling back to simulator.", err);
                 // Switch automatically to simulation mode
                 fetch(`/api/buses/${busData.id}/mode`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: "simulation" })
                 })
                 .then(res => {
                    if (res.ok) {
                       return res.json();
                    }
                 })
                 .then(data => {
                    if (data && data.state) {
                       setBusData((prev: any) => ({ ...prev, ...data.state }));
                    }
                 })
                 .catch(() => {});

                 toast.error("GPS SIGNAL LOST — FALLING BACK TO SIMULATION", {
                    style: { background: "#EF4444", color: "#FFFFFF" }
                 });
              },
              {
                 enableHighAccuracy: true,
                 maximumAge: 0,
                 timeout: 10000,
              }
           );
           
           return () => navigator.geolocation.clearWatch(geoId);
        }
     }
  }, [isMissionActive, busData?.id, trackingMode]);

  async function handleRecommendation(accept: boolean) {
    if (!recommendation) return;
    await fetch("/api/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: recommendation.recommendationId,
        status: accept ? "accepted" : "rejected",
        busId: busData?.id,
      }),
    });
    setRecommendation(null);
    toast.success(accept ? "Route updated — passengers notified." : "Keeping current route.");
  }

  const occupancyPercentage = busData ? Math.round((42 / (busData.capacity || 52)) * 100) : 0;
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [missionStartTime, setMissionStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");

  // Recover mission start time ONCE on mount or when bus transitions to active
  useEffect(() => {
    if (isMissionActive && busData?.id) {
      const savedStart = localStorage.getItem(`mission_start_${busData.id}`);
      if (savedStart) {
        setMissionStartTime(new Date(savedStart));
      } else if (busData.actualStartTime) {
        const actual = new Date(busData.actualStartTime);
        setMissionStartTime(actual);
        localStorage.setItem(`mission_start_${busData.id}`, actual.toISOString());
      } else {
        // Fallback for safety if mission is active but no start time recorded yet
        const now = new Date();
        setMissionStartTime(now);
        localStorage.setItem(`mission_start_${busData.id}`, now.toISOString());
      }
    } else {
      setMissionStartTime(null);
      setElapsedTime("00:00:00");
    }
  }, [isMissionActive, busData?.id, busData?.actualStartTime]);
  // Elapsed Time ticking from backend actualStartTime
  useEffect(() => {
    if (!isMissionActive || !busData?.actualStartTime) {
      setElapsedTime("00:00:00");
      return;
    }
    const updateElapsed = () => {
      const diff = Date.now() - new Date(busData.actualStartTime).getTime();
      if (diff <= 0) {
        setElapsedTime("00:00:00");
        return;
      }
      const hrs = Math.floor(diff / 3600000).toString().padStart(2, "0");
      const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
      setElapsedTime(`${hrs}:${mins}:${secs}`);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isMissionActive, busData?.actualStartTime]);

  // Centralized Sync via Pusher
  useEffect(() => {
    if (!busData?.id) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(CHANNELS.BUS_TRACKING);
    
    channel.bind(EVENTS.LOCATION_UPDATE, (update: any) => {
      if (update.busId === busData.id) {
        setBusData((prev: any) => ({ ...prev, ...update }));
        if (update.stops) setNextStops(update.stops);
      }
    });

    return () => {
      pusher.unsubscribe(CHANNELS.BUS_TRACKING);
    };
  }, [busData?.id]);

  async function toggleMission() {
    if (!busData?.id) {
      toast.error("Vehicle Identification Failure", {
        description: "No bus is assigned to your account. Please contact dispatch."
      });
      return;
    }
    const newStatus = isMissionActive ? "completed" : "active";
    
    try {
      let res;
      if (newStatus === "active") {
        // Use dedicated start API
        res = await fetch(`/api/buses/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ busId: busData.id }),
        });
      } else {
        // Stop mission via PATCH
        res = await fetch(`/api/buses/${busData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            status: "completed",
            actualStartTime: null 
          }),
        });
      }
      
      const fullUpdatedBus = await res.json();
      
      if (res.ok) {
        if (!fullUpdatedBus) throw new Error("Invalid bus response");
        
        console.log("BUS DATA UPDATED:", fullUpdatedBus);
        console.log("STOPS:", fullUpdatedBus?.route?.routeStops);
        
        setBusData(fullUpdatedBus);
        if (newStatus === "active") {
          const startTime = fullUpdatedBus.actualStartTime ? new Date(fullUpdatedBus.actualStartTime) : new Date();
          setMissionStartTime(startTime);
          localStorage.setItem(`mission_start_${busData.id}`, startTime.toISOString());
          toast.success("Mission Signal Active", {
            description: "GPS broadcasting. Passengers have been notified."
          });
          
          // Re-trigger simulator just in case
          fetch("/api/simulator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ busId: busData.id }),
          });
        } else {
          setMissionStartTime(null);
          localStorage.removeItem(`mission_start_${busData.id}`);
          toast.info("Mission Terminated", {
            description: "Vehicle status set to standby."
          });
        }
      } else {
        throw new Error(fullUpdatedBus?.error || "Mission transition failed");
      }
    } catch (err: any) {
      toast.error("Console Sync Failed", {
        description: err.message || "Please check your network connection."
      });
    }
  }




  async function submitIssue(e: React.FormEvent) {
    e.preventDefault();
    setIssueLoading(true);
    try {
      await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle,
          description: issueDesc,
          busId: busData?.id,
          priority: issuePriority,
        }),
      });
      toast.success("Issue reported — admin has been notified.");
      setIssueTitle("");
      setIssueDesc("");
      setIssuePriority("medium");
    } catch {
      toast.error("Failed to submit issue.");
    } finally {
      setIssueLoading(false);
    }
  }

  const initialBuses = (isMissionActive)
    ? [{
        busId: busData.id,
        busNumber: busData.number,
        routeId: busData.currentRouteId ?? "",
        routeColor: busData.route?.color ?? "#3B82F6",
        latitude: busData.location?.latitude ?? busData.route?.routeStops?.[0]?.stop?.latitude ?? 0,
        longitude: busData.location?.longitude ?? busData.route?.routeStops?.[0]?.stop?.longitude ?? 0,
        speed: speed > 0 ? speed : currentSpeed,
        heading: busData.location?.heading ?? 0,
        distanceCovered: busData.location?.distanceCovered ?? busData.distanceCovered ?? 0,
        totalRoadDistance: busData.route?.distance || 0,
        status: missionStatusState
      }]
    : [];

  const sortedStops = busData?.route?.routeStops
    ? [...busData.route.routeStops].sort((a: any, b: any) => a.stopOrder - b.stopOrder)
    : [];

  if (!busData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 p-4">
        {(assignedBuses?.length ?? 0) > 0 ? (
          <div className="w-full max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="text-center space-y-3">
                <h1 className="text-4xl font-black bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">Select Your Mission</h1>
                <p className="text-muted-foreground text-lg font-medium">You have {(assignedBuses?.length ?? 0)} active assignments.</p>
             </div>
             <div className="grid md:grid-cols-2 gap-6">
               {assignedBuses?.map(bus => {
                 const locked = (() => {
                   if (bus.status === "active" || !bus.scheduledStartTime) return false;
                   const now = new Date();
                   const currentTotal = now.getHours() * 60 + now.getMinutes();
                   const [h, m] = bus.scheduledStartTime instanceof Date 
                     ? [bus.scheduledStartTime.getHours(), bus.scheduledStartTime.getMinutes()]
                     : typeof bus.scheduledStartTime === 'string' && bus.scheduledStartTime.includes(':')
                       ? bus.scheduledStartTime.split(':').map(Number)
                       : [0, 0];
                   return currentTotal < (h * 60 + m);
                 })();
  
                 return (
                   <Card key={bus.id} onClick={() => handleSelectMission(bus)} className="cursor-pointer group hover:border-orange-500/50 transition-all hover:scale-[1.02] bg-card/80 backdrop-blur-xl shadow-lg hover:shadow-[0_0_30px_rgba(249,115,22,0.15)] overflow-hidden">
                      <CardHeader className="pb-3 border-b bg-muted/20">
                         <CardTitle className="flex justify-between items-center text-lg">
                            <span className="font-bold text-foreground truncate mr-3">{bus.route?.name || "Unassigned Route"}</span>
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 font-black tracking-widest shrink-0 px-3 py-1">
                               {bus.number}
                            </Badge>
                         </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-5 pb-5 space-y-4">
                         
                         {/* Time Row */}
                         <div className="flex items-center gap-2 bg-muted/40 p-3 rounded-xl border border-border/50">
                           <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                           <div className="flex-1 flex justify-between items-center text-sm font-semibold text-foreground/80">
                              <span>Start: {formatTime(bus.actualStartTime || bus.scheduledStartTime)}</span>
                              <span className="text-muted-foreground">|</span>
                              <span>End: {formatTime(bus.endTime)}</span>
                           </div>
                         </div>

                         {/* Status Row */}
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase font-black tracking-widest">Mission Status</span>
                            <span className={cn(
                              "text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider",
                              bus.status === "active" 
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                                : locked ? "bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700" : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            )}>
                              {bus.status === "active" ? "RUNNING" : locked ? "LOCKED" : "STANDBY"}
                            </span>
                         </div>
                      </CardContent>
                   </Card>
                 );
               })}
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 text-center">
             <div className="w-20 h-20 rounded-full bg-muted border border-border flex items-center justify-center shadow-sm">
               <BusIcon className="w-10 h-10 text-muted-foreground/50" />
             </div>
             <div>
               <h2 className="text-2xl font-black text-foreground mb-2">No Routes Assigned</h2>
               <p className="text-muted-foreground max-w-md">Your active profile doesn't have any bus routes scheduled at the moment.</p>
             </div>
             <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>Refresh Schedule</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 space-y-6 overflow-hidden">
      {/* ── Top Command Bar Overhaul ─────────────────────────── */}
      <div 
        className="flex items-center justify-between gap-6 border border-white/5 rounded-2xl px-7 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.3)] w-full max-w-full overflow-hidden transition-all duration-500"
        style={{ background: 'linear-gradient(135deg, #0F172A, #111827)' }}
      >
        <div className="flex items-center gap-5 flex-1 min-w-0">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 shrink-0">
            <BusIcon className="h-6 w-6 text-emerald-500" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#10B981] font-bold text-sm tracking-tight">Bus {busData ? busData.number : "Unknown"}</span>
              <span className="text-white/20">|</span>
              <span className="truncate text-white font-semibold text-lg tracking-tight">
                {busData?.route?.name || "Unassigned Route"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-[#9CA3AF]">
              <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-md border border-white/10">
                <Clock className="w-3 h-3 text-[#F97316]" />
                <span>Start: {formatTime(busData?.actualStartTime || busData?.scheduledStartTime)}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-md border border-white/10">
                <span>End: {formatTime(isMissionActive && busData?.estimatedEndTime ? busData.estimatedEndTime : busData?.endTime)}</span>
              </div>


            </div>
                
                {(assignedBuses?.length ?? 0) > 1 && (
                <div className="flex items-center gap-2">

                <select
                  className="bg-transparent text-emerald-500 font-bold outline-none cursor-pointer hover:text-emerald-400 transition-colors ml-2"
                  value={busData?.id || ""}
                  onChange={(e) => {
                    const selected = assignedBuses.find(b => b.id === e.target.value);
                    if (selected) handleSelectMission(selected);
                  }}
                >
                  {assignedBuses.map(b => (
                    <option key={b.id} value={b.id} className="bg-[#0F172A] text-white">Switch to {b.number}</option>
                  ))}
                </select>
                  </div>
                )}
          </div>
        </div>

          {isMissionActive && (
            <div className="hidden md:flex items-center gap-8">
            {/* Speed */}
            <div className="text-center px-6">
              <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mb-1">Speed</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums text-white leading-none">{speed > 0 ? speed : currentSpeed}</span>
                <span className="text-[10px] font-bold text-[#9CA3AF]">KM/H</span>
              </div>
            </div>
            


            {/* Progress */}
            <div className="text-center px-6 border-l border-[#1F2937]">
              <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mb-1">Progress</p>
              <div className="flex items-center gap-3">
                <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${completionPercentage}%` }} 
                  />
                </div>
                <span className="text-xs font-bold text-white tabular-nums">{completionPercentage}%</span>
              </div>
            </div>
            

            
            <div className="text-center px-6 border-l border-[#1F2937]">
               <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mb-1">Next Stop</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-xl font-bold tabular-nums text-[#FFFFFF] leading-none">
                    {(() => {
                      if (!isMissionActive) return '--';
                      const upcoming = nextStops.find(s => !s.isPassed);
                      if (!upcoming) return 'FINISH';
                      return formatTime(upcoming.liveArrivalTime);
                    })()}
                  </span>
                </div>
            </div>


          </div>
        )}
          
          {isMissionActive && (
            <div className="flex items-center gap-6 pr-6 border-r border-[#1F2937]">
              <div className="text-right">
                <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mb-0.5">Status</p>
                <Badge className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded-full border-none",
                  busData?.delayMinutes > 5 ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-emerald-500/10 text-emerald-500'
                )}>
                  {busData?.delayMinutes > 5 ? 'DELAY' : 'ON TIME'}
                </Badge>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mb-0.5">Elapsed</p>
                <div className="text-xl font-bold tabular-nums text-[#F97316] tracking-tight">
                  {elapsedTime}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center">
            {isMissionActive ? (
               <div className="flex items-center gap-3">
                {trackingMode === "live" ? (
                   <div className="flex items-center gap-2 px-4 py-2 bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 rounded-full shrink-0 select-none shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">🟢 LIVE GPS</span>
                   </div>
                ) : (
                   <div className="flex items-center gap-2 px-4 py-2 bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30 rounded-full shrink-0 select-none shadow-[0_0_15px_rgba(249,115,22,0.25)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#F97316] animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">🟠 SIMULATION</span>
                   </div>
                )}

                <Button 
                  onClick={toggleMission}
                  className="h-11 px-6 rounded-full text-white font-bold text-[11px] uppercase tracking-widest transition-all duration-300 hover:scale-[1.03] active:scale-95 shadow-lg border-none"
                  style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}
                >
                  End Mission
                </Button>
               </div>
            ) : isCompleted ? (
                <div className="px-8 py-4 rounded-2xl bg-slate-500/10 border border-slate-500/30 text-slate-500 font-black text-xs uppercase tracking-widest">
                  Mission Completed
                </div>
            ) : isAssigned ? (
              <Button 
                onClick={toggleMission}
                className="h-12 px-10 rounded-full text-white font-bold text-sm uppercase tracking-widest transition-all duration-300 hover:scale-[1.03] active:scale-95 shadow-xl border-none"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                Start Mission
              </Button>
            ) : (
              <div className="px-6 py-3 rounded-2xl bg-muted border border-border text-muted-foreground font-black text-xs uppercase tracking-widest">
                No Mission Assigned
              </div>
            )}
            {isLockedByTime && (
              <span className="text-[10px] mt-2 font-bold text-amber-500 uppercase tracking-wider">
                Scheduled for {formatTime(busData?.scheduledStartTime)}
              </span>
            )}
          </div>

      </div>

      {/* ── Main Content Grid ─────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Navigation & Active Alerts (8/12) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Active Navigation Card */}
          <Card className="overflow-hidden border-white/10 bg-black/40 backdrop-blur-3xl shadow-2xl relative group">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button 
                onClick={() => setShowFullRoute(!showFullRoute)}
                className={cn(
                  "backdrop-blur-md border rounded-lg px-3 py-2 text-xs font-black transition-all shadow-xl flex items-center gap-2",
                  showFullRoute 
                    ? "bg-orange-500 border-orange-400 text-white" 
                    : "bg-background/80 border-border text-foreground hover:bg-muted"
                )}
              >
                <MapPin className={cn("h-3.5 w-3.5", showFullRoute ? "text-white" : "text-emerald-400")} />
                {showFullRoute ? "SHOWING FULL ROUTE" : (nextStops[0]?.name || "Tracking...")}
              </button>
            </div>

            <div className="h-[calc(100vh-350px)] min-h-[500px]">
              <TrackingMap
                routes={busData?.route ? [busData.route as any] : []}
                initialBuses={initialBuses}
                selectedBusId={busData?.id}
                fitToRoute={showFullRoute}
                trackingMode={trackingMode}
                onTrackingModeChange={async (mode) => {
                   if (mode === "live") {
                      if (!navigator.geolocation) {
                         toast.error("GPS NOT SUPPORTED ON THIS DEVICE");
                         return;
                      }
                      navigator.geolocation.getCurrentPosition(
                         async (pos) => {
                            // Permission granted! Switch trackingMode to "live"
                            try {
                               const res = await fetch(`/api/buses/${busData.id}/mode`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ mode: "live" }),
                               });
                               if (res.ok) {
                                  const data = await res.json();
                                  if (data.success && data.state) {
                                     setBusData((prev: any) => ({ ...prev, ...data.state }));
                                     if (data.state.stops) setNextStops(data.state.stops);
                                  }
                                  toast.success("LIVE GPS TRACKING ENABLED", {
                                     style: { background: "#10B981", color: "#FFFFFF" }
                                  });
                               } else {
                                  throw new Error("Failed to change tracking mode to live");
                               }
                            } catch (err: any) {
                               toast.error("Failed to switch tracking mode", { description: err.message });
                            }
                         },
                         async (err) => {
                            if (err.code === err.PERMISSION_DENIED) {
                               toast.error("LOCATION ACCESS DENIED — USING SIMULATION", {
                                  style: { background: "#EF4444", color: "#FFFFFF" }
                               });
                            } else {
                               // For TIMEOUT or POSITION_UNAVAILABLE, permission is granted but position lock is slow.
                               // Still allow switching to live tracking!
                               try {
                                  const res = await fetch(`/api/buses/${busData.id}/mode`, {
                                     method: "POST",
                                     headers: { "Content-Type": "application/json" },
                                     body: JSON.stringify({ mode: "live" }),
                                  });
                                  if (res.ok) {
                                     const data = await res.json();
                                     if (data.success && data.state) {
                                        setBusData((prev: any) => ({ ...prev, ...data.state }));
                                        if (data.state.stops) setNextStops(data.state.stops);
                                     }
                                     toast.success("LIVE GPS TRACKING ENABLED", {
                                        style: { background: "#10B981", color: "#FFFFFF" }
                                     });
                                  }
                               } catch (e) {
                                  console.error(e);
                               }
                            }
                         },
                         { enableHighAccuracy: false, timeout: 5000, maximumAge: Infinity }
                      );
                   } else {
                      // Switch back to simulation mode
                      try {
                         const res = await fetch(`/api/buses/${busData.id}/mode`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ mode: "simulation" }),
                         });
                         if (res.ok) {
                            const data = await res.json();
                            if (data.success && data.state) {
                               setBusData((prev: any) => ({ ...prev, ...data.state }));
                               if (data.state.stops) setNextStops(data.state.stops);
                            }
                            toast.success("Tracking mode set to SIMULATION");
                         } else {
                            throw new Error("Failed to change tracking mode to simulation");
                         }
                      } catch (err: any) {
                         toast.error("Failed to switch tracking mode", { description: err.message });
                      }
                   }
                }}
              />
            </div>

            {/* AI Recommendation Overlay */}
            {recommendation && (
              <div className="absolute inset-x-4 bottom-4 z-20 bg-emerald-500/90 backdrop-blur-2xl border border-emerald-400/50 rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-5">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 shrink-0">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="text-white font-black uppercase tracking-widest text-sm mb-1">AI Optimization Recommended</h4>
                      <p className="text-white/90 text-sm font-medium leading-snug max-w-lg">
                        {recommendation.reason} Take detour to save <span className="underline decoration-2 underline-offset-4">{formatMinutes(recommendation.timeSavedMinutes)}</span>.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="bg-white/10 border-white/30 text-white hover:bg-white/20 h-11 px-6 uppercase font-black text-xs tracking-widest"
                      onClick={() => handleRecommendation(false)}
                    >
                      Decline
                    </Button>
                    <Button 
                      className="bg-orange-500 hover:bg-orange-600 text-white h-11 px-8 uppercase font-black text-xs tracking-widest shadow-xl border-none"
                      onClick={() => handleRecommendation(true)}
                    >
                      Accept New Route
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Bus Stats Cards for Mobile/Tablet */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:hidden">
            {[
              { label: "Current Speed", value: `${speed} KM/H`, icon: Gauge, color: "text-orange-400" },
              { label: "Occupancy", value: "42/52", icon: Users, color: "text-emerald-400" },
              { label: "Next Stop", value: isMissionActive ? (nextStops.find(s => !(s as any).isPassed)?.name || "...") : (nextStops[0]?.name || "..."), icon: MapPin, color: "text-primary" },
              { label: "Fuel Level", value: "84%", icon: Activity, color: "text-amber-400" },
            ].map((stat) => (
              <div key={stat.label} className={cn("premium-card p-4 transition-all duration-500", !isMissionActive && (stat.label === "Current Speed" || stat.label === "Next Stop") ? "opacity-40 grayscale" : "opacity-100")}>
                <stat.icon className={`h-4 w-4 ${stat.color} mb-2`} />
                <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">{stat.label}</p>
                <p className="text-lg font-black">{!isMissionActive && stat.label === "Current Speed" ? "0 KM/H" : stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Operations Sidebar (4/12) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Upcoming Stops Timeline */}
          <Card className="flex flex-col h-[400px] border-white/5 shadow-2xl overflow-hidden" style={{ background: '#0F172A' }}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-white/5">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-white/50">Upcoming Timeline</CardTitle>
              <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/5 font-bold">{(nextStops?.length ?? 0)} STOPS</Badge>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden relative">
              <ScrollArea className="h-full px-6 pb-6 pt-4">
                <div className="relative pt-2">
                  <div className="absolute left-[15px] top-4 bottom-4 w-px bg-white/10" />
                  
                  <div className="space-y-6">
                    {(nextStops?.length ?? 0) > 0 ? (nextStops || []).map((stop, i) => {
                      const isArrived = stop.status === "arrived" || stop.status === "start" || stop.isPassed;
                      const isNextTarget = !isArrived && (i === 0 || nextStops[i-1]?.isPassed || nextStops[i-1]?.status === "arrived");
                      const isStart = i === 0 || stop.status === "start";
                      const isFinal = i === nextStops.length - 1 || stop.status === "final";
                      
                      return (
                        <div key={stop.stopId || i} className="flex gap-4">
                          {/* Left: Connector & Circle */}
                          <div className="relative flex flex-col items-center shrink-0">
                            <div className={cn(
                              "w-8 h-8 rounded-full border-4 border-[#0F172A] z-10 flex items-center justify-center",
                              isStart ? "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : 
                              isArrived ? "bg-emerald-500" : "bg-slate-700"
                            )}>
                              {isArrived && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                          </div>

                          {/* Right: Stop Card */}
                          <div className={cn(
                            "flex-1 p-4 rounded-xl border transition-all duration-500",
                            isArrived ? "bg-emerald-500/5 border-emerald-500/20" : isNextTarget ? "bg-orange-500/5 border-orange-500/20" : "bg-white/5 border-white/5"
                          )}>
                             <div className="flex justify-between items-start mb-2">
                                <h4 className={cn(
                                  "text-sm font-bold tracking-tight",
                                  isArrived ? "text-emerald-400/60" : isStart ? "text-orange-400" : "text-white"
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
                                   <span className={cn(isArrived ? "text-emerald-500/60" : "text-blue-400")}>
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
                    }) : (
                      <div className="text-center py-20">
                        <MapPin className="h-8 w-8 mx-auto mb-3 text-white/10" />
                        <p className="text-xs font-black text-white/30 tracking-widest uppercase">No Live Data</p>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Quick Controls & Reporting */}
          <Tabs defaultValue="report" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="report" className="text-[10px] font-black uppercase tracking-widest gap-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Report Issue
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-[10px] font-black uppercase tracking-widest gap-2">
                <TrendingUp className="h-3.5 w-3.5" /> Stats
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="report">
              <Card className="border-white/5" style={{ background: '#111827' }}>
                <CardContent className="pt-6">
                  <form onSubmit={submitIssue} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="issue-title" className="text-xs font-medium uppercase tracking-wider" style={{ color: '#E5E7EB' }}>Quick Report Title</Label>
                      <Input
                        id="issue-title"
                        placeholder="e.g. Traffic Congestion"
                        value={issueTitle}
                        onChange={(e) => setIssueTitle(e.target.value)}
                        required
                        className="bg-[#1F2937] text-[#FFFFFF] placeholder:text-[#9CA3AF] border-[#374151] focus:border-[#F97316] focus:ring-0 h-10 text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#E5E7EB' }}>Severity</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {(["low", "medium", "high", "critical"] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setIssuePriority(p)}
                            className={cn(
                              "h-9 rounded border text-[10px] font-bold uppercase tracking-widest transition-all",
                              issuePriority === p
                                ? "bg-[#F97316] text-[#FFFFFF] border-none font-semibold shadow-lg shadow-[#F97316]/20"
                                : "bg-[#1F2937] text-[#D1D5DB] border-[#374151] hover:bg-[#374151]"
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="issue-desc" className="text-xs font-medium uppercase tracking-wider" style={{ color: '#E5E7EB' }}>Details</Label>
                      <Textarea
                        id="issue-desc"
                        rows={3}
                        placeholder="Briefly explain..."
                        value={issueDesc}
                        onChange={(e) => setIssueDesc(e.target.value)}
                        required
                        className="bg-[#1F2937] text-[#FFFFFF] placeholder:text-[#9CA3AF] border-[#374151] focus:border-[#F97316] focus:ring-0 text-sm font-medium resize-none shadow-inner"
                      />
                    </div>
                    <Button type="submit" disabled={issueLoading} className="w-full bg-[#F43F5E] hover:bg-[#E11D48] text-[#FFFFFF] font-bold uppercase tracking-[0.2em] h-12 rounded-[8px] shadow-lg shadow-[#F43F5E]/20">
                      {issueLoading ? "Submitting..." : "Send Report"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics">
              <Card>
                <CardContent className="pt-6 space-y-6">
                   <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Route Completion</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-black text-white">12/18</span>
                      <span className="text-xs font-bold text-emerald-400">67% PROGRESS</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[67%]" />
                    </div>
                  </div>
                  
                  <div className="divider h-px bg-white/5" />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Stops Logged</p>
                      <p className="text-xl font-black text-white">142</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Eco Score</p>
                      <p className="text-xl font-black text-emerald-400">92/100</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
        </div>
      </div>
    </div>
  );
}
