import type { Express } from "express";
import { db } from "./db";
import { eq, sql, and, or, desc, asc, lte, isNull, isNotNull, ne, not, inArray } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./replitAuth";
import { normalizeEmail } from "@shared/email-normalizer";
import { odooClient } from "./odoo";
import { storage } from "./storage";
import { autoAssignSalesRepIfNeeded } from "./sales-rep-auto-assign";
import { getCachedData, setCachedData } from "./cache";
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
  sentQuotes,
  customerMachineProfiles,
  customerActivityEvents,
  emailSends,
  labelPrints,
  shopifyOrders,
  deletedCustomerExclusions,
  customerDoNotMerge,
  customerSyncQueue,
  leads,
  spotlightEvents,
  companies,
  domainAcknowledgments,
  LABEL_TYPE_LABELS,
} from "@shared/schema";

const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin',
  WY:'Wyoming', PR:'Puerto Rico', VI:'Virgin Islands',
};

function stateFilterVariants(canonical: string): string[] {
  const abbr = Object.entries(US_STATE_ABBR_TO_NAME).find(([, n]) => n.toLowerCase() === canonical.toLowerCase())?.[0];
  const variants = new Set<string>([canonical, `${canonical} (US)`, `${canonical} (CA)`]);
  if (abbr) { variants.add(abbr); variants.add(`${abbr} `); variants.add(`${abbr} (US)`); }
  return Array.from(variants);
}

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'aol.com','live.com','me.com','mac.com','googlemail.com',
  'protonmail.com','proton.me','ymail.com','msn.com','hotmail.es',
  'yahoo.es','live.com.mx','comcast.net','att.net','verizon.net',
]);

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const idx = email.lastIndexOf('@');
  if (idx === -1) return null;
  return email.slice(idx + 1).toLowerCase().trim();
}

export function registerCustomersRoutes(app: Express): void {
  app.get("/api/customers/:id/domain-check", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      const [company] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const contacts = await db.select()
        .from(customers)
        .where(and(
          eq(customers.parentCustomerId, id),
          eq(customers.isCompany, false),
        ));

      const domainCounts: Record<string, number> = {};
      for (const c of contacts) {
        const domain = extractDomain(c.email);
        if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        }
      }

      const companyEmailDomain = extractDomain(company.email);
      if (companyEmailDomain && !GENERIC_EMAIL_DOMAINS.has(companyEmailDomain)) {
        domainCounts[companyEmailDomain] = (domainCounts[companyEmailDomain] || 0) + 2;
      }

      let majorityDomain: string | null = null;
      let maxCount = 0;
      for (const [d, count] of Object.entries(domainCounts)) {
        if (count > maxCount) { maxCount = count; majorityDomain = d; }
      }

      const acks = await db.select()
        .from(domainAcknowledgments)
        .where(eq(domainAcknowledgments.companyId, id));
      const acknowledgedSet = new Set(acks.map(a => a.contactId));

      const results = contacts.map(c => {
        const domain = extractDomain(c.email);
        let status: 'match' | 'personal' | 'mismatch' | 'no_email' = 'no_email';
        if (domain) {
          if (GENERIC_EMAIL_DOMAINS.has(domain)) status = 'personal';
          else if (!majorityDomain || domain === majorityDomain) status = 'match';
          else status = 'mismatch';
        }
        return {
          contactId: c.id,
          name: c.firstName && c.lastName ? `${c.firstName} ${c.lastName}` : (c.company || c.email || 'Unknown'),
          email: c.email || null,
          domain,
          status,
          acknowledged: acknowledgedSet.has(c.id),
        };
      });

      res.json({
        majorityDomain,
        companyId: id,
        contacts: results,
        mismatchCount: results.filter(r => r.status === 'mismatch' && !r.acknowledged).length,
      });
    } catch (err) {
      console.error("Domain check error:", err);
      res.status(500).json({ error: "Failed to run domain check" });
    }
  });
  app.post("/api/customers/:companyId/contacts/:contactId/acknowledge-domain", isAuthenticated, async (req: any, res) => {
    try {
      const { companyId, contactId } = req.params;
      // Verify the contact actually belongs to this company (security guard)
      const [contact] = await db.select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.id, contactId),
          eq(customers.parentCustomerId, companyId),
          eq(customers.isCompany, false),
        ))
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found in this company" });
      const userEmail = req.user?.claims?.email || req.user?.email || null;
      await db.insert(domainAcknowledgments)
        .values({ companyId, contactId, acknowledgedBy: userEmail })
        .onConflictDoNothing();
      res.json({ ok: true });
    } catch (err) {
      console.error("Acknowledge domain error:", err);
      res.status(500).json({ error: "Failed to acknowledge" });
    }
  });
  app.post("/api/customers/:companyId/contacts/:contactId/move-standalone", isAuthenticated, async (req: any, res) => {
    try {
      const { companyId, contactId } = req.params;
      // Verify the contact is actually a child of this company before modifying
      const [existing] = await db.select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.id, contactId),
          eq(customers.parentCustomerId, companyId),
          eq(customers.isCompany, false),
        ))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Contact not found in this company" });
      await db.update(customers)
        .set({ parentCustomerId: null })
        .where(eq(customers.id, contactId));
      await db.delete(domainAcknowledgments)
        .where(and(eq(domainAcknowledgments.companyId, companyId), eq(domainAcknowledgments.contactId, contactId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("Move standalone error:", err);
      res.status(500).json({ error: "Failed to move contact" });
    }
  });
  app.get("/api/customers/domain-mismatch-contact-ids", isAuthenticated, async (req: any, res) => {
    try {
      const allContacts = await db.select({
        id: customers.id,
        email: customers.email,
        parentCustomerId: customers.parentCustomerId,
        isCompany: customers.isCompany,
      }).from(customers).where(and(
        eq(customers.isCompany, false),
        sql`${customers.parentCustomerId} IS NOT NULL`,
      ));

      const companyIds = [...new Set(allContacts.map(c => c.parentCustomerId).filter(Boolean))] as string[];
      if (!companyIds.length) return res.json({ contactIds: [] });

      const companyRecords = await db.select({ id: customers.id, email: customers.email })
        .from(customers)
        .where(inArray(customers.id, companyIds));

      // Use composite key "companyId:contactId" so acknowledgments are pair-scoped
      const acks = await db.select({
        companyId: domainAcknowledgments.companyId,
        contactId: domainAcknowledgments.contactId,
      }).from(domainAcknowledgments);
      const ackedSet = new Set(acks.map(a => `${a.companyId}:${a.contactId}`));

      const byCompany: Record<string, typeof allContacts> = {};
      for (const c of allContacts) {
        if (!c.parentCustomerId) continue;
        byCompany[c.parentCustomerId] ??= [];
        byCompany[c.parentCustomerId].push(c);
      }

      const companyEmailMap: Record<string, string | null> = {};
      for (const co of companyRecords) companyEmailMap[co.id] = co.email;

      const mismatchIds: string[] = [];
      for (const [cid, contacts] of Object.entries(byCompany)) {
        const domainCounts: Record<string, number> = {};
        const companyDomain = extractDomain(companyEmailMap[cid]);
        if (companyDomain && !GENERIC_EMAIL_DOMAINS.has(companyDomain)) {
          domainCounts[companyDomain] = (domainCounts[companyDomain] || 0) + 2;
        }
        for (const c of contacts) {
          const d = extractDomain(c.email);
          if (d && !GENERIC_EMAIL_DOMAINS.has(d)) domainCounts[d] = (domainCounts[d] || 0) + 1;
        }
        let majorityDomain: string | null = null;
        let maxCount = 0;
        for (const [d, count] of Object.entries(domainCounts)) {
          if (count > maxCount) { maxCount = count; majorityDomain = d; }
        }
        if (!majorityDomain) continue;
        for (const c of contacts) {
          const d = extractDomain(c.email);
          const compositeKey = `${cid}:${c.id}`;
          if (d && !GENERIC_EMAIL_DOMAINS.has(d) && d !== majorityDomain && !ackedSet.has(compositeKey)) {
            mismatchIds.push(c.id);
          }
        }
      }
      res.json({ contactIds: mismatchIds });
    } catch (err) {
      console.error("Domain mismatch contact IDs error:", err);
      res.status(500).json({ error: "Failed to get mismatch IDs" });
    }
  });
  app.get("/api/customers/:id/label-stats", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Get counts by label type for this customer
      const stats = await db.select({
        labelType: labelPrints.labelType,
        count: sql<number>`COUNT(*)::int`,
        totalQuantity: sql<number>`SUM(${labelPrints.quantity})::int`,
        lastPrintedAt: sql<string>`MAX(${labelPrints.createdAt})`,
      })
      .from(labelPrints)
      .where(eq(labelPrints.customerId, id))
      .groupBy(labelPrints.labelType);

      // Get recent prints for history
      const recentPrints = await db.select()
        .from(labelPrints)
        .where(eq(labelPrints.customerId, id))
        .orderBy(desc(labelPrints.createdAt))
        .limit(10);

      res.json({
        stats: stats.map(s => ({
          labelType: s.labelType,
          label: LABEL_TYPE_LABELS[s.labelType as keyof typeof LABEL_TYPE_LABELS] || s.labelType,
          count: s.count || 0,
          totalQuantity: s.totalQuantity || 0,
          lastPrintedAt: s.lastPrintedAt,
        })),
        recentPrints,
        total: stats.reduce((sum, s) => sum + (s.count || 0), 0)
      });
    } catch (error) {
      console.error("Label stats error:", error);
      res.status(500).json({ error: "Failed to fetch label stats" });
    }
  });
  app.get("/api/customers/:customerId/win-path", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;

      // Check if this customer has any Shopify orders
      const customerOrders = await db.select({
        id: shopifyOrders.id,
        orderNumber: shopifyOrders.orderNumber,
        totalPrice: shopifyOrders.totalPrice,
        shopifyCreatedAt: shopifyOrders.shopifyCreatedAt,
        financialStatus: shopifyOrders.financialStatus,
        lineItems: shopifyOrders.lineItems,
      })
        .from(shopifyOrders)
        .where(eq(shopifyOrders.customerId, customerId))
        .orderBy(asc(shopifyOrders.shopifyCreatedAt));

      if (customerOrders.length === 0) {
        return res.json({ hasWins: false, paths: [] });
      }

      // Get first email sent to this customer
      const firstEmail = await db.select({
        sentAt: emailSends.sentAt,
      })
        .from(emailSends)
        .where(and(
          eq(emailSends.customerId, customerId),
          eq(emailSends.status, 'sent')
        ))
        .orderBy(asc(emailSends.sentAt))
        .limit(1);

      const firstEmailDate = firstEmail.length > 0 ? new Date(firstEmail[0].sentAt) : null;

      // Find orders that came after the first email (wins)
      const winOrders = firstEmailDate
        ? customerOrders.filter(o => o.shopifyCreatedAt && new Date(o.shopifyCreatedAt) > firstEmailDate)
        : [];

      if (winOrders.length === 0) {
        return res.json({ hasWins: false, paths: [] });
      }

      // Batch-fetch all interaction data up to the latest win order in 3 queries
      const lastWinDate = new Date(winOrders[winOrders.length - 1].shopifyCreatedAt!);

      const [allEmails, allLabels, allActivities] = await Promise.all([
        db.select({
          id: emailSends.id,
          subject: emailSends.subject,
          sentAt: emailSends.sentAt,
          sentBy: emailSends.sentBy,
        }).from(emailSends).where(and(
          eq(emailSends.customerId, customerId),
          eq(emailSends.status, 'sent'),
          lte(emailSends.sentAt, lastWinDate)
        )).orderBy(asc(emailSends.sentAt)),

        db.select({
          id: labelPrints.id,
          labelType: labelPrints.labelType,
          createdAt: labelPrints.createdAt,
          printedByUserName: labelPrints.printedByUserName,
        }).from(labelPrints).where(and(
          eq(labelPrints.customerId, customerId),
          lte(labelPrints.createdAt, lastWinDate)
        )).orderBy(asc(labelPrints.createdAt)),

        db.select({
          id: customerActivityEvents.id,
          eventType: customerActivityEvents.eventType,
          title: customerActivityEvents.title,
          eventDate: customerActivityEvents.eventDate,
          createdByName: customerActivityEvents.createdByName,
          amount: customerActivityEvents.amount,
        }).from(customerActivityEvents).where(and(
          eq(customerActivityEvents.customerId, customerId),
          lte(customerActivityEvents.eventDate, lastWinDate),
          inArray(customerActivityEvents.eventType, [
            'call_made', 'quote_sent', 'sample_shipped', 'sample_delivered',
            'sample_feedback', 'meeting_completed', 'quote_accepted'
          ])
        )).orderBy(asc(customerActivityEvents.eventDate)),
      ]);

      const TYPE_LABELS: Record<string, string> = {
        swatch_book: 'Swatch Book Sent', press_test_kit: 'Press Test Kit Sent',
        mailer: 'Mailer Sent', letter: 'Letter Sent', other: 'Mail Sent',
      };
      const ACT_LABELS: Record<string, string> = {
        call_made: 'Phone Call', quote_sent: 'Quote Sent', sample_shipped: 'Sample Shipped',
        sample_delivered: 'Sample Delivered', sample_feedback: 'Sample Feedback',
        meeting_completed: 'Meeting', quote_accepted: 'Quote Accepted',
      };

      // Build paths by filtering pre-fetched data per order
      const paths = [];
      for (const order of winOrders) {
        const orderDate = new Date(order.shopifyCreatedAt!);
        const steps: any[] = [];

        for (const email of allEmails) {
          if (email.sentAt && new Date(email.sentAt) <= orderDate) {
            steps.push({ type: 'email', label: 'Email Sent', detail: email.subject || 'No subject', date: email.sentAt, by: email.sentBy });
          }
        }
        for (const label of allLabels) {
          if (label.createdAt && new Date(label.createdAt) <= orderDate) {
            steps.push({ type: label.labelType, label: TYPE_LABELS[label.labelType] || 'Mail Sent', detail: label.labelType.replace(/_/g, ' '), date: label.createdAt, by: label.printedByUserName });
          }
        }
        for (const act of allActivities) {
          if (act.eventDate && new Date(act.eventDate) <= orderDate) {
            steps.push({ type: act.eventType, label: ACT_LABELS[act.eventType] || act.eventType, detail: act.title, date: act.eventDate, by: act.createdByName });
          }
        }

        steps.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        steps.push({ type: 'order', label: 'Order Placed', detail: `Order ${order.orderNumber} — $${parseFloat(order.totalPrice || '0').toFixed(2)}`, date: order.shopifyCreatedAt, by: null });

        paths.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTotal: parseFloat(order.totalPrice || '0'),
          orderDate: order.shopifyCreatedAt,
          financialStatus: order.financialStatus,
          steps,
          daysToWin: steps.length > 1 ? Math.round((orderDate.getTime() - new Date(steps[0].date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        });
      }

      res.json({ hasWins: true, paths });
    } catch (error) {
      console.error("Error fetching win path:", error);
      res.status(500).json({ error: "Failed to fetch win path" });
    }
  });
  app.get("/api/customers/count", isAuthenticated, async (req: any, res) => {
    try {
      const customers = await storage.getCustomers();
      
      // Get machine profiles to check which customers have machines assigned
      const machineProfiles = await db.select({ customerId: customerMachineProfiles.customerId })
        .from(customerMachineProfiles);
      const customersWithMachines = new Set(machineProfiles.map(m => m.customerId));
      
      // Florida count
      const floridaCount = customers.filter(c => 
        c.province?.toUpperCase() === 'FL' || c.province?.toLowerCase() === 'florida'
      ).length;
      
      // Needs cleanup: missing email OR phone OR pricing tier OR machine profile
      const needsCleanupCount = customers.filter(c => {
        const missingEmail = !c.email || c.email.trim() === '';
        const missingPhone = !c.phone || c.phone.trim() === '';
        const missingPricingTier = !c.pricingTier || c.pricingTier.trim() === '';
        const missingMachine = !customersWithMachines.has(c.id);
        return missingEmail || missingPhone || missingPricingTier || missingMachine;
      }).length;
      
      // No sales rep assigned
      const noSalesRepCount = customers.filter(c => 
        !c.salesRepId || c.salesRepId.trim() === ''
      ).length;
      
      // Missing individual fields for detailed breakdown
      const missingEmailCount = customers.filter(c => !c.email || c.email.trim() === '').length;
      const missingPhoneCount = customers.filter(c => !c.phone || c.phone.trim() === '').length;
      const missingPricingTierCount = customers.filter(c => !c.pricingTier || c.pricingTier.trim() === '').length;
      const missingMachineCount = customers.filter(c => !customersWithMachines.has(c.id)).length;
      
      // Companies count (isCompany = true)
      const companiesCount = customers.filter(c => c.isCompany === true).length;
      
      res.json({ 
        total: customers.length,
        companies: companiesCount,
        florida: floridaCount,
        needsCleanup: needsCleanupCount,
        noSalesRep: noSalesRepCount,
        breakdown: {
          missingEmail: missingEmailCount,
          missingPhone: missingPhoneCount,
          missingPricingTier: missingPricingTierCount,
          missingMachine: missingMachineCount,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching customer count:", error);
      res.status(500).json({ error: "Failed to fetch customer count" });
    }
  });
  app.get("/api/customers", isAuthenticated, async (req, res) => {
    try {
      // Check if pagination mode is explicitly requested
      const usePagination = req.query.page !== undefined || req.query.limit !== undefined || req.query.paginated === 'true';
      
      if (usePagination) {
        // Paginated mode - return lean payload with pagination metadata
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        // Support both 'limit' and 'pageSize' as parameter names
        const limitParam = req.query.limit || req.query.pageSize;
        const limit = Math.min(100, Math.max(1, parseInt(limitParam as string) || 50));
        const search = req.query.search as string | undefined;
        
        // Parse filter params
        const filters: {
          salesRepId?: string;
          pricingTier?: string;
          province?: string;
          isHotProspect?: boolean;
          isCompany?: boolean;
          doNotContact?: boolean;
          city?: string;
          customerType?: string;
          hasAddress?: boolean;
          connectionStrength?: string;
          createdAfterDays?: number;
        } = {};
        
        if (req.query.salesRepId) filters.salesRepId = req.query.salesRepId as string;
        if (req.query.pricingTier) filters.pricingTier = req.query.pricingTier as string;
        if (req.query.province) {
          filters.province = req.query.province as string;
          (filters as any).provinceVariants = stateFilterVariants(req.query.province as string);
        }
        if (req.query.isHotProspect === 'true') filters.isHotProspect = true;
        if (req.query.isHotProspect === 'false') filters.isHotProspect = false;
        if (req.query.isCompany === 'true') filters.isCompany = true;
        if (req.query.isCompany === 'false') filters.isCompany = false;
        if (req.query.doNotContact === 'true') filters.doNotContact = true;
        if (req.query.doNotContact === 'false') filters.doNotContact = false;
        if (req.query.city) filters.city = req.query.city as string;
        if (req.query.customerType) filters.customerType = req.query.customerType as string;
        if (req.query.hasAddress === 'true') filters.hasAddress = true;
        if (req.query.connectionStrength) filters.connectionStrength = req.query.connectionStrength as string;
        if (req.query.createdAfterDays) filters.createdAfterDays = parseInt(req.query.createdAfterDays as string);
        
        const hasFilters = Object.keys(filters).length > 0;
        
        const result = await storage.getCustomersPaginated(page, limit, search, hasFilters ? filters : undefined);
        return res.json({
          customers: result.data,
          total: result.total,
          page: result.page,
          pageSize: result.limit,
        });
      }
      
      // Legacy mode - return full customer array (for backward compatibility)
      // Used by components that need all customers (dropdowns, search, dashboard stats)
      const cacheKey = "customers";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const customers = await storage.getCustomers();
      setCachedData(cacheKey, customers);
      return res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });
  app.put("/api/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = req.params.id;

      // Explicit allowlist — block mass-assignment of Odoo sync fields, system
      // timestamps, and read-only aggregates that only workers may write.
      const ALLOWED_FIELDS = new Set([
        'firstName', 'lastName', 'email', 'email2',
        'acceptsEmailMarketing', 'acceptsSmsMarketing', 'taxExempt',
        'company', 'address1', 'address2', 'city', 'province', 'country', 'zip',
        'phone', 'phone2', 'cell', 'website', 'defaultAddressPhone',
        'note', 'tags',
        'salesRepId', 'salesRepName',
        'pricingTier',
        'isHotProspect',
        'pausedUntil', 'pauseReason',
        'isCompany', 'contactType',
        'doNotContact', 'doNotContactReason',
        'customerType',
        'parentCustomerId',
      ]);

      const raw = req.body as Record<string, unknown>;
      const customerData: Record<string, unknown> = {};
      for (const key of ALLOWED_FIELDS) {
        if (raw[key] !== undefined) customerData[key] = raw[key];
      }

      console.log(`[Customer Update] PUT /api/customers/${customerId}`, {
        pricingTier: customerData.pricingTier,
        salesRepName: customerData.salesRepName,
        fieldsReceived: Object.keys(customerData)
      });

      // Get existing customer to check what changed
      const existingCustomer = await storage.getCustomer(customerId);
      const oldPricingTier = existingCustomer?.pricingTier;
      const newPricingTier = customerData.pricingTier as string | undefined;

      console.log(`[Customer Update] Tier change: ${oldPricingTier} -> ${newPricingTier}`);

      // Server-side: re-derive normalised email columns so client can't inject stale values
      if (customerData.email && typeof customerData.email === 'string') {
        customerData.emailNormalized = normalizeEmail(customerData.email);
      }
      if (customerData.email2 && typeof customerData.email2 === 'string') {
        customerData.email2Normalized = normalizeEmail(customerData.email2);
      }

      // Server-side: stamp who/when set the pricing tier (client must not control these)
      if (newPricingTier && newPricingTier !== oldPricingTier) {
        customerData.pricingTierSetBy = req.user?.claims?.email || req.user?.email || 'system';
        if (!existingCustomer?.pricingTierSetAt) {
          customerData.pricingTierSetAt = new Date();
        }
      }

      // Server-side: stamp doNotContact audit fields
      if (customerData.doNotContact === true && !existingCustomer?.doNotContact) {
        customerData.doNotContactSetBy = req.user?.claims?.email || req.user?.email || 'system';
        customerData.doNotContactSetAt = new Date();
      }

      // Convert allowed date strings to Date objects
      const timestampFields = ['pausedUntil'];
      for (const field of timestampFields) {
        if (customerData[field] !== undefined && customerData[field] !== null) {
          if (typeof customerData[field] === 'string') {
            customerData[field] = new Date(customerData[field] as string);
          }
        }
      }

      const customer = await storage.updateCustomer(customerId, customerData as any);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Auto-assign sales rep based on location rules if not already assigned
      // This handles cases where country/province is updated and triggers assignment
      if (!customer.salesRepId) {
        await autoAssignSalesRepIfNeeded(
          customer.id,
          customer.salesRepId,
          { country: customer.country, province: customer.province }
        );
      }
      
      // Queue pricing tier change for Odoo sync if tier changed
      if (newPricingTier && newPricingTier !== oldPricingTier && customer.odooPartnerId) {
        const tierTag = `Tier: ${newPricingTier}`;
        
        try {
          await db.insert(customerSyncQueue).values({
            customerId,
            odooPartnerId: customer.odooPartnerId,
            fieldName: 'comment',
            oldValue: oldPricingTier ? `Tier: ${oldPricingTier}` : null,
            newValue: tierTag,
            status: 'pending',
            changedBy: (req as any).user?.email || 'system',
          });
          console.log(`[Customer Update] Queued pricing tier change for Odoo sync: ${customer.odooPartnerId} -> ${newPricingTier}`);
        } catch (queueError) {
          console.error(`[Customer Update] Failed to queue Odoo sync:`, queueError);
          // Don't fail the request - local save succeeded
        }
        
        // Sync to Shopify immediately (while Odoo changes are queued for weekly sync)
        const sources = customer.sources || [];
        if (sources.includes('shopify')) {
          try {
            const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
            const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
            
            if (SHOPIFY_ACCESS_TOKEN && SHOPIFY_STORE_DOMAIN) {
              // Extract Shopify customer ID from our customer ID (format: shopify_XXXXX)
              const shopifyCustomerId = customer.id.startsWith('shopify_') 
                ? customer.id.replace('shopify_', '')
                : null;
              
              if (shopifyCustomerId) {
                const axios = (await import('axios')).default;
                
                // Get current customer tags from Shopify
                const getResponse = await axios.get(
                  `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/${shopifyCustomerId}.json`,
                  {
                    headers: {
                      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                
                const currentTags = getResponse.data.customer?.tags || '';
                const tagArray = currentTags.split(',').map((t: string) => t.trim()).filter((t: string) => t);
                
                // Remove any existing tier tags and add the new one
                const filteredTags = tagArray.filter((t: string) => !t.startsWith('Tier:'));
                filteredTags.push(tierTag);
                const newTags = filteredTags.join(', ');
                
                // Update customer tags in Shopify
                await axios.put(
                  `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/${shopifyCustomerId}.json`,
                  {
                    customer: {
                      id: shopifyCustomerId,
                      tags: newTags
                    }
                  },
                  {
                    headers: {
                      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                console.log(`[Pricing Tier Sync] Updated Shopify customer ${shopifyCustomerId} with tier: ${newPricingTier}`);
              }
            }
          } catch (shopifyError) {
            console.error(`[Pricing Tier Sync] Failed to sync to Shopify:`, shopifyError);
          }
        }
      }
      
      // BIDIRECTIONAL PROPAGATION: Sync pricing tier and sales rep between company and contacts
      // IMPORTANT: Propagate both salesRepId (for SPOTLIGHT filtering) AND salesRepName (for display)
      const updatedPricingTier = customer.pricingTier;
      const updatedSalesRepId = customer.salesRepId;
      const updatedSalesRepName = customer.salesRepName;
      
      // If this is a COMPANY, propagate pricing tier and sales rep to child contacts that don't have their own
      if (customer.isCompany && (updatedPricingTier || updatedSalesRepId || updatedSalesRepName)) {
        try {
          const childContacts = await db.select({ 
            id: customers.id, 
            pricingTier: customers.pricingTier, 
            salesRepId: customers.salesRepId,
            salesRepName: customers.salesRepName 
          })
            .from(customers)
            .where(eq(customers.parentCustomerId, customerId));
          
          for (const child of childContacts) {
            const updates: Record<string, any> = {};
            if (updatedPricingTier && !child.pricingTier) {
              updates.pricingTier = updatedPricingTier;
            }
            // Propagate both salesRepId AND salesRepName for SPOTLIGHT task assignment
            if (updatedSalesRepId && !child.salesRepId) {
              updates.salesRepId = updatedSalesRepId;
            }
            if (updatedSalesRepName && !child.salesRepName) {
              updates.salesRepName = updatedSalesRepName;
            }
            if (Object.keys(updates).length > 0) {
              await db.update(customers).set(updates).where(eq(customers.id, child.id));
            }
          }
        } catch (propError) {
          console.error('[Propagation] Error propagating to child contacts:', propError);
        }
      }
      
      // If this is a CONTACT with a parent company, propagate UP if company is missing data
      if (customer.parentCustomerId && (updatedPricingTier || updatedSalesRepId || updatedSalesRepName)) {
        try {
          const [parentCompany] = await db.select()
            .from(customers)
            .where(eq(customers.id, customer.parentCustomerId))
            .limit(1);
          
          if (parentCompany) {
            const updates: Record<string, any> = {};
            if (updatedPricingTier && !parentCompany.pricingTier) {
              updates.pricingTier = updatedPricingTier;
            }
            // Propagate both salesRepId AND salesRepName for SPOTLIGHT task assignment
            if (updatedSalesRepId && !parentCompany.salesRepId) {
              updates.salesRepId = updatedSalesRepId;
            }
            if (updatedSalesRepName && !parentCompany.salesRepName) {
              updates.salesRepName = updatedSalesRepName;
            }
            if (Object.keys(updates).length > 0) {
              await db.update(customers).set(updates).where(eq(customers.id, parentCompany.id));
            }
          }
        } catch (propError) {
          console.error('[Propagation] Error propagating to parent company:', propError);
        }
      }
      
      // EMAIL DOMAIN PROPAGATION: When pricing tier changes, apply the LOWEST (most favorable) tier across all same-domain contacts
      if (newPricingTier && customer.email) {
        try {
          const emailDomain = customer.email.split('@')[1]?.toLowerCase();
          const genericDomains = ['gmail.com', 'yahoo.com', 'aol.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'msn.com', 'live.com', 'ymail.com', 'protonmail.com', 'zoho.com', 'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net', 'charter.net', 'earthlink.net', 'me.com', 'mac.com'];
          
          if (emailDomain && !genericDomains.includes(emailDomain)) {
            // Find the lowest (most favorable = smallest index) tier across ALL domain contacts
            const tierOrder = ['LANDED PRICE','EXPORT ONLY','DISTRIBUTOR','DEALER-VIP','DEALER','SHOPIFY LOWEST','SHOPIFY3','SHOPIFY2','SHOPIFY1','SHOPIFY-ACCOUNT','RETAIL'];
            const tierOrderSql = sql.raw(`ARRAY['${tierOrder.join("','")}']::text[]`);

            const [lowestResult] = await db.select({
              lowestTier: sql<string>`(${tierOrderSql})[MIN(ARRAY_POSITION(${tierOrderSql}, ${customers.pricingTier}))]`,
            })
              .from(customers)
              .where(and(
                sql`LOWER(SPLIT_PART(COALESCE(${customers.email}, ''), '@', 2)) = ${emailDomain}`,
                isNotNull(customers.pricingTier),
              ));

            const lowestTier = lowestResult?.lowestTier;
            if (lowestTier) {
              // Update ALL domain contacts that have null or a worse (higher-index) tier
              const result = await db.update(customers)
                .set({ pricingTier: lowestTier })
                .where(and(
                  sql`LOWER(SPLIT_PART(COALESCE(${customers.email}, ''), '@', 2)) = ${emailDomain}`,
                  or(
                    isNull(customers.pricingTier),
                    sql`ARRAY_POSITION(${tierOrderSql}, ${customers.pricingTier}) > ARRAY_POSITION(${tierOrderSql}, ${lowestTier}::text)`,
                  ),
                ));
              console.log(`[Domain Pricing] Applied lowest tier ${lowestTier} to all @${emailDomain} contacts`);
            }
          }
        } catch (domainPropError) {
          console.error('[Domain Pricing Propagation] Error:', domainPropError);
        }
      }

      // Clear cache to ensure fresh data
      setCachedData("customers", null);
      
      res.json(customer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });
  app.get("/api/customers/quote-counts", isAuthenticated, async (req, res) => {
    try {
      const counts = await storage.getQuoteCountsByCustomerEmail();
      res.json(counts);
    } catch (error) {
      console.error("Error fetching quote counts:", error);
      res.status(500).json({ error: "Failed to fetch quote counts" });
    }
  });
  app.get("/api/customers/price-list-counts", isAuthenticated, async (req, res) => {
    try {
      const counts = await storage.getPriceListCountsByCustomerId();
      res.json(counts);
    } catch (error) {
      console.error("Error fetching price list counts:", error);
      res.status(500).json({ error: "Failed to fetch price list counts" });
    }
  });
  app.post("/api/labels/bulk-email", isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds, leadIds, subject, body } = req.body;
      if (!subject || !body) return res.status(400).json({ error: 'subject and body are required' });

      const userId = (req.user as any)?.claims?.sub || req.user?.id;
      const { sendEmailAsUser, getUserGmailConnection } = await import('./user-gmail-oauth');
      const { sendEmail } = await import('./gmail-client');

      const userGmailConnection = userId ? await getUserGmailConnection(userId).catch(() => null) : null;
      const usePersonalGmail = !!(userGmailConnection?.isActive && userGmailConnection.scope?.includes('gmail.send'));

      let sent = 0, failed = 0;

      // Send to customers
      if (Array.isArray(customerIds) && customerIds.length > 0) {
        const selectedCustomers = await db.select().from(customers).where(inArray(customers.id, customerIds));
        for (const c of selectedCustomers) {
          if (!c.email) { failed++; continue; }
          try {
            const name = c.company || [c.firstName, c.lastName].filter(Boolean).join(' ') || '';
            const personalized = (s: string) => s.replace(/\{\{name\}\}/g, name).replace(/\{\{company\}\}/g, c.company || '');
            if (usePersonalGmail) await sendEmailAsUser(userGmailConnection, c.email, personalized(subject), personalized(body));
            else await sendEmail(c.email, personalized(subject), personalized(body));
            await db.update(customers).set({ lastOutboundEmailAt: new Date(), updatedAt: new Date() }).where(eq(customers.id, c.id));
            sent++;
          } catch { failed++; }
        }
      }

      // Send to leads
      if (Array.isArray(leadIds) && leadIds.length > 0) {
        const { leads } = await import('@shared/schema');
        const selectedLeads = await db.select().from(leads).where(inArray(leads.id, leadIds));
        for (const l of selectedLeads) {
          if (!l.email) { failed++; continue; }
          try {
            const personalized = (s: string) => s.replace(/\{\{name\}\}/g, l.name || l.company || '').replace(/\{\{company\}\}/g, l.company || '');
            if (usePersonalGmail) await sendEmailAsUser(userGmailConnection, l.email, personalized(subject), personalized(body));
            else await sendEmail(l.email, personalized(subject), personalized(body));
            await db.update(leads).set({ lastContactAt: new Date() }).where(eq(leads.id, l.id));
            sent++;
          } catch { failed++; }
        }
      }

      res.json({ sent, failed });
    } catch (error: any) {
      console.error('[Labels Bulk Email]', error);
      res.status(500).json({ error: 'Bulk email failed' });
    }
  });

  app.get("/api/customers/needs-review", isAuthenticated, async (_req, res) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const reviewCustomers = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          company: customers.company,
          email: customers.email,
          phone: customers.phone,
          pricingTier: customers.pricingTier,
          salesRepName: customers.salesRepName,
          totalSpent: customers.totalSpent,
          totalOrders: customers.totalOrders,
          isHotProspect: customers.isHotProspect,
          lastOutboundEmailAt: customers.lastOutboundEmailAt,
          swatchbookSentAt: customers.swatchbookSentAt,
          updatedAt: customers.updatedAt,
          province: customers.province,
          country: customers.country,
        })
        .from(customers)
        .where(
          and(
            eq(customers.isCompany, true),
            eq(customers.doNotContact, false),
            or(
              isNull(customers.lastOutboundEmailAt),
              lte(customers.lastOutboundEmailAt, thirtyDaysAgo)
            ),
            // Exclude active buyers whose records were recently updated (via Odoo sync etc.)
            // — if they have orders AND their record was touched in the last 30 days, they are
            // still in active contact even if no email was sent through this system.
            or(
              isNull(customers.totalOrders),
              eq(customers.totalOrders, 0),
              lte(customers.updatedAt, thirtyDaysAgo)
            )
          )
        )
        .orderBy(customers.lastOutboundEmailAt)
        .limit(100);

      res.json({ customers: reviewCustomers, count: reviewCustomers.length });
    } catch (error) {
      console.error("Error fetching customers for review:", error);
      res.status(500).json({ error: "Failed to fetch customers for review" });
    }
  });
  app.get("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });
  app.get("/api/customers/:id/navigation", isAuthenticated, async (req, res) => {
    try {
      const currentId = req.params.id;
      
      // Get current record to find its display name for sorting context
      const currentCustomer = await storage.getCustomer(currentId);
      if (!currentCustomer) {
        return res.json({ prevId: null, prevName: null, nextId: null, nextName: null });
      }
      
      // Use company name if available, otherwise fall back to first+last name
      const displayNameExpr = sql`LOWER(TRIM(COALESCE(NULLIF(${customers.company},''), TRIM(CONCAT(${customers.firstName},' ',${customers.lastName})), '')))`;
      const currentName = (
        currentCustomer.company?.trim() ||
        `${currentCustomer.firstName || ''} ${currentCustomer.lastName || ''}`.trim() ||
        ''
      ).toLowerCase();
      
      // Find prev record (largest display name strictly less than current)
      const prevResult = await db
        .select({ id: customers.id, company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
        .from(customers)
        .where(sql`${displayNameExpr} < ${currentName}`)
        .orderBy(desc(displayNameExpr))
        .limit(1);
      
      // Find next record (smallest display name strictly greater than current)
      const nextResult = await db
        .select({ id: customers.id, company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
        .from(customers)
        .where(sql`${displayNameExpr} > ${currentName}`)
        .orderBy(asc(displayNameExpr))
        .limit(1);

      const prevRecord = prevResult[0];
      const nextRecord = nextResult[0];
      const buildName = (r: typeof prevRecord | undefined) => {
        if (!r) return null;
        return r.company?.trim() || `${r.firstName || ''} ${r.lastName || ''}`.trim() || null;
      };
      
      res.json({
        prevId: prevRecord?.id || null,
        prevName: buildName(prevRecord),
        nextId: nextRecord?.id || null,
        nextName: buildName(nextRecord),
      });
    } catch (error) {
      console.error("Error fetching customer navigation:", error);
      res.status(500).json({ error: "Failed to fetch navigation" });
    }
  });
  app.get("/api/customers/:id/overview", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.params.id;
      
      // Parallel fetch for first paint data only
      const [customer, recentActivity, pendingTasks, recentQuotes] = await Promise.all([
        storage.getCustomer(customerId),
        storage.getActivityEventsByCustomer(customerId).then(events => events.slice(0, 5)),
        storage.getFollowUpTasksByCustomer(customerId).then(tasks => tasks.filter(t => t.status === 'pending').slice(0, 3)),
        db.select().from(sentQuotes).where(eq(sentQuotes.customerId, customerId)).orderBy(desc(sentQuotes.createdAt)).limit(3),
      ]);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Compute quick stats
      const stats = {
        totalQuotes: await db.select({ count: sql<number>`count(*)` }).from(sentQuotes).where(eq(sentQuotes.customerId, customerId)).then(r => Number(r[0]?.count) || 0),
        totalActivities: await db.select({ count: sql<number>`count(*)` }).from(customerActivityEvents).where(eq(customerActivityEvents.customerId, customerId)).then(r => Number(r[0]?.count) || 0),
        pendingTaskCount: pendingTasks.length,
      };
      
      res.json({
        customer,
        recentActivity,
        pendingTasks,
        recentQuotes,
        stats,
      });
    } catch (error) {
      console.error("Error fetching customer overview:", error);
      res.status(500).json({ error: "Failed to fetch customer overview" });
    }
  });
  app.get("/api/customers/:id/trust-metrics", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.params.id;
      
      // Get all completed spotlight events for this customer
      const allEvents = await db.select({
        metadata: spotlightEvents.metadata
      })
        .from(spotlightEvents)
        .where(and(
          eq(spotlightEvents.customerId, customerId),
          eq(spotlightEvents.eventType, 'completed')
        ));
      
      // Count outcomes by category
      const callOutcomes = new Set(['called', 'connected', 'voicemail', 'left_voicemail', 'no_answer']);
      const sampleOutcomes = new Set(['send_swatchbook', 'send_press_test', 'swatchbook_sent', 'press_test_sent', 'sample_sent']);
      const emailOutcomes = new Set(['email_sent', 'sent_email', 'compose_email']);
      
      let calls = 0, samples = 0, emails = 0;
      for (const event of allEvents) {
        const meta = event.metadata as any;
        const outcome = meta?.outcomeId || meta?.outcome || '';
        if (callOutcomes.has(outcome)) calls++;
        else if (sampleOutcomes.has(outcome)) samples++;
        else if (emailOutcomes.has(outcome)) emails++;
      }
      
      // Get orders total from sent quotes (as a proxy for order value)
      const orderStats = await db.select({
        totalValue: sql<number>`COALESCE(SUM(total_amount), 0)`,
        orderCount: sql<number>`COUNT(*)`
      }).from(sentQuotes).where(eq(sentQuotes.customerId, customerId));
      
      const orders = orderStats[0] || { totalValue: 0, orderCount: 0 };
      
      res.json({
        calls,
        samples,
        emails,
        ordersValue: Number(orders.totalValue) || 0,
        ordersCount: Number(orders.orderCount) || 0,
      });
    } catch (error) {
      console.error("Error fetching customer trust metrics:", error);
      res.status(500).json({ error: "Failed to fetch trust metrics" });
    }
  });
  app.post("/api/customers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const customer = req.body;
      
      if (!customer.id || !customer.id.trim()) {
        return res.status(400).json({ error: "Customer ID is required" });
      }

      // Check if customer already exists by ID
      const existingById = await storage.getCustomer(customer.id);
      if (existingById) {
        return res.status(409).json({ error: "Customer with this ID already exists" });
      }

      // Check for duplicates by email, phone, or company name
      const allCustomers = await storage.getAllCustomers();
      
      // Check for duplicate email
      if (customer.email && customer.email.trim()) {
        const emailLower = customer.email.toLowerCase().trim();
        const duplicateByEmail = allCustomers.find(c => 
          c.email && c.email.toLowerCase().trim() === emailLower
        );
        if (duplicateByEmail) {
          const displayName = duplicateByEmail.company || `${duplicateByEmail.firstName} ${duplicateByEmail.lastName}`.trim() || duplicateByEmail.email;
          return res.status(409).json({ 
            error: `A client with this email already exists: "${displayName}"`,
            duplicateId: duplicateByEmail.id,
            duplicateField: 'email'
          });
        }
      }
      
      // Check for duplicate phone
      if (customer.phone && customer.phone.trim()) {
        const phoneNormalized = customer.phone.replace(/\D/g, '');
        if (phoneNormalized.length >= 7) {
          const duplicateByPhone = allCustomers.find(c => 
            c.phone && c.phone.replace(/\D/g, '') === phoneNormalized
          );
          if (duplicateByPhone) {
            const displayName = duplicateByPhone.company || `${duplicateByPhone.firstName} ${duplicateByPhone.lastName}`.trim() || duplicateByPhone.phone;
            return res.status(409).json({ 
              error: `A client with this phone number already exists: "${displayName}"`,
              duplicateId: duplicateByPhone.id,
              duplicateField: 'phone'
            });
          }
        }
      }
      
      // Check for duplicate company name (exact match, case-insensitive)
      // Only applies when creating a company entity (isCompany=true), NOT when the
      // "company" field is just the employer name on an individual contact record.
      if (customer.isCompany && customer.company && customer.company.trim()) {
        const companyLower = customer.company.toLowerCase().trim();
        const duplicateByCompany = allCustomers.find(c => 
          c.isCompany && c.company && c.company.toLowerCase().trim() === companyLower
        );
        if (duplicateByCompany) {
          return res.status(409).json({ 
            error: `A client with this company name already exists: "${duplicateByCompany.company}"`,
            duplicateId: duplicateByCompany.id,
            duplicateField: 'company'
          });
        }
      }

      let createdCustomer = await storage.createCustomer(customer);
      
      // EMAIL DOMAIN PROPAGATION on create: inherit the LOWEST (most favorable) tier from same-domain contacts
      if (!createdCustomer.pricingTier && createdCustomer.email) {
        try {
          const emailDomain = createdCustomer.email.split('@')[1]?.toLowerCase();
          const genericDomains = ['gmail.com','yahoo.com','aol.com','hotmail.com','outlook.com','icloud.com','mail.com','msn.com','live.com','ymail.com','protonmail.com','zoho.com','comcast.net','att.net','verizon.net','sbcglobal.net','cox.net','charter.net','earthlink.net','me.com','mac.com'];
          if (emailDomain && !genericDomains.includes(emailDomain)) {
            const tierOrder = ['LANDED PRICE','EXPORT ONLY','DISTRIBUTOR','DEALER-VIP','DEALER','SHOPIFY LOWEST','SHOPIFY3','SHOPIFY2','SHOPIFY1','SHOPIFY-ACCOUNT','RETAIL'];
            const tierOrderSql = sql.raw(`ARRAY['${tierOrder.join("','")}']::text[]`);
            const [lowestResult] = await db.select({
              lowestTier: sql<string>`(${tierOrderSql})[MIN(ARRAY_POSITION(${tierOrderSql}, ${customers.pricingTier}))]`,
            })
              .from(customers)
              .where(and(
                sql`LOWER(SPLIT_PART(COALESCE(${customers.email}, ''), '@', 2)) = ${emailDomain}`,
                isNotNull(customers.pricingTier),
                ne(customers.id, createdCustomer.id),
              ));
            if (lowestResult?.lowestTier) {
              await db.update(customers).set({ pricingTier: lowestResult.lowestTier }).where(eq(customers.id, createdCustomer.id));
              createdCustomer = { ...createdCustomer, pricingTier: lowestResult.lowestTier };
              console.log(`[Domain Pricing] New customer ${createdCustomer.email} inherited lowest tier ${lowestResult.lowestTier} from domain @${emailDomain}`);
            }
          }
        } catch (domainErr) {
          console.error('[Domain Pricing] Error on create propagation:', domainErr);
        }
      }

      // Auto-link contact to parent company if company name matches an existing company record
      if (!createdCustomer.isCompany && createdCustomer.company && !createdCustomer.parentCustomerId) {
        try {
          const companyLower = createdCustomer.company.toLowerCase().trim();
          if (companyLower) {
            const [parentCompany] = await db.select({ id: customers.id, salesRepId: customers.salesRepId, salesRepName: customers.salesRepName, pricingTier: customers.pricingTier })
              .from(customers)
              .where(and(
                eq(customers.isCompany, true),
                sql`LOWER(TRIM(COALESCE(${customers.company}, ''))) = ${companyLower}`
              ))
              .limit(1);
            if (parentCompany) {
              const inherit: Record<string, any> = { parentCustomerId: parentCompany.id };
              if (!createdCustomer.salesRepId && parentCompany.salesRepId) {
                inherit.salesRepId = parentCompany.salesRepId;
                inherit.salesRepName = parentCompany.salesRepName;
              }
              if (!createdCustomer.pricingTier && parentCompany.pricingTier) {
                inherit.pricingTier = parentCompany.pricingTier;
              }
              await db.update(customers).set(inherit).where(eq(customers.id, createdCustomer.id));
              createdCustomer = { ...createdCustomer, ...inherit };
              console.log(`[Auto-Link] Contact ${createdCustomer.id} linked to parent company ${parentCompany.id}`);
            }
          }
        } catch (linkErr) {
          console.error('[Auto-Link] Error linking contact to company:', linkErr);
        }
      }

      // Auto-assign sales rep based on location rules if not already assigned
      if (!createdCustomer.salesRepId) {
        const assignResult = await autoAssignSalesRepIfNeeded(
          createdCustomer.id,
          createdCustomer.salesRepId,
          { country: createdCustomer.country, province: createdCustomer.province }
        );
        if (assignResult.assigned && assignResult.rep) {
          // Return the updated customer with the assigned rep
          const updatedCustomer = await storage.getCustomer(createdCustomer.id);
          return res.status(201).json(updatedCustomer);
        }
      }
      
      res.status(201).json(createdCustomer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });
  app.put("/api/customers/:id/sales-rep", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const { salesRepId, salesRepName } = req.body;
      
      // Validate required fields
      if (!salesRepId || !salesRepName) {
        return res.status(400).json({ error: "salesRepId and salesRepName are required" });
      }
      
      // Check if customer exists
      const existingCustomer = await storage.getCustomer(customerId);
      if (!existingCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const previousSalesRepId = existingCustomer.salesRepId;
      const previousSalesRepName = existingCustomer.salesRepName;

      // Only update the sales rep fields
      const updatedCustomer = await storage.updateCustomer(customerId, {
        salesRepId,
        salesRepName,
        updatedAt: new Date()
      });
      
      // Clear cache to ensure fresh data for NOW MODE
      setCachedData("customers", null);
      
      // Log the reassignment for tracking
      if (previousSalesRepId !== salesRepId) {
        console.log(`[Sales Rep Reassignment] Customer ${customerId} (${existingCustomer.company || existingCustomer.email}) reassigned from ${previousSalesRepName || previousSalesRepId || 'unassigned'} to ${salesRepName} (${salesRepId})`);
        
        // Log activity for the reassignment
        await storage.logActivity({
          userId: req.user?.id || 'system',
          userEmail: req.user?.email || 'system',
          userRole: req.user?.role || 'admin',
          action: 'customer_reassigned',
          actionType: 'crm',
          description: `Customer ${existingCustomer.company || existingCustomer.email} reassigned from ${previousSalesRepName || 'unassigned'} to ${salesRepName}`,
          targetId: customerId,
          targetType: 'customer',
          metadata: { 
            previousSalesRepId, 
            previousSalesRepName, 
            newSalesRepId: salesRepId, 
            newSalesRepName: salesRepName 
          },
        });
      }
      
      // BIDIRECTIONAL PROPAGATION: When a company is assigned a rep, propagate to child contacts
      // When a contact is assigned a rep, propagate UP to parent company if missing
      if (existingCustomer.isCompany) {
        // Propagate DOWN to child contacts that don't have a sales rep
        try {
          const childContacts = await db.select({ 
            id: customers.id, 
            salesRepId: customers.salesRepId,
            salesRepName: customers.salesRepName 
          })
            .from(customers)
            .where(eq(customers.parentCustomerId, customerId));
          
          for (const child of childContacts) {
            if (!child.salesRepId) {
              await db.update(customers).set({
                salesRepId,
                salesRepName,
                updatedAt: new Date()
              }).where(eq(customers.id, child.id));
              console.log(`[Sales Rep Propagation] Company ${existingCustomer.company} -> Contact ${child.id}: assigned to ${salesRepName}`);
            }
          }
        } catch (propError) {
          console.error('[Sales Rep Propagation] Error propagating to child contacts:', propError);
        }
      } else if (existingCustomer.parentCustomerId) {
        // Propagate UP to parent company if it doesn't have a sales rep
        try {
          const [parentCompany] = await db.select({
            id: customers.id,
            company: customers.company,
            salesRepId: customers.salesRepId
          })
            .from(customers)
            .where(eq(customers.id, existingCustomer.parentCustomerId))
            .limit(1);
          
          if (parentCompany && !parentCompany.salesRepId) {
            await db.update(customers).set({
              salesRepId,
              salesRepName,
              updatedAt: new Date()
            }).where(eq(customers.id, parentCompany.id));
            console.log(`[Sales Rep Propagation] Contact ${customerId} -> Company ${parentCompany.company}: assigned to ${salesRepName}`);
          }
        } catch (propError) {
          console.error('[Sales Rep Propagation] Error propagating to parent company:', propError);
        }
      }
      
      res.json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer sales rep:", error);
      res.status(500).json({ error: "Failed to update customer sales rep" });
    }
  });
  app.delete("/api/customers/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const inputId = req.params.id;
      const reason = req.query.reason as string | undefined;
      
      // Try to find customer by direct ID first, then by odooPartnerId if numeric
      let customer;
      let customerId = inputId;
      
      // First try direct ID lookup
      const [directMatch] = await db.select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        odooPartnerId: customers.odooPartnerId,
      }).from(customers).where(eq(customers.id, inputId)).limit(1);
      
      if (directMatch) {
        customer = directMatch;
      } else {
        // If not found and input is numeric, try looking up by odooPartnerId
        const numericId = parseInt(inputId, 10);
        if (!isNaN(numericId)) {
          const [odooMatch] = await db.select({
            id: customers.id,
            company: customers.company,
            firstName: customers.firstName,
            lastName: customers.lastName,
            email: customers.email,
            odooPartnerId: customers.odooPartnerId,
          }).from(customers).where(eq(customers.odooPartnerId, numericId)).limit(1);
          
          if (odooMatch) {
            customer = odooMatch;
            customerId = odooMatch.id; // Use the actual UUID for deletion
            console.log(`[Customer Delete] Resolved Odoo ID ${inputId} to customer UUID ${customerId}`);
          }
        }
      }
      
      if (!customer) {
        console.log(`[Customer Delete] Customer not found with ID: ${inputId}`);
        return res.status(404).json({ error: "Customer not found", requestedId: inputId });
      }
      
      // Check if this is a Shopify customer (ID starts with 'shopify_')
      const shopifyCustomerId = customerId.startsWith('shopify_') 
        ? customerId.replace('shopify_', '') 
        : null;
      
      // Record exclusion to prevent re-import from Odoo or Shopify
      if (customer.odooPartnerId || shopifyCustomerId) {
        await db.insert(deletedCustomerExclusions).values({
          odooPartnerId: customer.odooPartnerId || null,
          shopifyCustomerId: shopifyCustomerId,
          originalCustomerId: customerId,
          companyName: customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          email: customer.email,
          deletedBy: req.user?.email || 'unknown',
          reason: reason || null,
        });
        console.log(`[Customer Delete] Recorded exclusion for ${customer.company || customer.email} (Odoo: ${customer.odooPartnerId}, Shopify: ${shopifyCustomerId})`);
      }

      // Also delete from Odoo if linked
      let odooDeleted = false;
      if (customer.odooPartnerId) {
        try {
          await odooClient.unlink('res.partner', [customer.odooPartnerId]);
          console.log(`[Customer Delete] Deleted partner ${customer.odooPartnerId} from Odoo`);
          odooDeleted = true;
        } catch (odooError: any) {
          console.error(`[Customer Delete] Failed to delete from Odoo (continuing with local delete):`, odooError.message);
          // Continue with local delete even if Odoo delete fails
        }
      }

      const deleteResult = await storage.deleteCustomer(customerId);
      if (!deleteResult) {
        return res.status(404).json({ error: "Customer not found" });
      }

      setCachedData("customers", null);
      res.json({ 
        message: "Customer deleted successfully", 
        excluded: !!(customer.odooPartnerId || shopifyCustomerId),
        odooDeleted
      });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });
  app.post("/api/customers/merge", isAuthenticated, async (req: any, res) => {
    try {
      const { targetId, sourceId, fieldSelections } = req.body;
      
      if (!targetId || !sourceId) {
        return res.status(400).json({ error: "Both targetId and sourceId are required" });
      }
      
      // Reject lead-prefixed IDs - leads don't use the customer merge system
      if (targetId.startsWith('lead-') || sourceId.startsWith('lead-')) {
        return res.status(400).json({ error: "Cannot merge leads. This feature is only for customer duplicates." });
      }
      
      const targetCustomer = await storage.getCustomer(targetId);
      const sourceCustomer = await storage.getCustomer(sourceId);
      
      if (!targetCustomer) {
        return res.status(404).json({ error: "Target customer not found" });
      }
      if (!sourceCustomer) {
        return res.status(404).json({ error: "Source customer not found" });
      }
      
      // Start with target customer as base
      const mergedData: any = { ...targetCustomer };
      
      // If fieldSelections provided, use user's choices for each field
      if (fieldSelections && typeof fieldSelections === 'object') {
        const fieldMapping: Record<string, string> = {
          firstName: 'firstName',
          lastName: 'lastName',
          email: 'email',
          email2: 'email2',
          phone: 'phone',
          company: 'company',
          salesRep: 'salesRep',
          pricingTier: 'pricingTier',
          address1: 'address1',
          city: 'city',
          province: 'province',
          country: 'country',
          postalCode: 'zip',
          zip: 'zip',
          notes: 'note',
          note: 'note',
          tags: 'tags',
        };
        
        for (const [fieldKey, selectedValue] of Object.entries(fieldSelections)) {
          const dbField = fieldMapping[fieldKey] || fieldKey;
          
          // Special handling for email fields - value is the actual email string
          if (fieldKey === 'email' || fieldKey === 'email2') {
            if (selectedValue === 'none') {
              // User chose to clear this email field
              mergedData[dbField] = null;
            } else if (typeof selectedValue === 'string' && selectedValue.includes('@')) {
              // User selected a specific email address
              mergedData[dbField] = selectedValue;
            } else if (selectedValue === sourceId) {
              // Legacy: user chose value from source customer
              mergedData[dbField] = (sourceCustomer as any)[dbField];
            }
            // If selectedValue === targetId, keep target's value (already in mergedData)
          } else if (selectedValue === sourceId) {
            // User chose value from source customer
            mergedData[dbField] = (sourceCustomer as any)[dbField];
          }
          // If selectedValue === targetId, keep target's value (already in mergedData)
        }
      } else {
        // Fallback: auto-fill missing fields from source
        if (!mergedData.phone && sourceCustomer.phone) mergedData.phone = sourceCustomer.phone;
        if (!mergedData.email && sourceCustomer.email) {
          mergedData.email = sourceCustomer.email;
        } else if (mergedData.email && sourceCustomer.email && mergedData.email !== sourceCustomer.email) {
          // Both have different emails - auto-keep both
          mergedData.email2 = sourceCustomer.email;
        }
        // Preserve any existing email2 from either customer
        if (!mergedData.email2 && sourceCustomer.email2) {
          mergedData.email2 = sourceCustomer.email2;
        }
        if (!mergedData.company && sourceCustomer.company) mergedData.company = sourceCustomer.company;
        if (!mergedData.city && sourceCustomer.city) mergedData.city = sourceCustomer.city;
        if (!mergedData.province && sourceCustomer.province) mergedData.province = sourceCustomer.province;
        if (!mergedData.country && sourceCustomer.country) mergedData.country = sourceCustomer.country;
        if (!mergedData.address1 && sourceCustomer.address1) mergedData.address1 = sourceCustomer.address1;
        if (!mergedData.address2 && sourceCustomer.address2) mergedData.address2 = sourceCustomer.address2;
        if (!mergedData.zip && sourceCustomer.zip) mergedData.zip = sourceCustomer.zip;
        
        // Merge tags
        if (sourceCustomer.tags) {
          const targetTags = mergedData.tags ? mergedData.tags.split(',').map((t: string) => t.trim()) : [];
          const sourceTags = sourceCustomer.tags.split(',').map((t: string) => t.trim());
          const allTags = Array.from(new Set([...targetTags, ...sourceTags])).filter(Boolean);
          mergedData.tags = allTags.join(', ');
        }
      }
      
      // Always merge sources
      const targetSources = mergedData.sources || [];
      const sourceSources = sourceCustomer.sources || [];
      mergedData.sources = Array.from(new Set([...targetSources, ...sourceSources]));
      
      // Always combine totals
      mergedData.totalOrders = (parseInt(String(mergedData.totalOrders)) || 0) + (parseInt(String(sourceCustomer.totalOrders)) || 0);
      mergedData.totalSpent = (parseFloat(String(mergedData.totalSpent)) || 0) + (parseFloat(String(sourceCustomer.totalSpent)) || 0);
      
      // Handle extra emails - append to notes
      if (fieldSelections?.extraEmailsForNotes) {
        const extraEmailsNote = `Additional email addresses: ${fieldSelections.extraEmailsForNotes}`;
        mergedData.note = mergedData.note 
          ? `${mergedData.note}\n\n${extraEmailsNote}`
          : extraEmailsNote;
      }
      
      // Merge notes if not already handled by fieldSelections
      if (!fieldSelections?.notes && sourceCustomer.note && sourceCustomer.note !== mergedData.note) {
        mergedData.note = mergedData.note 
          ? `${mergedData.note}\n\n--- Merged from ${sourceCustomer.company || sourceCustomer.email} ---\n${sourceCustomer.note}`
          : sourceCustomer.note;
      }
      
      // Update target customer with merged data
      await storage.updateCustomer(targetId, mergedData);
      
      // Transfer all related records from source to target before deleting
      console.log("Transferring related records from source to target...");
      
      // Transfer customer contacts
      await db.update(customerContacts)
        .set({ customerId: targetId })
        .where(eq(customerContacts.customerId, sourceId));
      console.log("✓ Transferred customer contacts");
      
      // Transfer customer journeys
      await db.update(customerJourney)
        .set({ customerId: targetId })
        .where(eq(customerJourney.customerId, sourceId));
      console.log("✓ Transferred customer journeys");
      
      // Transfer journey instances
      await db.update(customerJourneyInstances)
        .set({ customerId: targetId })
        .where(eq(customerJourneyInstances.customerId, sourceId));
      console.log("✓ Transferred journey instances");
      
      // Transfer sample requests
      await db.update(sampleRequests)
        .set({ customerId: targetId })
        .where(eq(sampleRequests.customerId, sourceId));
      console.log("✓ Transferred sample requests");
      
      // Transfer swatch shipments
      await db.update(swatchBookShipments)
        .set({ customerId: targetId })
        .where(eq(swatchBookShipments.customerId, sourceId));
      console.log("✓ Transferred swatch shipments");
      
      // Transfer press kit shipments
      await db.update(pressKitShipments)
        .set({ customerId: targetId })
        .where(eq(pressKitShipments.customerId, sourceId));
      console.log("✓ Transferred press kit shipments");
      
      // Transfer quote events
      await db.update(quoteEvents)
        .set({ customerId: targetId })
        .where(eq(quoteEvents.customerId, sourceId));
      console.log("✓ Transferred quote events");
      
      // Transfer price list events
      await db.update(priceListEvents)
        .set({ customerId: targetId })
        .where(eq(priceListEvents.customerId, sourceId));
      console.log("✓ Transferred price list events");
      
      // Transfer press profiles
      await db.update(pressProfiles)
        .set({ customerId: targetId })
        .where(eq(pressProfiles.customerId, sourceId));
      console.log("✓ Transferred press profiles");
      
      // Note: swatches table is product-based, not customer-based, so no transfer needed
      
      console.log("All related records transferred successfully!");
      
      // Delete source customer (now safe since all records are transferred)
      await storage.deleteCustomer(sourceId);
      
      setCachedData("customers", null);
      res.json({ message: "Customers merged successfully", mergedCustomer: mergedData });
    } catch (error: any) {
      console.error("Error merging customers:", error);
      const detail = error?.message || String(error) || "Unknown error";
      res.status(500).json({ error: `Merge failed: ${detail}` });
    }
  });
  app.post("/api/customers/do-not-merge", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId1, customerId2, reason } = req.body;
      
      if (!customerId1 || !customerId2) {
        return res.status(400).json({ error: "Both customerId1 and customerId2 are required" });
      }
      
      // Reject lead-prefixed IDs - leads don't use the customer merge system
      if (customerId1.startsWith('lead-') || customerId2.startsWith('lead-')) {
        return res.status(400).json({ error: "Cannot mark leads as do-not-merge. This feature is only for customer duplicates." });
      }
      
      // Sort IDs to ensure consistent ordering (smaller ID first)
      const [id1, id2] = [customerId1, customerId2].sort();
      
      // Check if already marked
      const existing = await db.select().from(customerDoNotMerge)
        .where(sql`(${customerDoNotMerge.customerId1} = ${id1} AND ${customerDoNotMerge.customerId2} = ${id2})`);
      
      if (existing.length > 0) {
        return res.json({ message: "Already marked as do not merge", exists: true });
      }
      
      // Insert the do not merge record
      const [result] = await db.insert(customerDoNotMerge).values({
        customerId1: id1,
        customerId2: id2,
        markedBy: req.user?.email || 'unknown',
        reason: reason || 'Marked as separate customers in SPOTLIGHT',
      }).returning();
      
      res.json({ message: "Customers marked as do not merge", record: result });
    } catch (error) {
      console.error("Error marking do not merge:", error);
      res.status(500).json({ error: "Failed to mark as do not merge" });
    }
  });
  app.post("/api/customers/bulk-update", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { customerIds, pricingTier, salesRepId } = req.body;
      
      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ error: "customerIds must be a non-empty array" });
      }
      
      if (pricingTier === undefined && salesRepId === undefined) {
        return res.status(400).json({ error: "At least one field (pricingTier or salesRepId) must be provided" });
      }
      
      const fields: { pricingTier?: string; salesRepId?: string } = {};
      if (pricingTier !== undefined) {
        fields.pricingTier = pricingTier;
      }
      if (salesRepId !== undefined) {
        fields.salesRepId = salesRepId;
      }
      
      const updatedCount = await storage.bulkUpdateCustomerFields(customerIds, fields);
      
      // Clear cache
      setCachedData("customers", null);
      
      // Sync pricing tier to Odoo/Shopify for each customer if tier was updated
      if (pricingTier !== undefined) {
        const tierTag = `Tier: ${pricingTier}`;
        let odooSynced = 0;
        let shopifySynced = 0;
        
        // Get all updated customers to check their sources
        for (const customerId of customerIds) {
          try {
            const customer = await storage.getCustomerById(customerId);
            if (!customer || !customer.sources) continue;
            
            const sources = customer.sources || [];
            
            // Sync to Odoo
            if (sources.includes('odoo') && customer.odooPartnerId) {
              try {
                const existingComment = customer.note || '';
                const tierRegex = /Tier:\s*[^\n]*/gi;
                const cleanedComment = existingComment.replace(tierRegex, '').trim();
                const newComment = cleanedComment ? `${cleanedComment}\n${tierTag}` : tierTag;
                
                await odooClient.updatePartner(customer.odooPartnerId, {
                  comment: newComment
                });
                odooSynced++;
              } catch (odooError) {
                console.error(`[Bulk Tier Sync] Failed to sync customer ${customerId} to Odoo:`, odooError);
              }
            }
            
            // Sync to Shopify
            if (sources.includes('shopify')) {
              try {
                const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
                const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
                
                if (SHOPIFY_ACCESS_TOKEN && SHOPIFY_STORE_DOMAIN) {
                  const shopifyCustomerId = customer.id.startsWith('shopify_') 
                    ? customer.id.replace('shopify_', '')
                    : null;
                  
                  if (shopifyCustomerId) {
                    const axios = (await import('axios')).default;
                    
                    const getResponse = await axios.get(
                      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/${shopifyCustomerId}.json`,
                      {
                        headers: {
                          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                          'Content-Type': 'application/json',
                        },
                      }
                    );
                    
                    const currentTags = getResponse.data.customer?.tags || '';
                    const tagArray = currentTags.split(',').map((t: string) => t.trim()).filter((t: string) => t);
                    const filteredTags = tagArray.filter((t: string) => !t.startsWith('Tier:'));
                    filteredTags.push(tierTag);
                    const newTags = filteredTags.join(', ');
                    
                    await axios.put(
                      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/${shopifyCustomerId}.json`,
                      {
                        customer: {
                          id: shopifyCustomerId,
                          tags: newTags
                        }
                      },
                      {
                        headers: {
                          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                          'Content-Type': 'application/json',
                        },
                      }
                    );
                    shopifySynced++;
                  }
                }
              } catch (shopifyError) {
                console.error(`[Bulk Tier Sync] Failed to sync customer ${customerId} to Shopify:`, shopifyError);
              }
            }
          } catch (customerError) {
            console.error(`[Bulk Tier Sync] Failed to get customer ${customerId}:`, customerError);
          }
        }
        
        console.log(`[Bulk Tier Sync] Synced pricing tier to ${odooSynced} Odoo partners and ${shopifySynced} Shopify customers`);
      }
      
      // Log activity
      const user = req.user as any;
      try {
        await storage.createActivityEvent({
          customerId: customerIds[0], // Use first customer as reference
          eventType: 'bulk_update',
          eventData: { 
            action: 'bulk_update_customers', 
            updatedCount, 
            fields: Object.keys(fields),
            customerIds: customerIds.slice(0, 10) // Limit for storage
          },
          createdBy: user?.email || 'system',
        });
      } catch (activityError) {
        console.log('Activity logging skipped:', activityError);
      }
      
      res.json({ 
        success: true, 
        updatedCount,
        message: `Successfully updated ${updatedCount} customers` 
      });
    } catch (error) {
      console.error("Error bulk updating customers:", error);
      res.status(500).json({ error: "Failed to bulk update customers" });
    }
  });
  app.patch("/api/customers/:id/kanban-stage", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const { stage } = req.body;
      await db.update(customers).set({ salesKanbanStage: stage }).where(eq(customers.id, customerId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update customer kanban stage" });
    }
  });
}
