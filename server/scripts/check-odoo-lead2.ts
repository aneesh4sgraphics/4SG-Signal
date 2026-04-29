import { odooClient } from "../odoo";

async function main() {
  try {
    const lead = await odooClient.getLeadById(24194);
    if (lead) {
      console.log("Lead 24194 STILL EXISTS in Odoo as ACTIVE:");
      console.log(`  name: ${lead.name}`);
      console.log(`  email: ${(lead as any).email_from}`);
    } else {
      console.log("Lead 24194 NOT returned by active search — it was deleted or archived in Odoo");
      
      // Try with active=false to check if it's archived
      const { odooClient: oc } = await import("../odoo");
      // searchRead crm.lead where id=24194 and active IN (true, false)
    }
  } catch (err: any) {
    console.log("Error:", err.message);
  }
  process.exit(0);
}
main().catch(console.error);
