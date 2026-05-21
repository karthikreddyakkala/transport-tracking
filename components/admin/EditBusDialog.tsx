"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Route { id: string; name: string; color: string; }

interface Bus {
  id: string;
  number: string;
  status: string;
  currentRouteId: string | null;
  manualDriverName: string | null;
  driver?: { id: string; name: string } | null;
  capacity: number;
  busType: string | null;
  scheduledStartTime: string | null;
  endTime: string | null;
}

interface Props {
  bus: Bus;
  routes: Route[];
}

const STATUS_OPTIONS = ["active", "inactive", "maintenance", "assigned", "completed"] as const;
const TYPE_OPTIONS   = ["AC", "Non-AC"] as const;

export default function EditBusDialog({ bus, routes }: Props) {
  const router = useRouter();
  const [open, setOpen]           = useState(false);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [status, setStatus]       = useState(bus.status);
  const [routeId, setRouteId]     = useState(bus.currentRouteId ?? "");
  const [driver, setDriver]       = useState(bus.manualDriverName ?? bus.driver?.name ?? "");
  const [capacity, setCapacity]   = useState(bus.capacity ?? 40);
  const [busType, setBusType]     = useState(bus.busType ?? "Non-AC");
  const [startTime, setStartTime] = useState(bus.scheduledStartTime ? (() => {
     const d = new Date(bus.scheduledStartTime);
     return isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })() : "");
  const [endTime, setEndTime]     = useState(bus.endTime ? (() => {
     const d = new Date(bus.endTime);
     return isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })() : "");

  useEffect(() => {
    if (open) {
      fetch(`/api/buses/${bus.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data) {
             setStatus(data.status || bus.status);
             setRouteId(data.currentRouteId || "");
             setCapacity(data.capacity ?? 40);
             setBusType(data.busType ?? "Non-AC");
             
             // Prefill driver input with manualDriverName or the database-assigned driver's name
             const driverName = data.manualDriverName || data.driver?.name || "";
             setDriver(driverName);

             if (data.scheduledStartTime) {
                const d = new Date(data.scheduledStartTime);
                setStartTime(isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
             }
             if (data.endTime) {
                const d = new Date(data.endTime);
                setEndTime(isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
             }
          }
        })
        .catch((err) => {
          console.error("Failed to fetch latest bus info:", err);
        });
    }
  }, [open, bus.id, bus.status]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/buses/${bus.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          currentRouteId: routeId || null,
          manualDriverName: driver || null,
          capacity,
          busType,
          scheduledStartTime: startTime ? (() => {
             const [h, m] = startTime.split(":").map(Number);
             const d = new Date();
             d.setHours(h, m, 0, 0);
             return d;
          })() : null,
          endTime: endTime ? (() => {
             const [h, m] = endTime.split(":").map(Number);
             const d = new Date();
             d.setHours(h, m, 0, 0);
             return d;
          })() : null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Bus ${bus.number} updated.`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to update bus.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete bus ${bus.number} and completely wipe its attached routes and stops from the database? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/buses/${bus.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Bus ${bus.number} deleted.`);
      setOpen(false);
      // Hard refresh to ensure server component re-fetches everything
      window.location.reload();
    } catch {
      toast.error("Failed to delete bus.");
    } finally {
      setDeleting(false);
    }
  }



  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 transition-colors"
          style={{ cursor: "pointer" }}
          title={`Edit Bus ${bus.number}`}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Edit Bus{" "}
            <span
              className="ml-1 px-2 py-0.5 rounded text-sm font-bold bg-muted border border-border text-emerald-600 dark:text-emerald-400"
            >
              {bus.number}
            </span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Change route, status, driver and type
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Status */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((s) => {
                const colors: Record<string, { bg: string; border: string; text: string }> = {
                  active:      { bg: "bg-emerald-500/10",  border: "border-emerald-500/30",  text: "text-emerald-600 dark:text-emerald-400" },
                  inactive:    { bg: "bg-muted",            border: "border-border",          text: "text-muted-foreground" },
                  maintenance: { bg: "bg-amber-500/10",    border: "border-amber-500/30",    text: "text-amber-600 dark:text-amber-400" },
                  assigned:    { bg: "bg-indigo-500/10",   border: "border-indigo-500/30",   text: "text-indigo-600 dark:text-indigo-400" },
                  completed:   { bg: "bg-slate-500/10",    border: "border-slate-500/30",    text: "text-slate-600 dark:text-slate-400" },
                };
                const c = colors[s];
                const sel = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`py-2 rounded-lg text-xs font-bold capitalize transition-all border ${sel ? `${c.bg} ${c.border} ${c.text}` : "bg-muted/50 border-border text-muted-foreground"}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Route */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Assigned Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="">— Unassigned —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id} className="bg-popover text-foreground">
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Driver name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Driver Name</label>
            <input
              type="text"
              placeholder="e.g. Ravi Kumar"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Bus type */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Bus Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setBusType(t)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all border ${busType === t ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400" : "bg-muted/50 border-border text-muted-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Capacity (seats)</label>
            <input
              type="number"
              min={10}
              max={80}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t mt-2 border-border">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all text-rose-500 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Bus
          </button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-md"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
