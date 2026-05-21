import { db } from "./lib/db";
import { buses } from "./lib/db/schema";
import { eq } from "drizzle-orm";
import { simulateBus } from "./lib/gps-simulator";

async function run() {
  const activeBuses = await db.query.buses.findMany({ where: eq(buses.status, "active") });
  if (activeBuses.length > 0) {
    console.log("Simulating bus:", activeBuses[0].id);
    const result = await simulateBus(activeBuses[0].id);
    console.log(result);
  } else {
    console.log("No active buses found");
  }
}
run();
