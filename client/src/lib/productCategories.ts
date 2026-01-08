/**
 * Product Category Constants
 * 
 * This file contains the curated list of allowed product categories.
 * Product type filtering is now handled via database relationships (productTypeId -> categoryId).
 * 
 * Used by: Quote Calculator, Product Mapping, Product Pricing Management, Price List
 */

export const ALLOWED_CATEGORIES = [
  'Graffiti Polyester Paper',
  'Graffiti Blended Poly',
  'Graffiti SOFT Poly',
  'GraffitiSTICK',
  'Solvit Sign & Display Media',
  'CLiQ Aqueous Media',
  'Rang Print Canvas',
  'DTF Film',
  'Offset Printing Plates',
  'Screen Printing Positives',
  'Rollers & Chemicals',
  'Misc Products',
  'Swatch Books',
] as const;

export type AllowedCategory = typeof ALLOWED_CATEGORIES[number];

/**
 * Check if a category name is in the allowed list
 * @param categoryName - The category name to check
 * @returns true if the category is allowed
 */
export function isAllowedCategory(categoryName: string): boolean {
  return ALLOWED_CATEGORIES.includes(categoryName as AllowedCategory);
}

/**
 * Filter categories to only include allowed ones
 * @param categories - Array of category objects with name property
 * @returns Filtered array of allowed categories
 */
export function filterAllowedCategories<T extends { name: string }>(categories: T[]): T[] {
  return categories.filter(cat => isAllowedCategory(cat.name));
}
