"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Bus, Route, MapPin } from "lucide-react";

import { CreateBusForm } from "./CreateBusDialog";
import { CreateRouteForm } from "./CreateRouteDialog";
import { CreateStopForm } from "./CreateStopDialog";

export default function QuickAddWizard() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("bus");

  // Keep it simple and render forms safely inside TabsContent
  // Each form triggers setOpen(false) on success or cancel.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
          <Plus className="h-4 w-4" /> Add Asset
        </Button>
      </DialogTrigger>
      
      {/* Route requires max-w-3xl for the map/split view. So we dynamically adjust container width. */}
      <DialogContent 
        className={`transition-all duration-300 ease-in-out border-border bg-background ${
          activeTab === "route" ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <DialogHeader className="mb-2">
          <DialogTitle>Quick System Configuration</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="bus" className="flex gap-2">
              <Bus className="h-4 w-4" /> Add Bus
            </TabsTrigger>
            <TabsTrigger value="route" className="flex gap-2">
              <Route className="h-4 w-4" /> Add Route
            </TabsTrigger>
            <TabsTrigger value="stop" className="flex gap-2">
              <MapPin className="h-4 w-4" /> Add Stop
            </TabsTrigger>
          </TabsList>
          
          {/* Prevent forms from fully unmounting to preserve some state or let them refresh */}
          <div className="mt-2 h-full min-h-[400px]">
            <TabsContent value="bus" className="mt-0 h-full">
              {open && activeTab === "bus" && <CreateBusForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />}
            </TabsContent>
            <TabsContent value="route" className="mt-0 h-full">
              {open && activeTab === "route" && <CreateRouteForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />}
            </TabsContent>
            <TabsContent value="stop" className="mt-0 h-full">
              {open && activeTab === "stop" && <CreateStopForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
