import { db } from "../db";
import { leads } from "../../shared/schema";
import { inArray } from "drizzle-orm";

const orphanedIds = [6884, 663, 705, 674, 685, 673]; // confirmed not in Odoo

async function main() {
  await db.delete(leads).where(inArray(leads.id, orphanedIds));
  console.log(`Deleted ${orphanedIds.length} leads no longer in Odoo: [${orphanedIds.join(', ')}]`);
  process.exit(0);
}
main().catch(console.error);
