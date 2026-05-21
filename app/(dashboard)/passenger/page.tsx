import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buses, routes as routesTable, favoriteRoutes, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { calculateLiveState } from "@/lib/eta-calculator";
import TrackingMap from "@/components/map/MapWrapper";
import ChatInterface from "@/components/chat/ChatInterface";
import PassengerTabs from "@/components/passenger/PassengerTabs";
import { Bus, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function PassengerDashboard() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;

  const [activeBuses, activeRoutes, userFavorites, userNotifications] = await Promise.all([
    db.query.buses.findMany({
      where: eq(buses.status, "active"),
      with: { 
        location: true, 
        route: { 
          with: { 
            routeStops: { 
              with: { stop: true }, 
              orderBy: (rs, { asc }) => [asc(rs.stopOrder)] 
            } 
          } 
        } 
      },
    }),
    db.query.routes.findMany({
      where: eq(routesTable.status, "active"),
      with: { routeStops: { with: { stop: true }, orderBy: (rs, { asc }) => [asc(rs.stopOrder)] } },
    }),
    db.query.favoriteRoutes.findMany({
      where: eq(favoriteRoutes.userId, userId),
      with: { route: true },
    }),
    db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: (n, { desc }) => [desc(n.createdAt)],
      limit: 10,
    }),
  ]);

  const initialBuses = activeBuses
    .filter((b) => b.location)
    .map((b) => {
      const state = calculateLiveState(b as any);
      return {
        ...state,
        latitude: state.currentPosition?.lat ?? b.location!.latitude,
        longitude: state.currentPosition?.lng ?? b.location!.longitude,
        routeColor: state.routeColor ?? b.route?.color ?? "#3B82F6",
      };
    });

  const unreadCount = userNotifications.filter((n) => !n.read).length;
  const favoriteRouteIds = userFavorites.map((f) => f.routeId);
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* ── Page Header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#111827]">
            Good {getTimeOfDay()}, {firstName}
          </h1>
          <p className="text-[#6B7280] text-sm mt-1">
            {activeBuses.length} buses active · {activeRoutes.length} routes running
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <Badge variant="destructive" className="gap-1 bg-[#EF4444] text-white">
              <Bell className="h-3 w-3" />
              {unreadCount} new
            </Badge>
          )}
          <div className="flex items-center gap-1.5 bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] rounded-full px-3 py-1 text-xs font-semibold">
            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            Live
          </div>
        </div>
      </div>

      {/* ── Quick Stats ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: "Active Buses", value: activeBuses.length, color: "text-[#06B6D4]" },
          { label: "Routes", value: activeRoutes.length, color: "text-[#8B5CF6]" },
          { label: "Saved Routes", value: userFavorites.length, color: "text-[#EF4444]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all hover:shadow-md">
            <div className="flex flex-col">
              <p className={`text-4xl font-extrabold tabular-nums tracking-tighter ${color} mb-1`}>{value}</p>
              <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Tabs ────────────────────────────────── */}
      <PassengerTabs
        userId={userId}
        initialBuses={initialBuses}
        activeBuses={activeBuses as any}
        activeRoutes={activeRoutes as any}
        favoriteRouteIds={favoriteRouteIds}
      />
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
