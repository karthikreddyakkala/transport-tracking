import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  try {
    const allUsers = await db.query.users.findMany({
      where: role ? eq(users.role, role as "passenger" | "driver" | "admin") : undefined,
      columns: { id: true, name: true, email: true, role: true },
    });

    if (role === 'driver') {
       const activeBuses = await db.query.buses.findMany({
          // Fetch active assignments to calculate workload
          columns: { driverId: true, scheduledStartTime: true, endTime: true }
       });

       const workloads: Record<string, number> = {};
       const busyDriverIds = new Set<string>();

       activeBuses.forEach(b => {
          if (b.driverId && b.driverId !== 'none' && b.driverId !== 'manual') {
             workloads[b.driverId] = (workloads[b.driverId] || 0) + 1;
             
             // Time boundaries overlap rule: (ExistingStart < NewEnd) AND (ExistingEnd > NewStart)
             if (start && end && b.scheduledStartTime && b.endTime) {
                const newStart = new Date(start);
                const newEnd = new Date(end);
                if (b.scheduledStartTime < newEnd && b.endTime > newStart) {
                   // This driver is already driving exactly during this bounds constraint!
                   busyDriverIds.add(b.driverId);
                }
             }
          }
       });

       const sortedAvailable = allUsers
          .filter(u => !busyDriverIds.has(u.id))
          .map(u => ({ ...u, workload: workloads[u.id] || 0 }))
          .sort((a, b) => a.workload - b.workload); // Ascending by bus load

       return NextResponse.json(sortedAvailable);
    }

    return NextResponse.json(allUsers);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
