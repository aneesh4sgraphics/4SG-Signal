import { db } from "../db";
import { eq, and, ilike, or } from "drizzle-orm";
import { leads } from "../../shared/schema";

// Map of bad company names → correct names (or null to delete)
// For PIA Buyers Guide imports
const fixes: Record<string, string | null> = {
  "Aneesh Prabhu": "4S Graphics",
  "Hondo Anvil Herald), we operate a general commercial printing business, and": "Hondo Anvil Herald",
  "ed partners to solve": "Austin Community College",
  "School": null,  // too generic - delete
  "P.O. Box 190": "Caddo-Kiowa Technology Center",
  "Training Facility": null,
  "Scoring": null,
  "E-commerce Solutions": null,
  "Mail Merge": "Esko",
  "Trade Printing": "Heidelberg USA Inc.",
  "Graphic Design": null,
  "Union Printer": null,
  "Business Printing": null,
  "Embossing": null,
  "rinting/Business": null,
  "Print-on-Demand Digital Printing": "INX International Ink Co.",
  "Ink Dealers Manufacturers": null,
  "To keep": null,
  "Spiral Wire Binding": null,
  "Tab Cutters and Hole Reinforcing Unit": null,
  "i Automatic": null,
  "pocket": null,
  "ine": null,
  "arge 3D Printer": null,
  "Amanda Novy- Tyner": "Graphic Movers, Inc.",
  "Jennifer Carter": "CME Printing, Inc.",
  "Guy Beavers": "CMYK2Go",
  "Shay Dodson": "Kansas City KS Community College",
  "Georgina Flores": "Lanier High School",
  "Brian Crews": "Lufkin High School",
  "Chandler Monroe": "Knecht Enterprise",
  "Shannon Samuelson": "ImageNet Consulting",
  "Steve Cartwright": "Hudson Printing",
  "Robert Requena": "Register Marks LP",
  "Frank Covarrubia": "Harlandale ISD",
  "Covers": null,
  "score trim and fold for you.": "Hallmark",
  "edge technology and comprehensive services positions them as a key player": "Corporate Visual Packaging",
  "full dedication to integrity, our global teams deliver unbeatable service to our SHIPSTORE": "SHIPSTORE",
  "ant technology. 12 Employees": "Sarchett Printing",
  "bric of the program.": "Xerox",
  "Financial Printing": "Swifty Print",
  "to 401 International Pkwy, Ste 104": "International Roll-Up Systems",
  "rtnersconverting.com": "Phenix Label",
  "Employees": "OVOL USA Western BRW",
};

async function main() {
  let fixed = 0, deleted = 0;

  for (const [badName, goodName] of Object.entries(fixes)) {
    // Find by company name and tag
    const existing = await db.select({ id: leads.id, company: leads.company })
      .from(leads)
      .where(and(
        eq(leads.company, badName),
        ilike(leads.tags || '', '%PIA%')
      ))
      .limit(5);
    
    for (const lead of existing) {
      if (goodName === null) {
        await db.delete(leads).where(eq(leads.id, lead.id));
        console.log(`  DELETED: "${badName}" (id=${lead.id})`);
        deleted++;
      } else {
        await db.update(leads).set({ company: goodName, name: goodName }).where(eq(leads.id, lead.id));
        console.log(`  FIXED: "${badName}" → "${goodName}" (id=${lead.id})`);
        fixed++;
      }
    }
  }

  console.log(`\n=== CLEANUP COMPLETE ===`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Deleted: ${deleted}`);
  
  process.exit(0);
}

main().catch(console.error);
