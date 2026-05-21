import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(input: Date | string | null | undefined): string {
  if (!input || input === "") return "--:--";
  let date: Date;
  if (typeof input === "string") {
    // If it looks like a full ISO string (long)
    if (input.length > 8) {
      date = new Date(input);
    } 
    // If it looks like HH:mm or HH:mm:ss
    else if (input.includes(":")) {
      const [h, m] = input.split(":").map(Number);
      date = new Date();
      date.setHours(h, m, 0, 0);
    } else {
      date = new Date(input);
    }
  } else if (typeof input === "number") {
    date = new Date(input);
  } else {
    date = input as Date;
  }
  
  if (!date || isNaN(date.getTime())) return "--:--";
  
  return date.toLocaleTimeString([], { 
    hour: "2-digit", 
    minute: "2-digit", 
    hour12: true 
  }).toUpperCase();
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

export function formatMinutes(minutes: number | string | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes === "") return "";
  const mins = Math.round(Number(minutes));
  if (isNaN(mins)) return "";

  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  }
  return `${mins} min`;
}
