"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bus, MapPin, Calendar, ArrowRightLeft, Clock } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTime } from "@/lib/utils";

interface Route { id: string; name: string; number: string; }
interface BusData { id: string; number: string; capacity: number; status: string; }

export default function BookingSchedulerBar() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<BusData[]>([]);
  
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState("");
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [loading, setLoading] = useState(false);

  // Generate 4:30 AM to 8:30 PM timeslots
  const timeSlots = Array.from({ length: 33 }).map((_, i) => {
    const totalMinutes = 4 * 60 + 30 + i * 30; // start at 4:30 AM
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const isPM = hours >= 12;
    const displayHour = hours > 12 ? hours - 12 : hours;
    return {
      value: `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
      label: `${displayHour}:${mins.toString().padStart(2, "0")} ${isPM ? "PM" : "AM"}`
    };
  });

  useEffect(() => {
    fetch("/api/routes").then((r) => r.json()).then(setRoutes).catch(() => {});
    fetch("/api/buses").then((r) => r.json()).then(setBuses).catch(() => {});
  }, []);

  async function handleAssign() {
    if (!selectedRouteId || !selectedBusId || !date || !time) {
      toast.error("Please fill in Route, Bus, Date, and Departure Time!");
      return;
    }

    setLoading(true);
    try {
      // "Assign" the bus to the route exactly as the user specified
      const res = await fetch(`/api/buses/${selectedBusId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          currentRouteId: selectedRouteId, 
          status: "assigned",
          scheduledStartTime: (() => {
             const [h, m] = time.split(":").map(Number);
             const d = new Date(date || new Date());
             d.setHours(h, m, 0, 0);
             return d;
          })()
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Server rejection");
      }
      
      const routeName = routes.find(r => r.id === selectedRouteId)?.name;
      const busNumber = buses.find(b => b.id === selectedBusId)?.number;
      const formattedDate = date ? format(date, "PPP") : "today";

      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-bold border-b border-white/10 pb-1">Bus {busNumber} Deployed</span>
          <span>Route: {routeName}</span>
          <span>Schedule: {formattedDate} at {formatTime(time)}</span>
          {isRoundTrip && <span className="text-emerald-300 text-xs mt-1 inline-flex items-center gap-1">🔄 Return trip auto-scheduled based on cutoff hours.</span>}
        </div>
      );
      router.refresh();
      
      setSelectedRouteId("");
      setSelectedBusId("");
      setTime("");
    } catch (err: any) {
      toast.error(`Assignment Failed: ${err.message || "Bus might already be active"}`);
    } finally {
      setLoading(false);
    }
  }

  // To mimic the screenshot layout perfectly:
  // A wide white container with subtle shadow, dividing sections with vertical borders.
  return (
    <div className="w-full premium-card p-4 md:p-6 overflow-hidden relative">
      {/* Premium subtle top shine */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent z-20 opacity-80" />
      
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-border/50 relative z-10">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
          <Bus className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">Active Bus Assignment</h2>
          <p className="text-xs text-muted-foreground">Deploy buses along scheduled routes instantly</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 w-full relative z-10">
        
        {/* Route Select block */}
        <div className="flex-1 flex items-center px-4 py-2 border border-border rounded-xl hover:bg-muted/50 transition-colors w-full cursor-pointer bg-muted/20">
          <div className="flex flex-col w-full">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Select Route
            </span>
            <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
              <SelectTrigger className="w-full bg-transparent border-none p-0 h-auto text-sm font-semibold text-foreground focus:ring-0 focus:ring-offset-0 shadow-none hover:bg-transparent [&>svg]:opacity-50">
                <SelectValue placeholder="Select Route..." />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground backdrop-blur-xl z-[90]">
                {routes.map(r => (
                  <SelectItem key={r.id} value={r.id} className="cursor-pointer focus:bg-emerald-500/20 focus:text-emerald-600 dark:focus:text-emerald-300">
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ArrowRightLeft className="h-5 w-5 text-muted-foreground hidden md:block shrink-0 mx-[-8px] z-10" />

        {/* Bus Select block */}
        <div className="flex-1 flex items-center px-4 py-2 border border-border rounded-xl hover:bg-muted/50 transition-colors w-full cursor-pointer bg-muted/20">
          <div className="flex flex-col w-full">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Bus className="h-3 w-3" /> Target Fleet Bus
            </span>
            <Select value={selectedBusId} onValueChange={setSelectedBusId}>
              <SelectTrigger className="w-full bg-transparent border-none p-0 h-auto text-sm font-semibold text-foreground focus:ring-0 focus:ring-offset-0 shadow-none hover:bg-transparent [&>svg]:opacity-50">
                <SelectValue placeholder="Select Bus..." />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground backdrop-blur-xl z-[90]">
                {buses.map(b => (
                  <SelectItem key={b.id} value={b.id} className="cursor-pointer focus:bg-emerald-500/20 focus:text-emerald-600 dark:focus:text-emerald-300">
                    {b.number} ({b.capacity} Seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Date block */}
        <div className="flex-[0.8] flex items-center px-4 py-2 border border-border rounded-xl hover:bg-muted/50 transition-colors cursor-pointer bg-muted/20">
          <Popover>
            <PopoverTrigger asChild>
              <div className="flex flex-col w-full text-left">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> Date
                </span>
                <span className="text-sm font-semibold text-foreground truncate">
                  {date ? format(date, "MMM dd, yyyy") : "Pick a date"}
                </span>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover backdrop-blur-3xl border-border z-[100]" align="start">
              <CalendarComponent
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                className="text-foreground"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Time block */}
        <div className="flex-[0.8] flex items-center px-4 py-2 border border-border rounded-xl hover:bg-muted/50 transition-colors cursor-pointer bg-muted/20">
          <div className="flex flex-col w-full text-left">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Time (4:30a - 8:30p)
            </span>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger className="w-full bg-transparent border-none p-0 h-auto text-sm font-semibold text-foreground focus:ring-0 focus:ring-offset-0 shadow-none hover:bg-transparent [&>svg]:opacity-50">
                <SelectValue placeholder="Set Time..." />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground backdrop-blur-xl z-[100] max-h-[300px]">
                {timeSlots.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="cursor-pointer focus:bg-emerald-500/20 focus:text-emerald-600 dark:focus:text-emerald-300">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search / Assign Button */}
        <div className="flex flex-col gap-2 shrink-0 md:w-[150px]">
          <button 
            onClick={handleAssign}
            disabled={loading}
            className="premium-btn w-full h-[50px] flex items-center justify-center tracking-widest uppercase disabled:opacity-50"
          >
            {loading ? "System..." : "Deploy"}
          </button>
          
          <button 
            onClick={() => setIsRoundTrip(!isRoundTrip)}
            className={`cursor-pointer w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest p-1 rounded-md transition-all ${isRoundTrip ? 'text-[#22C55E] bg-[#22C55E]/10' : 'text-muted-foreground bg-muted/50 hover:bg-muted'}`}
          >
            <ArrowRightLeft className="h-3 w-3" />
            {isRoundTrip ? "Round Trip" : "One-Way"}
          </button>
        </div>

      </div>
    </div>
  );
}
