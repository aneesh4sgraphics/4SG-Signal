import { db } from "../db";
import { eq } from "drizzle-orm";
import { leads, customers } from "../../shared/schema";
import { readFileSync } from "fs";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim().replace(/\.$/, '');
}

function extractDomain(email: string): string | null {
  const m = email.match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : null;
}

interface ParsedCompany {
  companyName: string;
  contact: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  website: string;
}

async function main() {
  const companies: ParsedCompany[] = JSON.parse(readFileSync('/tmp/good_companies.json', 'utf8'));
  
  let imported = 0, skippedDup = 0, errors = 0;

  for (const c of companies) {
    try {
      const emailNorm = normalizeEmail(c.email);
      
      // Check existing leads
      const [existingLead] = await db.select({ id: leads.id })
        .from(leads)
        .where(eq(leads.emailNormalized, emailNorm))
        .limit(1);
      
      if (existingLead) {
        skippedDup++;
        console.log(`  SKIP (lead) ${c.email}`);
        continue;
      }
      
      // Check existing customers
      const [existingCustomer] = await db.select({ id: customers.id })
        .from(customers)
        .where(eq(customers.emailNormalized, emailNorm))
        .limit(1);
      
      if (existingCustomer) {
        skippedDup++;
        console.log(`  SKIP (cust) ${c.email}`);
        continue;
      }
      
      // Build lead
      const leadName = c.contact || c.companyName;
      
      await db.insert(leads).values({
        name: leadName.substring(0, 255),
        company: c.companyName.substring(0, 255),
        email: c.email,
        emailNormalized: emailNorm,
        phone: c.phone || null,
        street: c.street || null,
        city: c.city || null,
        state: c.state || null,
        zip: c.zip || null,
        country: 'United States',
        website: c.website || null,
        companyDomain: extractDomain(c.email) ?? undefined,
        sourceType: 'import',
        stage: 'new',
        tags: 'PIA MidAmerica Buyers Guide 2026',
        description: `Imported from PIA MidAmerica Buyers Guide Spring 2026. Company: ${c.companyName}. Contact: ${c.contact || 'N/A'}. Location: ${[c.city, c.state].filter(Boolean).join(', ')}.`,
      });
      
      imported++;
      console.log(`  IMPORTED: ${c.companyName} (${c.email})`);
      
    } catch (err: any) {
      errors++;
      console.error(`  ERROR: ${c.companyName} - ${err.message}`);
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (duplicates): ${skippedDup}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total processed: ${companies.length}`);
  
  process.exit(0);
}

main().catch(console.error);
