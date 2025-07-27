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
   * Generate a new 7-digit alphanumeric quote number
   */
  generate: (): string => {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from(
      { length: 7 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  },

  /**
   * Validate quote number format
   */
  isValid: (quoteNumber: string): boolean => {
    // 7-digit alphanumeric format
    const pattern = /^[0-9A-Z]{7}$/;
    return pattern.test(quoteNumber);
  },

  /**
   * Format examples for user reference
   */
  examples: {
    standard: "AB1C2D3",
    sevenDigit: "XY4Z567"
  }
};