import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface QuoteNumberResponse {
  quoteNumber: string;
  hasCustomerPrefix: boolean;
  isValid: boolean;
}

interface QuoteNumberParams {
  customerName?: string;
  customerId?: string;
}

/**
 * Hook for generating unique quote numbers with backend validation
 * Supports customer prefix for shared quotes
 */
export function useQuoteNumber() {
  return useMutation<QuoteNumberResponse, Error, QuoteNumberParams>({
    mutationFn: async ({ customerName, customerId }) => {
      const response = await apiRequest("POST", "/api/generate-quote-number", {
        customerName,
        customerId,
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate quote number");
      }
      
      return response.json();
    },
  });
}

/**
 * Utility functions for quote numbers
 */
export const quoteNumberUtils = {
  /**
   * Extract customer prefix from quote number
   */
  extractCustomerPrefix: (quoteNumber: string): string | null => {
    const match = quoteNumber.match(/^4SG-([A-Z]{3})-\d{6}-\d{4}$/);
    return match ? match[1] : null;
  },

  /**
   * Extract date from quote number
   */
  extractQuoteDate: (quoteNumber: string): Date | null => {
    const match = quoteNumber.match(/\d{6}/);
    if (!match) return null;
    
    const dateStr = match[0];
    const year = parseInt(`20${dateStr.slice(0, 2)}`);
    const month = parseInt(dateStr.slice(2, 4)) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.slice(4, 6));
    
    return new Date(year, month, day);
  },

  /**
   * Validate quote number format
   */
  isValid: (quoteNumber: string): boolean => {
    const patterns = [
      /^4SG-\d{6}-\d{4}$/, // 4SG-YYMMDD-XXXX
      /^4SG-[A-Z]{3}-\d{6}-\d{4}$/, // 4SG-CUS-YYMMDD-XXXX
    ];
    
    return patterns.some(pattern => pattern.test(quoteNumber));
  },

  /**
   * Format examples for user reference
   */
  examples: {
    standard: "4SG-250723-1234",
    withCustomer: "4SG-ABC-250723-1234"
  }
};