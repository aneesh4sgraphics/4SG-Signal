import { OdooClient } from "../odoo";

const odoo = new OdooClient();

async function main() {
  try {
    const lead = await odoo.getLeadById(24194);
    if (lead) {
      console.log("Lead 24194 STILL EXISTS in Odoo:");
      console.log(JSON.stringify({ id: lead.id, name: lead.name, active: (lead as any).active, type: (lead as any).type, stage_id: (lead as any).stage_id }, null, 2));
    } else {
      console.log("Lead 24194 NOT FOUND in Odoo (deleted/archived)");
    }
  } catch (err: any) {
    console.log("Error fetching from Odoo:", err.message);
  }
  process.exit(0);
}
main().catch(console.error);
