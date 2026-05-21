ALTER TABLE "bus_locations" ADD COLUMN "is_reverse" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "buses" ADD COLUMN "name" varchar(100);--> statement-breakpoint
ALTER TABLE "buses" ADD COLUMN "bus_type" varchar(20) DEFAULT 'Non-AC';--> statement-breakpoint
ALTER TABLE "buses" ADD COLUMN "manual_driver_name" varchar(100);