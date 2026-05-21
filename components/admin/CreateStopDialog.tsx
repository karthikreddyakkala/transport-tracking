"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function CreateStopForm({ onSuccess, onCancel }: { onSuccess?: () => void, onCancel?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", latitude: "", longitude: "", address: "" });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Latitude and Longitude must be valid numbers.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, code: form.code || null, latitude: lat, longitude: lng, address: form.address || null }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Stop "${form.name}" created.`);
      setForm({ name: "", code: "", latitude: "", longitude: "", address: "" });
      router.refresh();
      onSuccess?.();
    } catch {
      toast.error("Failed to create stop.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-1">
        <Label>Stop Name *</Label>
        <Input placeholder="e.g. MG Road Bus Stop" value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Stop Code</Label>
        <Input placeholder="e.g. MGR-01" value={form.code} onChange={(e) => set("code", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Latitude *</Label>
          <Input type="number" step="any" placeholder="12.9716" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Longitude *</Label>
          <Input type="number" step="any" placeholder="77.5946" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Address</Label>
        <Input placeholder="Street address" value={form.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Create Stop
        </Button>
      </div>
    </form>
  );
}

export default function CreateStopDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> Add Stop</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Bus Stop</DialogTitle>
        </DialogHeader>
        <CreateStopForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
