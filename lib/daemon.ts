import { db } from "./db";
import { buses } from "./db/schema";
import { eq } from "drizzle-orm";
import { simulateBus } from "./gps-simulator";

const globalForDaemon = globalThis as unknown as { __simulatorDaemonStarted: boolean };

export function startSimulatorDaemon() {
  if (globalForDaemon.__simulatorDaemonStarted) {
    return;
  }
  globalForDaemon.__simulatorDaemonStarted = true;
  console.log("[Daemon] Starting server-side simulation engine...");

  setInterval(async () => {
    try {
      const activeBuses = await db.query.buses.findMany({
        where: eq(buses.status, "active"),
      });

      if (activeBuses.length > 0) {
        // Run all concurrently
        await Promise.allSettled(
          activeBuses.map((bus) => simulateBus(bus.id))
        );
      }
    } catch (e) {
      console.error("[Daemon] Error in simulation loop:", e);
    }
  }, 5000);
}
