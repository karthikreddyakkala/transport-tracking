import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buses, routes as routesTable, busStops, users, issues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bus, Route, MapPin, Users, AlertTriangle, Activity,
  Settings, TrendingUp, Zap, CheckCircle2
} from "lucide-react";
import SimulatorControl from "@/components/admin/SimulatorControl";
import TrackingMap from "@/components/map/MapWrapper";
import AssignStopsDialog from "@/components/admin/AssignStopsDialog";
import EditBusDialog from "@/components/admin/EditBusDialog";
import EditRouteDialog from "@/components/admin/EditRouteDialog";
import ResolveIssueButton from "@/components/admin/ResolveIssueButton";
import BookingSchedulerBar from "@/components/admin/BookingSchedulerBar";
import NestedBusWizard from "@/components/admin/NestedBusWizard";
import BusFleetRow from "@/components/admin/BusFleetRow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDashboard() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const role = (session.user as { role?: string }).role;
  if (role !== "admin") redirect("/passenger");

  const [allBuses, activeRoutes, allStops, allUsers, openIssues] = await Promise.all([
    db.query.buses.findMany({
      with: { route: true, driver: { columns: { id: true, name: true } }, location: true },
    }),
    db.query.routes.findMany({
      with: { routeStops: { with: { stop: true }, orderBy: (rs, { asc }) => [asc(rs.stopOrder)] } },
    }),
    db.query.busStops.findMany({ limit: 50 }),
    db.query.users.findMany({ columns: { id: true, name: true, email: true, role: true, createdAt: true } }),
    db.query.issues.findMany({
      where: eq(issues.status, "open"),
      with: {
        stop: { columns: { id: true, name: true } },
        bus: { columns: { id: true, number: true } },
      },
      orderBy: (i, { desc }) => [desc(i.createdAt)],
      limit: 20,
    }),
  ]);

  const activeBuses = allBuses.filter((b) => b.status === "active");
  const maintenanceBuses = allBuses.filter((b) => b.status === "maintenance");
  const activeRoutesCount = activeRoutes.filter((r) => r.status === "active").length;
  const driverCount = allUsers.filter((u) => (u as any).role === "driver").length;
  const passengerCount = allUsers.filter((u) => (u as any).role === "passenger").length;

  const initialBuses = activeBuses
    .filter((b) => b.location)
    .map((b) => ({
      busId: b.id,
      busNumber: b.number,
      routeId: b.currentRouteId ?? "",
      routeColor: b.route?.color ?? "#10B981",
      latitude: b.location!.latitude,
      longitude: b.location!.longitude,
      speed: b.location!.speed,
      heading: b.location!.heading,
    }));

  const stats = [
    {
      title: "Active Buses",
      value: activeBuses.length,
      sub: `${maintenanceBuses.length} in maintenance`,
      icon: Bus,
      color: "text-cyan-400",
      bg: "bg-gradient-to-br from-cyan-500/10 to-transparent",
      border: "border-cyan-500/20",
    },
    {
      title: "Routes",
      value: activeRoutesCount,
      sub: `${activeRoutes.length} total`,
      icon: Route,
      color: "text-emerald-400",
      bg: "bg-gradient-to-br from-emerald-500/10 to-transparent",
      border: "border-emerald-500/20",
    },
    {
      title: "Users",
      value: allUsers.length,
      sub: `${driverCount} drivers · ${passengerCount} passengers`,
      icon: Users,
      color: "text-amber-500",
      bg: "bg-gradient-to-br from-amber-500/10 to-transparent",
      border: "border-amber-500/20",
    },
    {
      title: "Open Issues",
      value: openIssues.length,
      sub: openIssues.length === 0 ? "All clear!" : "Need attention",
      icon: AlertTriangle,
      color: openIssues.length > 0 ? "text-rose-500" : "text-muted-foreground",
      bg: openIssues.length > 0 ? "bg-gradient-to-br from-rose-500/20 to-transparent" : "bg-muted/50",
      border: openIssues.length > 0 ? "border-rose-500/30" : "border-border",
    },
  ];

  const priorityConfig: Record<string, string> = {
    low: "text-muted-foreground bg-muted border-border",
    medium: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    high: "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20",
    critical: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
  };

  const roleColors: Record<string, string> = {
    admin: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    driver: "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20",
    passenger: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* ── Header ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">System overview and management</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-card p-1.5 rounded-xl shadow-sm">
            <span className="text-xs font-semibold text-muted-foreground px-2 hidden sm:inline">Add System Records:</span>
            <NestedBusWizard />
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-md hidden lg:flex">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            System Online
          </div>
        </div>
      </div>

      {/* ── Global KPI Stats Grid ───────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(({ title, value, sub, icon: Icon, color }) => (
          <div key={title} className="premium-card p-5 group flex flex-col justify-between">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div>
              <p className={`text-4xl font-black tabular-nums tracking-tighter ${color} mb-1`}>{value}</p>
              <p className="text-[11px] text-muted-foreground/80 truncate font-semibold uppercase tracking-wider">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs (Now Main Hierarchy) ──────────────── */}
      <Tabs defaultValue="overview" className="space-y-6 w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-2">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="buses" className="text-xs gap-1.5">
            <Bus className="h-3.5 w-3.5" />Buses
          </TabsTrigger>
          <TabsTrigger value="routes" className="text-xs gap-1.5">
            <Route className="h-3.5 w-3.5" />Routes
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" />Users
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />Issues
            {openIssues.length > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-xs">{openIssues.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview / Live Map / Dashboard Widgets */}
        <TabsContent value="overview" className="space-y-6">
          
          {/* ── Travel Booking Style Assignment Bar ─── */}
          <div className="w-full relative z-20">
            <BookingSchedulerBar />
          </div>

          {/* ── GPS Simulator ────────────────────────── */}
          <SimulatorControl busIds={activeBuses.map((b) => b.id)} />

          {/* ── Two-Column Layout for Map and Info ── */}
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Map Area */}
            <div className="lg:col-span-3 h-[calc(100vh-350px)] min-h-[500px] premium-card overflow-hidden relative z-0">
              <TrackingMap routes={activeRoutes as any} initialBuses={initialBuses} />
            </div>
            
            {/* Right Side Widgets */}
            <div className="space-y-6 flex flex-col justify-between">
              <Card className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fleet Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {[
                    { label: "Active", count: activeBuses.length, dot: "bg-emerald-500" },
                    { label: "Maintenance", count: activeBuses.length, dot: "bg-amber-500" }, // Fix: was using maintenanceBuses.length but dot color logic was mixed
                    { label: "Inactive", count: allBuses.length - activeBuses.length - maintenanceBuses.length, dot: "bg-muted-foreground/40" },
                  ].map(({ label, count, dot }) => (
                    <div key={label} className="flex items-center gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_10px_currentColor] ${dot} text-${dot.split('-')[1]}-500`} />
                      <span className="text-sm flex-1 font-medium text-foreground">{label}</span>
                      <span className="text-lg font-bold tabular-nums text-foreground">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">User Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {[
                    { label: "Passengers", count: passengerCount, dot: "bg-emerald-500" },
                    { label: "Drivers", count: driverCount, dot: "bg-teal-500" },
                    { label: "Admins", count: allUsers.filter((u) => (u as any).role === "admin").length, dot: "bg-amber-500" },
                  ].map(({ label, count, dot }) => (
                    <div key={label} className="flex items-center gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_10px_currentColor] ${dot} text-${dot.split('-')[1]}-500`} />
                      <span className="text-sm flex-1 font-medium text-foreground">{label}</span>
                      <span className="text-lg font-bold tabular-nums text-foreground">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {[
                    { label: "Total Stops", count: allStops.length },
                    { label: "Active Routes", count: activeRoutesCount },
                    { label: "Open Issues", count: openIssues.length },
                  ].map(({ label, count }) => (
                    <div key={label} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <span className="text-lg font-bold tabular-nums text-foreground/80">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Buses Table */}
        <TabsContent value="buses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 gap-2">
              <div>
                <CardTitle>Fleet Management</CardTitle>
                <CardDescription>{allBuses.length} total buses</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bus Number</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Speed</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allBuses.map((bus) => (
                    <BusFleetRow key={bus.id} bus={bus} activeRoutes={activeRoutes} />
                  ))}
                  {allBuses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        <Bus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        No buses found. Add your first bus.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Routes Table */}
        <TabsContent value="routes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 gap-2">
              <div>
                <CardTitle>Routes</CardTitle>
                <CardDescription>{activeRoutes.length} routes configured</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <AssignStopsDialog
                  routes={activeRoutes.map((r) => ({ id: r.id, name: r.name, number: r.number, color: r.color }))}
                  allStops={allStops.map((s) => ({ id: s.id, name: s.name }))}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Stops</TableHead>
                    <TableHead>Endpoints</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRoutes.map((route) => {
                    const first = route.routeStops[0]?.stop?.name;
                    const last = route.routeStops[route.routeStops.length - 1]?.stop?.name;
                    return (
                      <TableRow key={route.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div 
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_10px_currentColor]" 
                              style={{ color: route.color, backgroundColor: route.color }} 
                            />
                            <div className="bg-muted border border-border px-2.5 py-1 rounded-md text-xs font-bold tracking-wider text-foreground">
                              {route.number}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{route.name}</TableCell>
                        <TableCell className="tabular-nums">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 min-w-8 p-1.5 rounded-full bg-muted hover:bg-muted/80 border border-border text-xs font-semibold tabular-nums text-foreground">
                                {route.routeStops.length}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm leading-none flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                  <MapPin className="h-4 w-4 text-emerald-500" />
                                  Route Stops
                                  <Badge variant="outline" className="ml-auto bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-none px-1.5">{route.routeStops.length}</Badge>
                                </h4>
                                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-sm max-h-[300px] overflow-y-auto pr-2">
                                  {route.routeStops.map((rs: any, index: number) => {
                                    const isStart = index === 0;
                                    const isEnd = index === route.routeStops.length - 1;
                                    return (
                                      <div key={rs.id} className="flex justify-between items-center gap-4 text-slate-800 dark:text-slate-200 p-1">
                                        <div className="flex gap-3 items-center overflow-hidden">
                                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                                            {index + 1}
                                          </div>
                                          <div className="flex flex-col min-w-0">
                                            <span className="font-medium truncate">{rs.stop.name}</span>
                                            {(isStart || isEnd) && (
                                              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">
                                                {isStart ? "Start Point" : "End Point"}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-xs font-semibold text-muted-foreground tabular-nums shrink-0">
                                          {(rs.distanceFromPrev || 0).toFixed(1)} km
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {route.routeStops.length === 0 && (
                                    <div className="text-xs text-muted-foreground italic text-center py-4">No stops configured</div>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-medium">
                          {first && last ? `${first} → ${last}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              route.status === "active"
                                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                : "border-muted-foreground/30 text-muted-foreground bg-muted/50"
                            }
                          >
                            {route.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <EditRouteDialog
                            route={{
                              id: route.id,
                              name: route.name,
                              number: route.number,
                              color: route.color,
                              status: route.status,
                              description: (route as any).description ?? null,
                              routeStops: route.routeStops.map((rs) => ({
                                id: rs.id,
                                stopOrder: rs.stopOrder,
                                stop: { id: rs.stop.id, name: rs.stop.name },
                              })),
                            }}
                            allStops={allStops.map((s) => ({ id: s.id, name: s.name }))}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {activeRoutes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        No routes found. Add your first route.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>



        {/* Users Table */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>
                {allUsers.length} users · {driverCount} drivers · {passengerCount} passengers
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-semibold text-foreground">
                            {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </div>
                          <span className="font-medium text-sm text-foreground">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm font-medium">{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${roleColors[(user as any).role ?? "passenger"]}`}
                        >
                          {(user as any).role ?? "passenger"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm font-medium">
                        {new Date(user.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {allUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Issues Tab */}
        <TabsContent value="issues">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Open Issues</CardTitle>
                  <CardDescription>
                    {openIssues.length === 0
                      ? "No open issues — system running smoothly"
                      : `${openIssues.length} issue${openIssues.length === 1 ? "" : "s"} need attention`}
                  </CardDescription>
                </div>
                {openIssues.length === 0 && (
                  <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> All clear
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openIssues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{issue.title}</p>
                          {issue.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {issue.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${priorityConfig[issue.priority] ?? priorityConfig.medium}`}
                        >
                          {issue.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">
                        {(issue as any).stop?.name ?? (issue as any).bus?.number ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">
                        {new Date(issue.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        <ResolveIssueButton issueId={issue.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {openIssues.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                        <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        No open issues. Everything&apos;s running smoothly.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
