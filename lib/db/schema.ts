import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums (Mapped to Text in SQLite) ──────────────────────────────────────

const userRoleEnum = ["passenger", "driver", "admin"] as const;
const busStatusEnum = ["active", "inactive", "maintenance", "assigned", "completed"] as const;
const routeStatusEnum = ["active", "inactive", "suspended"] as const;
const recommendationStatusEnum = ["pending", "accepted", "rejected", "expired"] as const;
const issueStatusEnum = ["open", "in_progress", "resolved", "closed"] as const;
const issuePriorityEnum = ["low", "medium", "high", "critical"] as const;

const defaultNow = sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`;

// ─── Users (Better-Auth managed) ──────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: userRoleEnum }).notNull().default("passenger"),
  phone: text("phone"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ─── Routes ────────────────────────────────────────────────────────────────

export const routes = sqliteTable("routes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  number: text("number").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#3B82F6"),
  status: text("status", { enum: routeStatusEnum }).notNull().default("active"),
  startAddress: text("start_address"),
  endAddress: text("end_address"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  endLat: real("end_lat"),
  endLng: real("end_lng"),
  geometry: text("geometry"), // Mapbox road-aligned polyline
  distance: real("distance"), // Road distance in km
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Bus Stops ─────────────────────────────────────────────────────────────

export const busStops = sqliteTable(
  "bus_stops",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code"),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    address: text("address"),
    addressSecondary: text("address_secondary"),
    imageUrl: text("image_url"),
    amenities: text("amenities", { mode: "json" }).$type<string[]>().default([]),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
  },
  (table) => [index("bus_stops_lat_lng_idx").on(table.latitude, table.longitude)]
);

// ─── Route Stops (junction table with ordering) ────────────────────────────

export const routeStops = sqliteTable("route_stops", {
  id: text("id").primaryKey(),
  routeId: text("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  stopId: text("stop_id")
    .notNull()
    .references(() => busStops.id, { onDelete: "cascade" }),
  stopOrder: integer("stop_order").notNull(),
  distanceFromPrev: real("distance_from_prev").default(0),
  estimatedMinutesFromStart: integer("estimated_minutes_from_start").default(0),
});

// ─── Buses ─────────────────────────────────────────────────────────────────

export const buses = sqliteTable("buses", {
  id: text("id").primaryKey(),
  name: text("name"),
  number: text("number").notNull().unique(),
  registrationNumber: text("registration_number"),
  capacity: integer("capacity").notNull().default(40),
  busType: text("bus_type").default("Non-AC"),
  currentRouteId: text("current_route_id").references(() => routes.id, { onDelete: "set null" }),
  driverId: text("driver_id").references(() => users.id, { onDelete: "set null" }),
  manualDriverName: text("manual_driver_name"),
  scheduledStartTime: integer("scheduled_start_time", { mode: "timestamp" }),
  actualStartTime: integer("actual_start_time", { mode: "timestamp" }),
  endTime: integer("end_time", { mode: "timestamp" }),
  status: text("status", { enum: busStatusEnum }).notNull().default("inactive"),
  imageUrl: text("image_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Bus Locations (current) ───────────────────────────────────────────────

export const busLocations = sqliteTable(
  "bus_locations",
  {
    id: text("id").primaryKey(),
    busId: text("bus_id")
      .notNull()
      .unique()
      .references(() => buses.id, { onDelete: "cascade" }),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    speed: real("speed").notNull().default(0),
    heading: real("heading").notNull().default(0),
    currentStopIndex: integer("current_stop_index").default(0),
    nextStopId: text("next_stop_id").references(() => busStops.id),
    isReverse: integer("is_reverse", { mode: "boolean" }).default(false),
    boardingUntil: integer("boarding_until", { mode: "timestamp" }),
    routeStatus: text("route_status", { enum: ["on_route", "deviation", "off_route"] }).default("on_route"),
    deviationTime: integer("deviation_time", { mode: "timestamp" }),
    distanceCovered: real("distance_covered").default(0),
    trackingMode: text("tracking_mode", { enum: ["live", "simulation"] }).notNull().default("simulation"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
  },
  (table) => [index("bus_locations_bus_id_idx").on(table.busId)]
);

// ─── ETA Predictions ───────────────────────────────────────────────────────

export const etaPredictions = sqliteTable(
  "eta_predictions",
  {
    id: text("id").primaryKey(),
    busId: text("bus_id")
      .notNull()
      .references(() => buses.id, { onDelete: "cascade" }),
    stopId: text("stop_id")
      .notNull()
      .references(() => busStops.id, { onDelete: "cascade" }),
    predictedArrival: integer("predicted_arrival", { mode: "timestamp" }).notNull(),
    confidence: integer("confidence").notNull().default(70),
    minutesAway: integer("minutes_away").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
  },
  (table) => [
    index("eta_bus_stop_idx").on(table.busId, table.stopId),
  ]
);

// ─── Historical Data (for ETA learning) ───────────────────────────────────

export const historicalData = sqliteTable("historical_data", {
  id: text("id").primaryKey(),
  busId: text("bus_id")
    .notNull()
    .references(() => buses.id, { onDelete: "cascade" }),
  routeId: text("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  stopId: text("stop_id")
    .notNull()
    .references(() => busStops.id, { onDelete: "cascade" }),
  scheduledArrival: integer("scheduled_arrival", { mode: "timestamp" }),
  actualArrival: integer("actual_arrival", { mode: "timestamp" }).notNull(),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  dayOfWeek: integer("day_of_week").notNull(),
  hourOfDay: integer("hour_of_day").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Traffic Conditions ────────────────────────────────────────────────────

export const trafficConditions = sqliteTable("traffic_conditions", {
  id: text("id").primaryKey(),
  segmentStartLat: real("segment_start_lat").notNull(),
  segmentStartLng: real("segment_start_lng").notNull(),
  segmentEndLat: real("segment_end_lat").notNull(),
  segmentEndLng: real("segment_end_lng").notNull(),
  trafficLevel: integer("traffic_level").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Route Recommendations ─────────────────────────────────────────────────

export const routeRecommendations = sqliteTable("route_recommendations", {
  id: text("id").primaryKey(),
  busId: text("bus_id")
    .notNull()
    .references(() => buses.id, { onDelete: "cascade" }),
  currentRouteId: text("current_route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  recommendedRouteId: text("recommended_route_id").references(() => routes.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  timeSavedMinutes: integer("time_saved_minutes").notNull().default(0),
  priority: integer("priority").notNull().default(1),
  status: text("status", { enum: recommendationStatusEnum }).notNull().default("pending"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
  respondedAt: integer("responded_at", { mode: "timestamp" }),
});

// ─── Chat Messages ─────────────────────────────────────────────────────────

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
  contextData: text("context_data", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Favorite Routes ───────────────────────────────────────────────────────

export const favoriteRoutes = sqliteTable("favorite_routes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: text("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Issues ────────────────────────────────────────────────────────────────

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  reportedById: text("reported_by_id").references(() => users.id, { onDelete: "cascade" }),
  stopId: text("stop_id").references(() => busStops.id, { onDelete: "cascade" }),
  busId: text("bus_id").references(() => buses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  status: text("status", { enum: issueStatusEnum }).notNull().default("open"),
  priority: text("priority", { enum: issuePriorityEnum }).notNull().default("medium"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Notifications ─────────────────────────────────────────────────────────

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultNow),
});

// ─── Relations ─────────────────────────────────────────────────────────────

export const routesRelations = relations(routes, ({ many }) => ({
  routeStops: many(routeStops),
  buses: many(buses),
  favoriteRoutes: many(favoriteRoutes),
  recommendations: many(routeRecommendations),
}));

export const busStopsRelations = relations(busStops, ({ many }) => ({
  routeStops: many(routeStops),
  etaPredictions: many(etaPredictions),
  historicalData: many(historicalData),
}));

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  route: one(routes, { fields: [routeStops.routeId], references: [routes.id] }),
  stop: one(busStops, { fields: [routeStops.stopId], references: [busStops.id] }),
}));

export const busesRelations = relations(buses, ({ one, many }) => ({
  route: one(routes, { fields: [buses.currentRouteId], references: [routes.id] }),
  driver: one(users, { fields: [buses.driverId], references: [users.id] }),
  location: one(busLocations, { fields: [buses.id], references: [busLocations.busId] }),
  etaPredictions: many(etaPredictions),
  recommendations: many(routeRecommendations),
  historicalData: many(historicalData),
}));

export const busLocationsRelations = relations(busLocations, ({ one }) => ({
  bus: one(buses, { fields: [busLocations.busId], references: [buses.id] }),
  nextStop: one(busStops, { fields: [busLocations.nextStopId], references: [busStops.id] }),
}));

export const etaPredictionsRelations = relations(etaPredictions, ({ one }) => ({
  bus: one(buses, { fields: [etaPredictions.busId], references: [buses.id] }),
  stop: one(busStops, { fields: [etaPredictions.stopId], references: [busStops.id] }),
}));

export const historicalDataRelations = relations(historicalData, ({ one }) => ({
  bus: one(buses, { fields: [historicalData.busId], references: [buses.id] }),
  route: one(routes, { fields: [historicalData.routeId], references: [routes.id] }),
  stop: one(busStops, { fields: [historicalData.stopId], references: [busStops.id] }),
}));

export const routeRecommendationsRelations = relations(routeRecommendations, ({ one }) => ({
  bus: one(buses, { fields: [routeRecommendations.busId], references: [buses.id] }),
  currentRoute: one(routes, { fields: [routeRecommendations.currentRouteId], references: [routes.id] }),
}));

export const favoriteRoutesRelations = relations(favoriteRoutes, ({ one }) => ({
  user: one(users, { fields: [favoriteRoutes.userId], references: [users.id] }),
  route: one(routes, { fields: [favoriteRoutes.routeId], references: [routes.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  reportedBy: one(users, { fields: [issues.reportedById], references: [users.id] }),
  stop: one(busStops, { fields: [issues.stopId], references: [busStops.id] }),
  bus: one(buses, { fields: [issues.busId], references: [buses.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  favoriteRoutes: many(favoriteRoutes),
  chatMessages: many(chatMessages),
  notifications: many(notifications),
  issues: many(issues),
}));
