import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { routes, buses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const route = await db.query.routes.findFirst({
      where: eq(routes.id, id),
      with: { routeStops: { with: { stop: true }, orderBy: (rs, { asc }) => [asc(rs.stopOrder)] } },
    });
    if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });
    return NextResponse.json(route);
  } catch {
    return NextResponse.json({ error: "Failed to fetch route" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const [updated] = await db
      .update(routes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(routes.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update route" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // SQLite constraint workaround: Clear route reference from buses first
    await db.update(buses).set({ currentRouteId: null }).where(eq(buses.currentRouteId, id));
    
    // Now safe to delete the route
    await db.delete(routes).where(eq(routes.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete route:", error);
    return NextResponse.json({ error: "Failed to delete route" }, { status: 500 });
  }
}
