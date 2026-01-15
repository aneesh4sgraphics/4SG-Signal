import { db } from "./db";
import { customers, followUpTasks, users, customerContacts } from "@shared/schema";
import { eq, and, isNull, or, ne, sql, desc, asc, lt, lte, gte, isNotNull, inArray, notInArray } from "drizzle-orm";

export interface SpotlightTask {
  id: string;
  customerId: string;
  taskType: 'hygiene' | 'sales';
  taskSubtype: string;
  priority: number;
  customer: {
    id: string;
    company: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    website: string | null;
    salesRepId: string | null;
    salesRepName: string | null;
    pricingTier: string | null;
  };
  context?: {
    quoteId?: number;
    followUpId?: number;
    followUpTitle?: string;
    followUpDueDate?: string;
  };
}

export interface SpotlightSession {
  userId: string;
  totalCompleted: number;
  hygieneCompleted: number;
  salesCompleted: number;
  lastTaskAt: Date | null;
  skippedCustomerIds: string[];
}

const HYGIENE_WEIGHT = 2;
const SALES_WEIGHT = 3;
const BATCH_SIZE = 5; // Fetch 5 candidates at a time

class SpotlightEngine {
  private sessions: Map<string, SpotlightSession> = new Map();

  private getSession(userId: string): SpotlightSession {
    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        userId,
        totalCompleted: 0,
        hygieneCompleted: 0,
        salesCompleted: 0,
        lastTaskAt: null,
        skippedCustomerIds: [],
      };
      this.sessions.set(userId, session);
    }
    return session;
  }

  private shouldShowHygiene(session: SpotlightSession): boolean {
    const totalRatio = session.hygieneCompleted + session.salesCompleted;
    if (totalRatio === 0) return true;
    
    const hygieneRatio = session.hygieneCompleted / totalRatio;
    const targetRatio = HYGIENE_WEIGHT / (HYGIENE_WEIGHT + SALES_WEIGHT);
    
    return hygieneRatio < targetRatio;
  }

  async getNextTask(userId: string): Promise<{ task: SpotlightTask | null; session: SpotlightSession; allDone: boolean }> {
    const session = this.getSession(userId);
    
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const userEmail = user[0]?.email;

      const shouldDoHygiene = this.shouldShowHygiene(session);
      
      let task: SpotlightTask | null = null;
      
      if (shouldDoHygiene) {
        task = await this.findHygieneTask(userId, userEmail, session.skippedCustomerIds);
      }
      
      if (!task) {
        task = await this.findSalesTask(userId, userEmail, session.skippedCustomerIds);
      }
      
      if (!task && !shouldDoHygiene) {
        task = await this.findHygieneTask(userId, userEmail, session.skippedCustomerIds);
      }
      
      return {
        task,
        session,
        allDone: !task,
      };
    } catch (error) {
      console.error('[Spotlight] Error getting next task:', error);
      return { task: null, session, allDone: true };
    }
  }

  private async findHygieneTask(userId: string, userEmail: string | undefined, skippedIds: string[]): Promise<SpotlightTask | null> {
    const priorityOrder = [
      { subtype: 'hygiene_sales_rep', condition: isNull(customers.salesRepId) },
      { subtype: 'hygiene_pricing_tier', condition: isNull(customers.pricingTier) },
      { subtype: 'hygiene_name', condition: and(isNull(customers.firstName), isNull(customers.lastName)) },
      { subtype: 'hygiene_company', condition: isNull(customers.company) },
      { subtype: 'hygiene_phone', condition: isNull(customers.phone) },
      { subtype: 'hygiene_address', condition: isNull(customers.address1) },
      { subtype: 'hygiene_website', condition: isNull(customers.website) },
    ];

    for (let i = 0; i < priorityOrder.length; i++) {
      const { subtype, condition } = priorityOrder[i];
      
      let whereConditions = [
        condition,
        eq(customers.doNotContact, false),
      ];
      
      if (skippedIds.length > 0) {
        whereConditions.push(notInArray(customers.id, skippedIds));
      }
      
      if (subtype === 'hygiene_sales_rep') {
      } else {
        whereConditions.push(
          or(
            isNull(customers.salesRepId),
            eq(customers.salesRepId, userId)
          )
        );
      }

      const result = await db
        .select({
          id: customers.id,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          address1: customers.address1,
          address2: customers.address2,
          city: customers.city,
          state: customers.province,
          zip: customers.zip,
          country: customers.country,
          website: customers.website,
          salesRepId: customers.salesRepId,
          salesRepName: customers.salesRepName,
          pricingTier: customers.pricingTier,
        })
        .from(customers)
        .where(and(...whereConditions))
        .orderBy(desc(customers.updatedAt))
        .limit(1);

      if (result.length > 0) {
        const customer = result[0];
        return {
          id: `hygiene_${customer.id}_${subtype}`,
          customerId: customer.id.toString(),
          taskType: 'hygiene',
          taskSubtype: subtype,
          priority: i + 1,
          customer: {
            id: customer.id.toString(),
            company: customer.company,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone,
            address1: customer.address1,
            address2: customer.address2,
            city: customer.city,
            state: customer.state,
            zip: customer.zip,
            country: customer.country,
            website: customer.website,
            salesRepId: customer.salesRepId,
            salesRepName: customer.salesRepName,
            pricingTier: customer.pricingTier,
          },
        };
      }
    }

    return null;
  }

  private async findSalesTask(userId: string, userEmail: string | undefined, skippedIds: string[]): Promise<SpotlightTask | null> {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const baseConditions = [
      or(
        eq(followUpTasks.assignedTo, userId),
        and(
          isNull(followUpTasks.assignedTo),
          or(
            isNull(customers.salesRepId),
            eq(customers.salesRepId, userId)
          )
        )
      ),
      ne(followUpTasks.status, 'completed'),
    ];

    if (skippedIds.length > 0) {
      baseConditions.push(notInArray(sql`${followUpTasks.customerId}::text`, skippedIds));
    }

    const overdueTask = await db
      .select({
        taskId: followUpTasks.id,
        customerId: followUpTasks.customerId,
        title: followUpTasks.title,
        taskType: followUpTasks.taskType,
        dueDate: followUpTasks.dueDate,
        customer: {
          id: customers.id,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          address1: customers.address1,
          address2: customers.address2,
          city: customers.city,
          state: customers.province,
          zip: customers.zip,
          country: customers.country,
          website: customers.website,
          salesRepId: customers.salesRepId,
          salesRepName: customers.salesRepName,
          pricingTier: customers.pricingTier,
        },
      })
      .from(followUpTasks)
      .leftJoin(customers, eq(followUpTasks.customerId, customers.id))
      .where(and(...baseConditions, lte(followUpTasks.dueDate, now)))
      .orderBy(asc(followUpTasks.dueDate))
      .limit(1);

    if (overdueTask.length > 0 && overdueTask[0].customer) {
      return this.buildSalesTaskFromResult(overdueTask[0]);
    }

    const upcomingTask = await db
      .select({
        taskId: followUpTasks.id,
        customerId: followUpTasks.customerId,
        title: followUpTasks.title,
        taskType: followUpTasks.taskType,
        dueDate: followUpTasks.dueDate,
        customer: {
          id: customers.id,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          address1: customers.address1,
          address2: customers.address2,
          city: customers.city,
          state: customers.province,
          zip: customers.zip,
          country: customers.country,
          website: customers.website,
          salesRepId: customers.salesRepId,
          salesRepName: customers.salesRepName,
          pricingTier: customers.pricingTier,
        },
      })
      .from(followUpTasks)
      .leftJoin(customers, eq(followUpTasks.customerId, customers.id))
      .where(and(...baseConditions, gte(followUpTasks.dueDate, now), lte(followUpTasks.dueDate, nextWeek)))
      .orderBy(asc(followUpTasks.dueDate))
      .limit(1);

    if (upcomingTask.length > 0 && upcomingTask[0].customer) {
      return this.buildSalesTaskFromResult(upcomingTask[0]);
    }

    return null;
  }

  private buildSalesTaskFromResult(result: any): SpotlightTask {
    const task = result;
    const cust = task.customer!;
    const taskSubtype = task.taskType === 'quote_follow_up' ? 'sales_quote_follow_up' : 
                        task.taskType === 'call' ? 'sales_call' :
                        task.taskType === 'outreach' ? 'sales_outreach' : 'sales_follow_up';
    
    return {
      id: `sales_${task.taskId}_${taskSubtype}`,
      customerId: task.customerId?.toString() || '',
      taskType: 'sales',
      taskSubtype,
      priority: 1,
      customer: {
        id: cust.id.toString(),
        company: cust.company,
        firstName: cust.firstName,
        lastName: cust.lastName,
        email: cust.email,
        phone: cust.phone,
        address1: cust.address1,
        address2: cust.address2,
        city: cust.city,
        state: cust.state,
        zip: cust.zip,
        country: cust.country,
        website: cust.website,
        salesRepId: cust.salesRepId,
        salesRepName: cust.salesRepName,
        pricingTier: cust.pricingTier,
      },
      context: {
        followUpId: task.taskId,
        followUpTitle: task.title || undefined,
        followUpDueDate: task.dueDate?.toISOString(),
      },
    };
  }

  async completeTask(userId: string, taskId: string, field?: string, value?: string): Promise<void> {
    const session = this.getSession(userId);
    
    const parts = taskId.split('_');
    const taskType = parts[0] as 'hygiene' | 'sales';
    const customerId = parts[1];
    const subtype = parts.slice(2).join('_');

    if (taskType === 'hygiene' && field && value) {
      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      const subtypeAllowedFields: Record<string, string[]> = {
        'hygiene_sales_rep': ['salesRepId'],
        'hygiene_pricing_tier': ['pricingTier'],
        'hygiene_name': ['firstName', 'lastName'],
        'hygiene_company': ['company'],
        'hygiene_phone': ['phone'],
        'hygiene_address': ['address1', 'city', 'state', 'zip'],
        'hygiene_website': ['website'],
      };

      const allowedFields = subtypeAllowedFields[subtype] || [];
      if (!allowedFields.includes(field)) {
        console.error(`[Spotlight] Field "${field}" not allowed for subtype "${subtype}"`);
        return;
      }

      const fieldMap: Record<string, string> = {
        salesRepId: 'salesRepId',
        pricingTier: 'pricingTier',
        firstName: 'firstName',
        lastName: 'lastName',
        company: 'company',
        phone: 'phone',
        website: 'website',
        address1: 'address1',
        city: 'city',
        state: 'state',
        zip: 'zip',
      };

      if (fieldMap[field]) {
        updateData[fieldMap[field]] = value;
        
        if (field === 'salesRepId') {
          const [rep] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(eq(users.id, value));
          if (rep) {
            updateData.salesRepName = rep.firstName && rep.lastName 
              ? `${rep.firstName} ${rep.lastName}` 
              : rep.email;
          }
        }
      }

      await db.update(customers)
        .set(updateData)
        .where(eq(customers.id, customerId));

      session.hygieneCompleted++;
    } else if (taskType === 'sales') {
      const followUpId = parseInt(parts[1]);
      
      if (!isNaN(followUpId)) {
        await db.update(followUpTasks)
          .set({ 
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(followUpTasks.id, followUpId));
      }

      session.salesCompleted++;
    }

    session.totalCompleted++;
    session.lastTaskAt = new Date();
    
    const skipIndex = session.skippedCustomerIds.indexOf(customerId);
    if (skipIndex > -1) {
      session.skippedCustomerIds.splice(skipIndex, 1);
    }
  }

  async skipTask(userId: string, taskId: string, reason: string): Promise<void> {
    const session = this.getSession(userId);
    
    const parts = taskId.split('_');
    const customerId = parts[1];

    if (!session.skippedCustomerIds.includes(customerId)) {
      session.skippedCustomerIds.push(customerId);
    }

    console.log(`[Spotlight] User ${userId} skipped task ${taskId}: ${reason}`);
  }

  getSessionStats(userId: string): SpotlightSession {
    return this.getSession(userId);
  }
}

export const spotlightEngine = new SpotlightEngine();
