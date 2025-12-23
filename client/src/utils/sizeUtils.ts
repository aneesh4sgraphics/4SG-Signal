/**
 * Utility functions for handling product size dimensions
 */

/**
 * Determines if a size is "inch x inch" or "inch x feet" format
 * and returns the appropriate column header
 */
export function getPriceColumnHeader(size: string): string {
  if (!size) return "Price/Sheet";
  
  const cleanSize = size.replace(/['"]/g, '').trim();
  
  if (cleanSize.includes("'") || cleanSize.includes("ft") || cleanSize.includes("feet")) {
    return "Price/Roll";
  }
  
  const feetPattern = /\d+["]?\s*x\s*\d+[']/i;
  if (feetPattern.test(cleanSize)) {
    return "Price/Roll";
  }
  
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