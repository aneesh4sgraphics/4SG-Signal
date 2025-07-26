/**
 * Utility functions for handling product size dimensions
 */

/**
 * Determines if a size is "inch x inch" or "inch x feet" format
 * and returns the appropriate column header
 */
export function getPriceColumnHeader(size: string): string {
  if (!size) return "Price/Sheet";
  
  // Clean up the size string - remove quotes, trim whitespace
  const cleanSize = size.replace(/['"]/g, '').trim().toLowerCase();
  
  // Look for patterns like:
  // - "12x18" (inch x inch)
  // - "12"x18" (inch x inch) 
  // - "12x100'" (inch x feet)
  // - "24"x100'" (inch x feet)
  
  // Check if it contains feet indicator (', ft, feet)
  if (cleanSize.includes("'") || cleanSize.includes("ft") || cleanSize.includes("feet")) {
    return "Price/Roll";
  }
  
  // Check for inch x feet pattern (number x number')
  const feetPattern = /\d+["]?\s*x\s*\d+[']/i;
  if (feetPattern.test(cleanSize)) {
    return "Price/Roll";
  }
  
  // Default to Price/Sheet for inch x inch patterns
  return "Price/Sheet";
}

/**
 * Determines if a size represents a roll (inch x feet) format
 */
export function isRollSize(size: string): boolean {
  return getPriceColumnHeader(size) === "Price/Roll";
}

/**
 * Determines if a size represents a sheet (inch x inch) format  
 */
export function isSheetSize(size: string): boolean {
  return getPriceColumnHeader(size) === "Price/Sheet";
}