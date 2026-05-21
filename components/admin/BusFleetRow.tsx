"use client";

import { useState, useEffect } from "react";
import { getPusherClient, CHANNELS, EVENTS } from "@/lib/pusher";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import EditBusDialog from "@/components/admin/EditBusDialog";
import { BusDetailsSheet } from "./BusDetailsSheet";

interface BusFleetRowProps {
  bus: any;
  activeRoutes: any[];
}

export default function BusFleetRow({ bus, activeRoutes }: BusFleetRowProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const [currentStatus, setCurrentStatus] = useState(bus.status);
  const [currentSpeed, setCurrentSpeed] = useState(bus.location?.speed || 0);

  // Listen for real-time updates
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(CHANNELS.BUS_TRACKING);
    channel.bind(EVENTS.LOCATION_UPDATE, (data: any) => {
      if (data.busId === bus.id) {
        if (data.status === "deleted") {
          setIsDeleted(true);
        } else {
          setCurrentStatus(data.status || bus.status);
          setCurrentSpeed(data.speed !== undefined ? data.speed : currentSpeed);
        }
      }
    });
    return () => {
      pusher.unsubscribe(CHANNELS.BUS_TRACKING);
    };
  }, [bus.id]);

  if (isDeleted) return null;

  return (
    <>
      <TableRow 
        key={bus.id} 
        className="cursor-pointer hover:bg-muted transition-colors"
        onClick={() => setSheetOpen(true)}
      >
        <TableCell>
          <div className="bg-muted border-border px-2.5 py-1 border border-l-2 border-l-emerald-500 rounded-md text-xs font-bold tracking-wider text-foreground w-fit">
            {bus.number}
          </div>
        </TableCell>
        <TableCell>
          {bus.route ? (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: bus.route.color }} />
              <span className="text-sm text-foreground">{bus.route.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Unassigned</span>
          )}
        </TableCell>
        <TableCell className="text-sm text-foreground">
          {bus.driver?.name || bus.manualDriverName || <span className="text-muted-foreground">None</span>}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={
                currentStatus === "active" || currentStatus === "moving" || currentStatus === "boarding"
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                  : currentStatus === "maintenance"
                  ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                  : currentStatus === "assigned"
                  ? "border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
                  : currentStatus === "completed"
                  ? "border-slate-500/30 text-slate-600 dark:text-slate-400 bg-slate-500/10"
                  : "border-muted-foreground/30 text-muted-foreground bg-muted/50"
            }
          >
            {currentStatus}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm tabular-nums">
          {currentSpeed > 0 ? `${Math.round(currentSpeed)} km/h` : currentStatus === "boarding" ? "0 km/h (Boarding)" : "—"}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <EditBusDialog
            bus={{
              id: bus.id,
              number: bus.number,
              status: bus.status,
              currentRouteId: bus.currentRouteId ?? null,
              manualDriverName: bus.manualDriverName ?? null,
              driver: bus.driver ?? null,
              capacity: bus.capacity,
              busType: bus.busType ?? "Non-AC",
              scheduledStartTime: bus.scheduledStartTime ?? null,
              endTime: bus.endTime ?? null,
            }}
            routes={activeRoutes.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
          />
        </TableCell>
      </TableRow>

      <BusDetailsSheet
        busId={bus.id}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
