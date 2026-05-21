import "dotenv/config";
import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function createAdmin() {
  console.log("Creating Admin User...");

  const email = "sriram@gmail.com";

  try {
    const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email)
    });

    if (existing) {
        console.log("User already exists. Updating role to admin...");
        await db.update(schema.users)
            .set({ role: "admin" })
            .where(eq(schema.users.email, email));
        console.log("Updated role to admin!");
    } else {
        console.log("User does not exist yet. Please manually sign up as a passenger on the website first using the email and password you provided.");
        console.log("Then run this script again to upgrade the account to an admin.");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error creating/updating admin:", error);
    process.exit(1);
  }
}

createAdmin();
