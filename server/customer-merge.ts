/**
 * Shared auto-merge utility for customer records.
 * Used by the duplicate heuristic (same-email auto-merge) and the manual merge endpoint.
 *
 * Priority rule: Odoo record (has odooPartnerId) is always the primary.
 * If neither record is from Odoo, the one with more non-null fields wins.
 * The primary record keeps its own data; empty/null fields are filled from the secondary.
 * All related records are transferred from secondary to primary before the secondary is deleted.
 */
import { db } from "./db";
import { storage } from "./storage";
import {
  customers,
  customerContacts,
  customerJourney,
  customerJourneyInstances,
  sampleRequests,
  swatchBookShipments,
  pressKitShipments,
  quoteEvents,
  priceListEvents,
  pressProfiles,
  customerActivityEvents,
  emailSends,
  shopifyOrders,
  followUpTasks,
  dripCampaignAssignments,
} from "@shared/schema";
import { eq } from "drizzle-orm";

type CustomerRecord = Awaited<ReturnType<typeof storage.getCustomer>>;

/** Count how many non-null top-level fields a customer record has (used as tiebreaker). */
function countFilledFields(c: CustomerRecord): number {
  if (!c) return 0;
  const fields = [
    c.firstName, c.lastName, c.email, c.phone, c.company,
    c.address1, c.city, c.province, c.zip, c.country,
    c.pricingTier, c.salesRepId, c.note, c.tags,
  ];
  return fields.filter(f => f !== null && f !== undefined && String(f).trim() !== '').length;
}

/**
 * Auto-merge two customer records without user input.
 * - If one has odooPartnerId, it becomes primary.
 * - Otherwise the record with more filled fields becomes primary.
 * - The secondary is deleted after all its related records are transferred.
 *
 * @returns { primaryId, secondaryId } after the merge, or throws on failure.
 */
export async function performAutoMerge(
  idA: string,
  idB: string
): Promise<{ primaryId: string; secondaryId: string }> {
  const [custA, custB] = await Promise.all([storage.getCustomer(idA), storage.getCustomer(idB)]);

  if (!custA || !custB) {
    throw new Error(`Auto-merge: one or both customers not found (${idA}, ${idB})`);
  }

  // Determine primary: Odoo takes precedence, then more-complete record.
  let primaryId: string;
  let secondaryId: string;
  if (custA.odooPartnerId && !custB.odooPartnerId) {
    primaryId = idA; secondaryId = idB;
  } else if (custB.odooPartnerId && !custA.odooPartnerId) {
    primaryId = idB; secondaryId = idA;
  } else {
    // Both or neither have Odoo — pick the more complete record
    primaryId = countFilledFields(custA) >= countFilledFields(custB) ? idA : idB;
    secondaryId = primaryId === idA ? idB : idA;
  }

  const primary = primaryId === idA ? custA : custB;
  const secondary = primaryId === idA ? custB : custA;

  // Build merged data: primary keeps its values, gaps filled from secondary
  const merged: any = { ...primary };
  if (!merged.phone && secondary.phone) merged.phone = secondary.phone;
  if (!merged.company && secondary.company) merged.company = secondary.company;
  if (!merged.address1 && secondary.address1) merged.address1 = secondary.address1;
  if (!merged.address2 && secondary.address2) merged.address2 = secondary.address2;
  if (!merged.city && secondary.city) merged.city = secondary.city;
  if (!merged.province && secondary.province) merged.province = secondary.province;
  if (!merged.country && secondary.country) merged.country = secondary.country;
  if (!merged.zip && secondary.zip) merged.zip = secondary.zip;
  if (!merged.pricingTier && secondary.pricingTier) merged.pricingTier = secondary.pricingTier;
  if (!merged.salesRepId && secondary.salesRepId) merged.salesRepId = secondary.salesRepId;
  if (!merged.note && secondary.note) merged.note = secondary.note;
  else if (merged.note && secondary.note && merged.note !== secondary.note) {
    merged.note = `${merged.note}\n\n--- Auto-merged from ${secondary.company || secondary.email} ---\n${secondary.note}`;
  }
  if (!merged.firstName && secondary.firstName) merged.firstName = secondary.firstName;
  if (!merged.lastName && secondary.lastName) merged.lastName = secondary.lastName;

  // Merge tags
  if (secondary.tags) {
    const primaryTags = merged.tags ? merged.tags.split(',').map((t: string) => t.trim()) : [];
    const secTags = secondary.tags.split(',').map((t: string) => t.trim());
    merged.tags = Array.from(new Set([...primaryTags, ...secTags])).filter(Boolean).join(', ');
  }

  // Merge sources
  const primarySources = merged.sources || [];
  const secSources = secondary.sources || [];
  merged.sources = Array.from(new Set([...primarySources, ...secSources]));

  // Combine order totals
  merged.totalOrders = (parseInt(String(merged.totalOrders)) || 0) + (parseInt(String(secondary.totalOrders)) || 0);
  merged.totalSpent = (parseFloat(String(merged.totalSpent)) || 0) + (parseFloat(String(secondary.totalSpent)) || 0);

  // Update primary with merged data
  await storage.updateCustomer(primaryId, merged);

  // Transfer all related records from secondary → primary
  await db.update(customerContacts).set({ customerId: primaryId }).where(eq(customerContacts.customerId, secondaryId));
  await db.update(customerJourney).set({ customerId: primaryId }).where(eq(customerJourney.customerId, secondaryId));
  await db.update(customerJourneyInstances).set({ customerId: primaryId }).where(eq(customerJourneyInstances.customerId, secondaryId));
  await db.update(sampleRequests).set({ customerId: primaryId }).where(eq(sampleRequests.customerId, secondaryId));
  await db.update(swatchBookShipments).set({ customerId: primaryId }).where(eq(swatchBookShipments.customerId, secondaryId));
  await db.update(pressKitShipments).set({ customerId: primaryId }).where(eq(pressKitShipments.customerId, secondaryId));
  await db.update(quoteEvents).set({ customerId: primaryId }).where(eq(quoteEvents.customerId, secondaryId));
  await db.update(priceListEvents).set({ customerId: primaryId }).where(eq(priceListEvents.customerId, secondaryId));
  await db.update(pressProfiles).set({ customerId: primaryId }).where(eq(pressProfiles.customerId, secondaryId));
  await db.update(customerActivityEvents).set({ customerId: primaryId }).where(eq(customerActivityEvents.customerId, secondaryId));
  await db.update(emailSends).set({ customerId: primaryId }).where(eq(emailSends.customerId, secondaryId));
  await db.update(shopifyOrders).set({ customerId: primaryId }).where(eq(shopifyOrders.customerId, secondaryId));
  await db.update(followUpTasks).set({ customerId: primaryId }).where(eq(followUpTasks.customerId, secondaryId));
  await db.update(dripCampaignAssignments).set({ customerId: primaryId }).where(eq(dripCampaignAssignments.customerId, secondaryId));

  // Delete the secondary (now safe — no FK violations remain)
  await storage.deleteCustomer(secondaryId);

  console.log(`[AutoMerge] Merged ${secondaryId} → ${primaryId} (email match, Odoo precedence)`);
  return { primaryId, secondaryId };
}
