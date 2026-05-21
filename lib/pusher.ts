import Pusher from "pusher";
import PusherClient from "pusher-js";

// Server-side Pusher instance
const rawPusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID || "dummy",
  key: process.env.PUSHER_KEY || "dummy",
  secret: process.env.PUSHER_SECRET || "dummy",
  cluster: process.env.PUSHER_CLUSTER || "us2",
  useTLS: true,
});

export const pusherServer = {
  ...rawPusherServer,
  trigger: async (channel: string | string[], event: string, data: any, socketIdOrParams?: any) => {
    try {
      const appId = process.env.PUSHER_APP_ID;
      if (!appId || appId === "your-app-id" || appId.includes("dummy")) {
        // console.log(`[Pusher Mock] Triggered event "${event}" on channel "${channel}"`);
        return;
      }
      return await rawPusherServer.trigger(channel, event, data, socketIdOrParams);
    } catch (err: any) {
      console.warn("[Pusher Error] Failed to broadcast event:", err.message);
    }
  }
} as unknown as Pusher;

// Client-side Pusher instance (singleton)
let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient(
      process.env.NEXT_PUBLIC_PUSHER_KEY!,
      {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        forceTLS: true,
      }
    );
  }
  return pusherClientInstance;
}

// Channel names
export const CHANNELS = {
  BUS_TRACKING: "bus-tracking",
  bus: (busId: string) => `bus-${busId}`,
  user: (userId: string) => `user-${userId}`,
  admin: "admin-alerts",
} as const;

// Event names
export const EVENTS = {
  LOCATION_UPDATE: "location-update",
  ETA_UPDATE: "eta-update",
  ROUTE_RECOMMENDATION: "route-recommendation",
  DRIVER_RESPONSE: "driver-response",
  PASSENGER_NOTIFICATION: "passenger-notification",
  NEW_ISSUE: "new-issue",
  STATUS_UPDATE: "status-update",
} as const;
