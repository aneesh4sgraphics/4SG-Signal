import { db } from "./db";
import { customers } from "@shared/schema";
import { eq } from "drizzle-orm";

// Sales rep assignments — IDs match Odoo res.users IDs
export const SALES_REPS = {
  aneesh:   { id: '26', name: 'Aneesh Prabhu',        email: 'aneesh@4sgraphics.com' },
  patricio: { id: '27', name: 'Patricio Delgado',     email: 'patricio@4sgraphics.com' },
  santiago: { id: '28', name: 'Santiago Castellanos', email: 'santiago@4sgraphics.com' },
};

// Latin American / Spanish-speaking countries
const LATIN_AMERICAN_COUNTRIES = [
  'mexico', 'argentina', 'colombia', 'chile', 'peru', 'ecuador', 'venezuela',
  'guatemala', 'cuba', 'bolivia', 'dominican republic', 'honduras', 'paraguay',
  'el salvador', 'nicaragua', 'costa rica', 'panama', 'uruguay', 'puerto rico',
  'spain', 'mx', 'ar', 'co', 'cl', 'pe', 'ec', 've', 'gt', 'cu', 'bo', 'do',
  'hn', 'py', 'sv', 'ni', 'cr', 'pa', 'uy', 'pr', 'es'
];

// English-speaking countries (excluding US which is handled by state)
const ENGLISH_SPEAKING_COUNTRIES = [
  'canada', 'jamaica', 'united kingdom', 'uk', 'australia', 'new zealand',
  'ireland', 'bahamas', 'barbados', 'trinidad', 'trinidad and tobago',
  'ca', 'jm', 'gb', 'au', 'nz', 'ie', 'bs', 'bb', 'tt'
];

// Florida state variations (includes common formats from Odoo/imports)
const FLORIDA_STATES = ['fl', 'florida', 'florida (us)', 'fl (us)'];

// US variations
const US_COUNTRIES = ['united states', 'usa', 'us', 'united states of america', 'u.s.', 'u.s.a.'];

// Helper to check if province is Florida
function isFloridaState(province: string): boolean {
  const normalized = province.toLowerCase().trim();
  // Direct match
  if (FLORIDA_STATES.includes(normalized)) return true;
  // Starts with florida
  if (normalized.startsWith('florida')) return true;
  // Is just "fl" with optional suffix
  if (normalized === 'fl' || normalized.startsWith('fl ') || normalized.startsWith('fl(')) return true;
  return false;
}

interface CustomerLocation {
  country?: string | null;
  province?: string | null;  // state/province
}

/**
 * Determines the appropriate sales rep based on customer location
 * Returns null if no matching rule found
 */
export function determineSalesRep(location: CustomerLocation): typeof SALES_REPS[keyof typeof SALES_REPS] | null {
  const country = (location.country || '').toLowerCase().trim();
  const province = (location.province || '').toLowerCase().trim();
  
  // Check if this is a US customer (includes empty country which defaults to US)
  const isUS = US_COUNTRIES.includes(country) || country === '' || country.includes('united states');
  
  // Rule 1: Florida customers → Santiago
  if (isUS && province && isFloridaState(province)) {
    return SALES_REPS.santiago;
  }
  
  // Rule 2: Latin American / Spanish-speaking countries → Patricio
  if (LATIN_AMERICAN_COUNTRIES.includes(country)) {
    return SALES_REPS.patricio;
  }
  
  // Rule 3: US outside Florida OR English-speaking countries → Aneesh
  const isUSOutsideFlorida = isUS && province && !isFloridaState(province);
  const isEnglishSpeaking = ENGLISH_SPEAKING_COUNTRIES.includes(country);
  
  if (isUSOutsideFlorida || isEnglishSpeaking) {
    return SALES_REPS.aneesh;
  }
  
  return null;
}

/**
 * Auto-assigns a sales rep to a customer if they don't have one
 * This runs automatically when customers are created or updated
 * Returns true if assignment was made, false otherwise
 */
export async function autoAssignSalesRepIfNeeded(
  customerId: string,
  currentSalesRepId: string | null | undefined,
  location: CustomerLocation
): Promise<{ assigned: boolean; rep?: typeof SALES_REPS[keyof typeof SALES_REPS] }> {
  
  // Skip if already has a sales rep
  if (currentSalesRepId && currentSalesRepId.trim() !== '') {
    return { assigned: false };
  }
  
  const assignedRep = determineSalesRep(location);
  
  if (!assignedRep) {
    return { assigned: false };
  }
  
  try {
    await db.update(customers)
      .set({
        salesRepId: assignedRep.id,
        salesRepName: assignedRep.name,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));
    
    console.log(`[Sales Rep Auto-Assign] Assigned ${assignedRep.name} to customer ${customerId} (country: ${location.country || 'unknown'})`);
    
    return { assigned: true, rep: assignedRep };
  } catch (error) {
    console.error(`[Sales Rep Auto-Assign] Error assigning rep to customer ${customerId}:`, error);
    return { assigned: false };
  }
}

/**
 * Check if a country is Spanish-speaking (for quick checks)
 */
export function isSpanishSpeakingCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return LATIN_AMERICAN_COUNTRIES.includes(country.toLowerCase().trim());
}
