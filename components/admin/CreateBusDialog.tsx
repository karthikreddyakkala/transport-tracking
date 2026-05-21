"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Route { id: string; number: string; name: string }
interface Driver { id: string; name: string }

export function CreateBusForm({ onSuccess, onCancel }: { onSuccess?: () => void, onCancel?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [form, setForm] = useState({
    name: "", number: "", registrationNumber: "", capacity: "40", busType: "Non-AC",
    currentRouteId: "", driverId: "", manualDriverName: "", status: "active",
  });
  const [driverMode, setDriverMode] = useState<"select" | "manual">("select");

  useEffect(() => {
    Promise.all([
      fetch("/api/routes").then((r) => r.json()),
      fetch("/api/users?role=driver").then((r) => r.json()).catch(() => []),
    ]).then(([r, d]) => {
      setRoutes(Array.isArray(r) ? r : []);
      setDrivers(Array.isArray(d) ? d : []);
    });
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        number: form.number,
        capacity: parseInt(form.capacity) || 40,
        busType: form.busType,
        status: form.status,
      };
      if (form.registrationNumber) payload.registrationNumber = form.registrationNumber;
      if (form.currentRouteId && form.currentRouteId !== "none") payload.currentRouteId = form.currentRouteId;
      
      if (driverMode === "select" && form.driverId && form.driverId !== "none") {
        payload.driverId = form.driverId;
      } else if (driverMode === "manual" && form.manualDriverName) {
        payload.manualDriverName = form.manualDriverName;
      }

      const res = await fetch("/api/buses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      toast.success(`Bus ${form.number} created.`);
      setForm({ name: "", number: "", registrationNumber: "", capacity: "40", busType: "Non-AC", currentRouteId: "", driverId: "", manualDriverName: "", status: "active" });
      router.refresh();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create bus.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Bus Name</Label>
          <Input placeholder="e.g. Morning Star" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Bus Number *</Label>
          <Input placeholder="e.g. KA-01-F-1234" value={form.number} onChange={(e) => set("number", e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Bus Type</Label>
          <Select value={form.busType} onValueChange={(v) => set("busType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Non-AC">Non-AC</SelectItem>
              <SelectItem value="AC">AC</SelectItem>
              <SelectItem value="Sleeper">Sleeper</SelectItem>
              <SelectItem value="Premium AC">Premium AC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Capacity</Label>
          <Input type="number" placeholder="40" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Assign Route (Optional)</Label>
        <Select value={form.currentRouteId} onValueChange={(v) => set("currentRouteId", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a route..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Route Assigned</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                Route {r.number} — {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Assign Driver</Label>
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-teal-400" onClick={() => setDriverMode(driverMode === "select" ? "manual" : "select")}>
            {driverMode === "select" ? "+ Add custom name manually" : "Select existing account"}
          </Button>
        </div>
        
        {driverMode === "select" ? (
          <Select value={form.driverId} onValueChange={(v) => set("driverId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a driver account..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Driver Assigned</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input placeholder="Enter driver name manually (e.g. John Doe)" value={form.manualDriverName} onChange={(e) => set("manualDriverName", e.target.value)} />
        )}
      </div>

      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Create Bus
        </Button>
      </div>
    </form>
  );
}

export default function CreateBusDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> Add Bus</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Bus</DialogTitle>
        </DialogHeader>
        {open && <CreateBusForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
