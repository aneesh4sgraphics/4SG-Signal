import { db } from './db';
import { sentQuotes } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Generate a unique quote number with customer prefix and backend validation
 * Format: 4SG-[CUSTOMER_PREFIX]-YYMMDD-XXXX
 */
export async function generateUniqueQuoteNumber(customerName?: string, customerId?: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;
  
  // Generate customer prefix if provided
  let customerPrefix = '';
  if (customerName || customerId) {
    const nameToUse = customerName || customerId || '';
    // Extract first 3 letters from company name, removing spaces and special chars
    customerPrefix = nameToUse
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 3);
    
    if (customerPrefix.length < 3) {
      customerPrefix = customerPrefix.padEnd(3, 'X');
    }
  }
  
  // Try to generate unique quote number with retries
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate 4-digit random number
    const random = Math.floor(1000 + Math.random() * 9000);
    
    // Construct quote number
    const quoteNumber = customerPrefix 
      ? `4SG-${customerPrefix}-${datePrefix}-${random}`
      : `4SG-${datePrefix}-${random}`;
    
    try {
      // Check uniqueness in database
      const existingQuote = await db
        .select()
        .from(sentQuotes)
        .where(eq(sentQuotes.quoteNumber, quoteNumber))
        .limit(1);
      
      if (existingQuote.length === 0) {
        console.log(`Generated unique quote number: ${quoteNumber}`);
        return quoteNumber;
      }
      
      attempts++;
      console.log(`Quote number ${quoteNumber} already exists, retrying... (${attempts}/${maxAttempts})`);
      
    } catch (error) {
      console.error('Error checking quote number uniqueness:', error);
      // If database check fails, return the generated number anyway
      return quoteNumber;
    }
  }
  
  // Fallback: use timestamp to ensure uniqueness
  const timestamp = now.getTime().toString().slice(-4);
  const fallbackNumber = customerPrefix 
    ? `4SG-${customerPrefix}-${datePrefix}-${timestamp}`
    : `4SG-${datePrefix}-${timestamp}`;
  
  console.log(`Using fallback quote number after ${maxAttempts} attempts: ${fallbackNumber}`);
  return fallbackNumber;
}

/**
 * Validate quote number format
 */
export function validateQuoteNumber(quoteNumber: string): boolean {
  // Basic format validation
  const patterns = [
    /^4SG-\d{6}-\d{4}$/, // 4SG-YYMMDD-XXXX
    /^4SG-[A-Z]{3}-\d{6}-\d{4}$/, // 4SG-CUS-YYMMDD-XXXX
  ];
  
  return patterns.some(pattern => pattern.test(quoteNumber));
}

/**
 * Extract customer prefix from quote number
 */
export function extractCustomerPrefix(quoteNumber: string): string | null {
  const match = quoteNumber.match(/^4SG-([A-Z]{3})-\d{6}-\d{4}$/);
  return match ? match[1] : null;
}

/**
 * Extract date from quote number
 */
export function extractQuoteDate(quoteNumber: string): Date | null {
  const match = quoteNumber.match(/\d{6}/);
  if (!match) return null;
  
  const dateStr = match[0];
  const year = parseInt(`20${dateStr.slice(0, 2)}`);
  const month = parseInt(dateStr.slice(2, 4)) - 1; // Month is 0-indexed
  const day = parseInt(dateStr.slice(4, 6));
  
  return new Date(year, month, day);
}