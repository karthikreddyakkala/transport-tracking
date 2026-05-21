/**
 * Seed script — populates the database with realistic Jalandhar bus data.
 *
 * Usage:
 *   pnpm db:seed          — add/update Jalandhar data
 *   pnpm db:seed --reset  — wipe bus/route/stop data first, then re-seed
 */

import "dotenv/config";
import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { nanoid } from "nanoid";

// ─── Bus Stops — Jalandhar, Punjab ─────────────────────────────────────────

const STOPS = [
  { name: "ISBT Jalandhar",           code: "JLD-ISB", lat: 31.3155, lng: 75.5709, address: "Inter State Bus Terminal, GT Road, Jalandhar" },
  { name: "Jalandhar City Rly Stn",   code: "JLD-RLY", lat: 31.3184, lng: 75.5801, address: "Railway Station Road, Jalandhar" },
  { name: "Guru Nanak Mission Chowk", code: "JLD-GNM", lat: 31.3230, lng: 75.5776, address: "Guru Nanak Mission Chowk, Jalandhar" },
  { name: "Civil Lines",              code: "JLD-CVL", lat: 31.3316, lng: 75.5779, address: "DC Office, Civil Lines, Jalandhar" },
  { name: "Nakodar Chowk",            code: "JLD-NAK", lat: 31.3276, lng: 75.5652, address: "Nakodar Chowk, Jalandhar" },
  { name: "BMC Chowk",                code: "JLD-BMC", lat: 31.3250, lng: 75.5896, address: "BMC Chowk, Jalandhar" },
  { name: "Model Town",               code: "JLD-MDL", lat: 31.3189, lng: 75.6028, address: "Model Town, Jalandhar" },
  { name: "Urban Estate Phase 1",     code: "JLD-UEP", lat: 31.3349, lng: 75.6035, address: "Urban Estate Phase 1, Jalandhar" },
  { name: "Pathankot Chowk",          code: "JLD-PTK", lat: 31.3368, lng: 75.5987, address: "Pathankot Road, Jalandhar" },
  { name: "Kapurthala Chowk",         code: "JLD-KAP", lat: 31.3073, lng: 75.5597, address: "Kapurthala Road, Jalandhar" },
  { name: "Phagwara Gate",            code: "JLD-PHG", lat: 31.3143, lng: 75.5829, address: "Phagwara Gate Bus Stand, Jalandhar" },
  { name: "Reru Chowk",               code: "JLD-RER", lat: 31.3098, lng: 75.5710, address: "Reru Chowk, Jalandhar" },
];

// ─── Routes ─────────────────────────────────────────────────────────────────

const ROUTES = [
  {
    number: "JL-1",
    name: "ISBT ↔ Urban Estate",
    color: "#3B82F6",
    description: "Main city corridor — ISBT to Urban Estate via Civil Lines & Pathankot Chowk",
    stops: ["JLD-ISB", "JLD-RLY", "JLD-GNM", "JLD-CVL", "JLD-PTK", "JLD-UEP"],
  },
  {
    number: "JL-2",
    name: "Kapurthala Chowk ↔ Model Town",
    color: "#10B981",
    description: "East-West connector via city center and BMC Chowk",
    stops: ["JLD-KAP", "JLD-RER", "JLD-ISB", "JLD-PHG", "JLD-BMC", "JLD-MDL"],
  },
  {
    number: "JL-3",
    name: "Nakodar Chowk ↔ Pathankot Chowk",
    color: "#F59E0B",
    description: "North-South ring route via railway station and Civil Lines",
    stops: ["JLD-NAK", "JLD-GNM", "JLD-RLY", "JLD-CVL", "JLD-PTK"],
  },
];

// ─── Buses ───────────────────────────────────────────────────────────────────

const BUSES = [
  { number: "PB-08-A-1001", regNumber: "PB08A1001", capacity: 52, routeNumber: "JL-1", status: "active" as const },
  { number: "PB-08-A-2002", regNumber: "PB08A2002", capacity: 48, routeNumber: "JL-2", status: "active" as const },
  { number: "PB-08-A-3003", regNumber: "PB08A3003", capacity: 44, routeNumber: "JL-3", status: "active" as const },
];

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seed() {
  const reset = process.argv.includes("--reset");
  console.log(`\n🌱 Seeding Jalandhar data${reset ? " (RESET mode)" : ""}…\n`);

  if (reset) {
    console.log("🗑️  Clearing existing bus/route/stop data…");
    await db.delete(schema.busLocations);
    await db.delete(schema.etaPredictions);
    await db.delete(schema.historicalData);
    await db.delete(schema.routeRecommendations);
    await db.delete(schema.buses);
    await db.delete(schema.routeStops);
    await db.delete(schema.routes);
    await db.delete(schema.busStops);
    console.log("   ✓ Cleared\n");
  }

  // 1. Stops
  console.log("📍 Creating bus stops…");
  const stopIds: Record<string, string> = {};

  for (const s of STOPS) {
    const existing = await db.query.busStops.findFirst({
      where: (t, { eq }) => eq(t.code, s.code),
    });
    if (existing) {
      stopIds[s.code] = existing.id;
      console.log(`   ✓ "${s.name}" already exists`);
      continue;
    }
    const id = nanoid();
    await db.insert(schema.busStops).values({
      id,
      name: s.name,
      code: s.code,
      latitude: s.lat,
      longitude: s.lng,
      address: s.address,
    });
    stopIds[s.code] = id;
    console.log(`   + Created "${s.name}" (${s.code})`);
  }

  // 2. Routes + route-stops
  console.log("\n🛤️  Creating routes…");
  const routeIds: Record<string, string> = {};

  for (const r of ROUTES) {
    const existing = await db.query.routes.findFirst({
      where: (t, { eq }) => eq(t.number, r.number),
    });

    let routeId: string;
    if (existing) {
      routeId = existing.id;
      routeIds[r.number] = routeId;
      console.log(`   ✓ Route ${r.number} already exists`);
    } else {
      routeId = nanoid();
      await db.insert(schema.routes).values({
        id: routeId,
        number: r.number,
        name: r.name,
        color: r.color,
        description: r.description,
        status: "active",
      });
      routeIds[r.number] = routeId;
      console.log(`   + Created route ${r.number} — ${r.name}`);
    }

    for (let i = 0; i < r.stops.length; i++) {
      const code = r.stops[i];
      const stopId = stopIds[code];
      if (!stopId) { console.warn(`     ⚠ Stop code "${code}" not found`); continue; }

      const exists = await db.query.routeStops.findFirst({
        where: (t, { and, eq }) => and(eq(t.routeId, routeId), eq(t.stopId, stopId)),
      });
      if (exists) continue;

      await db.insert(schema.routeStops).values({
        id: nanoid(),
        routeId,
        stopId,
        stopOrder: i,
        estimatedMinutesFromStart: i * 7,
      });
    }
    console.log(`     ↳ ${r.stops.length} stops assigned`);
  }

  // 3. Buses + initial locations
  console.log("\n🚌 Creating buses…");
  for (const b of BUSES) {
    const existing = await db.query.buses.findFirst({
      where: (t, { eq }) => eq(t.number, b.number),
    });
    if (existing) {
      console.log(`   ✓ Bus ${b.number} already exists`);
      continue;
    }

    const routeId = routeIds[b.routeNumber];
    const id = nanoid();
    await db.insert(schema.buses).values({
      id,
      number: b.number,
      registrationNumber: b.regNumber,
      capacity: b.capacity,
      currentRouteId: routeId ?? null,
      status: b.status,
    });

    const routeDef = ROUTES.find((r) => r.number === b.routeNumber);
    if (routeDef) {
      const firstCode = routeDef.stops[0];
      const firstStop = STOPS.find((s) => s.code === firstCode);
      if (firstStop) {
        await db.insert(schema.busLocations).values({
          id: nanoid(),
          busId: id,
          latitude: firstStop.lat,
          longitude: firstStop.lng,
          speed: 0,
          heading: 0,
          currentStopIndex: 0,
          nextStopId: stopIds[routeDef.stops[1]] ?? null,
          updatedAt: new Date(),
        });
      }
    }

    console.log(`   + Created bus ${b.number} → Route ${b.routeNumber}`);
  }

  console.log("\n✅ Seed complete!\n");
  console.log("Summary:");
  console.log(`  • ${STOPS.length} bus stops in Jalandhar, Punjab`);
  console.log(`  • ${ROUTES.length} routes (JL-1, JL-2, JL-3)`);
  console.log(`  • ${BUSES.length} buses (all active with initial GPS at route start)`);
  console.log("\nNext: Admin Dashboard → Start Simulation to see buses on the Jalandhar map.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
