import { db } from "../db";
import { leads } from "../../shared/schema";
import { ilike, or } from "drizzle-orm";

async function main() {
  const results = await db.select({ id: leads.id, name: leads.name, company: leads.company, email: leads.email, odooLeadId: leads.odooLeadId, stage: leads.stage })
    .from(leads)
    .where(or(ilike(leads.name, '%charles%weldon%'), ilike(leads.company, '%arc document%')));
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}
main().catch(console.error);
