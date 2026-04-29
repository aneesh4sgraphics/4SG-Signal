import { odooClient } from "../odoo";
import { db } from "../db";
import { leads } from "../../shared/schema";
import { isNotNull } from "drizzle-orm";

async function main() {
  // Step 1: Get all Odoo lead IDs (same as sync)
  console.log("Fetching all leads from Odoo...");
  const odooLeads = await odooClient.getAllLeads('lead');
  const odooLeadIdSet = new Set(odooLeads.map((l: any) => l.id));
  console.log(`Found ${odooLeads.length} leads in Odoo`);
  console.log(`Odoo lead ID 24194 in set? ${odooLeadIdSet.has(24194)}`);

  // Step 2: Get local leads with odooLeadId
  const localLeadsWithOdooId = await db.select({ id: leads.id, odooLeadId: leads.odooLeadId, stage: leads.stage, name: leads.name })
    .from(leads)
    .where(isNotNull(leads.odooLeadId));
  
  console.log(`Found ${localLeadsWithOdooId.length} local leads with odooLeadId`);

  // Step 3: Simulate deletion check
  const toDelete = localLeadsWithOdooId.filter(l =>
    l.odooLeadId !== null &&
    !odooLeadIdSet.has(l.odooLeadId) &&
    l.stage !== 'converted'
  );
  
  console.log(`\nWould delete ${toDelete.length} leads on next sync:`);
  for (const l of toDelete) {
    console.log(`  id=${l.id}, odooLeadId=${l.odooLeadId}, name="${l.name}", stage="${l.stage}"`);
  }

  process.exit(0);
}
main().catch(console.error);
