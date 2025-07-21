import fs from 'fs';
import path from 'path';
import type { 
  ProductCategory, 
  ProductType, 
  ProductSize, 
  PricingTier, 
  ProductPricing,
  InsertProductCategory,
  InsertProductType,
  InsertProductSize,
  InsertPricingTier,
  InsertProductPricing
} from '@shared/schema';

interface CSVProduct {
  ProductID: string;
  ProductName: string;
  ProductType: string;
  Size: string;
  ItemCode: string;
  MinOrderQty: string;
  EXPORT_pricePerSqm: string;
  MASTER_DISTRIBUTOR_pricePerSqm: string;
  DEALER_pricePerSqm: string;
  DEALER_2_pricePerSqm: string;
  Approval_Retail__pricePerSqm: string;
  Stage25_pricePerSqm: string;
  Stage2_pricePerSqm: string;
  Stage15_pricePerSqm: string;
  Stage1_pricePerSqm: string;
  Retail_pricePerSqm: string;
}

interface CSVPricingTier {
  productId: string;
  productType: string;
  EXPORT_pricePerSqm: string;
  MASTER_DISTRIBUTOR_pricePerSqm: string;
  DEALER_pricePerSqm: string;
  DEALER_2_pricePerSqm: string;
  Approval_Retail__pricePerSqm: string;
  Stage25_pricePerSqm: string;
  Stage2_pricePerSqm: string;
  Stage15_pricePerSqm: string;
  Stage1_pricePerSqm: string;
  Retail_pricePerSqm: string;
}

function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split('\n');
  const result: string[][] = [];
  
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i-1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === ',')) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    row.push(current.trim());
    result.push(row);
  }
  
  return result;
}

function parseSize(sizeStr: string): { width: number; height: number; widthUnit: string; heightUnit: string } {
  // Remove extra spaces and anything in parentheses
  const cleanSize = sizeStr.trim().replace(/\s*\([^)]*\)\s*/g, '');
  
  // Handle common size formats by breaking them down step by step
  const patterns = [
    // Pattern 1: 12"x18" (both inches) - using Unicode curly quotes (8221)
    /^(\d+(?:\.\d+)?)\u201D[\s]*[x×][\s]*(\d+(?:\.\d+)?)\u201D?$/i,
    // Pattern 2: 36"x60' (inches x feet) - using Unicode curly quotes for inches, apostrophe for feet
    /^(\d+(?:\.\d+)?)\u201D[\s]*[x×][\s]*(\d+(?:\.\d+)?)['\u2018\u2019\u201A\u2032]$/i,
    // Pattern 3: 36'x60' (both feet) - using Unicode quotes for feet
    /^(\d+(?:\.\d+)?)['\u2018\u2019\u201A\u2032][\s]*[x×][\s]*(\d+(?:\.\d+)?)['\u2018\u2019\u201A\u2032]$/i,
    // Pattern 4: 12"x18" (regular quotes for inches)
    /^(\d+(?:\.\d+)?)"[\s]*[x×][\s]*(\d+(?:\.\d+)?)"?$/i,
    // Pattern 5: 12x18" (number x number with ending quote)
    /^(\d+(?:\.\d+)?)[\s]*[x×][\s]*(\d+(?:\.\d+)?)"$/i,
    // Pattern 6: Double quotes like 12""x18""
    /^(\d+(?:\.\d+)?)""[\s]*[x×][\s]*(\d+(?:\.\d+)?)""|""$/i,
    // Pattern 7: 12x18 (no units, assume inches)
    /^(\d+(?:\.\d+)?)[\s]*[x×][\s]*(\d+(?:\.\d+)?)$/i
  ];
  
  // Try each pattern
  for (let i = 0; i < patterns.length; i++) {
    const match = cleanSize.match(patterns[i]);
    if (match) {
      const width = parseFloat(match[1]);
      const height = parseFloat(match[2]);
      
      // Determine units based on pattern
      let widthUnit = 'inch';
      let heightUnit = 'inch';
      
      // Pattern 2: inches x feet
      if (i === 1) {
        widthUnit = 'inch';
        heightUnit = 'feet';
      }
      // Pattern 3: both feet
      else if (i === 2) {
        widthUnit = 'feet';
        heightUnit = 'feet';
      }
      
      return { width, height, widthUnit, heightUnit };
    }
  }
  
  // Default fallback
  console.warn(`Could not parse size: ${sizeStr}`);
  return { width: 12, height: 18, widthUnit: 'inch', heightUnit: 'inch' };
}

function cleanSizeName(sizeStr: string): string {
  // Remove extra spaces and anything in parentheses
  let cleanSize = sizeStr.trim().replace(/\s*\([^)]*\)\s*/g, '');
  
  // Replace double quotes with single quotes
  cleanSize = cleanSize.replace(/""/g, '"');
  
  // Clean up various quote patterns and normalize to simple format
  cleanSize = cleanSize
    .replace(/\u201D/g, '"')  // Replace Unicode curly quotes with regular quotes
    .replace(/['\u2018\u2019\u201A\u2032]/g, "'")  // Replace various apostrophes with regular apostrophe
    .replace(/[\s]*[x×][\s]*/g, 'x');  // Normalize x separator
  
  return cleanSize;
}

function calculateSquareMeters(width: number, height: number, widthUnit: string, heightUnit: string): number {
  const widthInches = widthUnit === 'feet' ? width * 12 : width;
  const heightInches = heightUnit === 'feet' ? height * 12 : height;
  return (widthInches * heightInches) * (0.0254 * 0.0254);
}

function cleanPrice(priceStr: string): number {
  return parseFloat(priceStr.replace(/[$,]/g, ''));
}

export function parseProductData(): {
  categories: ProductCategory[];
  types: ProductType[];
  sizes: ProductSize[];
  pricingTiers: PricingTier[];
  productPricing: ProductPricing[];
} {
  // Try to read from current working file first, fallback to original if not available
  let productDataPath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
  if (!fs.existsSync(productDataPath)) {
    productDataPath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data_1752538891953.csv');
  }
  const tierPricingPath = path.join(process.cwd(), 'attached_assets', 'tier_pricing_template-June10-2025_1752538891954.csv');
  
  const productCsvContent = fs.readFileSync(productDataPath, 'utf-8');
  const tierCsvContent = fs.readFileSync(tierPricingPath, 'utf-8');
  
  const productRows = parseCSV(productCsvContent);
  const tierRows = parseCSV(tierCsvContent);
  
  const productHeaders = productRows[0];
  const tierHeaders = tierRows[0];
  
  const products: CSVProduct[] = productRows.slice(1).map(row => {
    const product: any = {};
    productHeaders.forEach((header, index) => {
      product[header.replace(/﻿/g, '')] = row[index] || '';
    });
    return product as CSVProduct;
  });
  
  const tierPricing: CSVPricingTier[] = tierRows.slice(1).map(row => {
    const tier: any = {};
    tierHeaders.forEach((header, index) => {
      tier[header] = row[index] || '';
    });
    return tier as CSVPricingTier;
  });
  
  // Build categories
  const categoryMap = new Map<string, ProductCategory>();
  let categoryId = 1;
  
  products.forEach(product => {
    if (!categoryMap.has(product.ProductName)) {
      categoryMap.set(product.ProductName, {
        id: categoryId++,
        name: product.ProductName,
        description: null
      });
    }
  });
  
  // Build types
  const typeMap = new Map<string, ProductType>();
  let typeId = 1;
  
  products.forEach(product => {
    const typeKey = `${product.ProductName}|${product.ProductType}`;
    if (!typeMap.has(typeKey)) {
      const category = categoryMap.get(product.ProductName);
      if (category) {
        typeMap.set(typeKey, {
          id: typeId++,
          categoryId: category.id,
          name: product.ProductType,
          description: null
        });
      }
    }
  });
  
  // Build sizes
  const sizeMap = new Map<string, ProductSize>();
  let sizeId = 1;
  
  products.forEach(product => {
    const typeKey = `${product.ProductName}|${product.ProductType}`;
    const type = typeMap.get(typeKey);
    
    if (type) {
      const sizeKey = `${typeKey}|${product.Size}`;
      if (!sizeMap.has(sizeKey)) {
        const { width, height, widthUnit, heightUnit } = parseSize(product.Size);
        const squareMeters = calculateSquareMeters(width, height, widthUnit, heightUnit);
        
        sizeMap.set(sizeKey, {
          id: sizeId++,
          typeId: type.id,
          name: cleanSizeName(product.Size),
          width: width.toString(),
          height: height.toString(),
          widthUnit,
          heightUnit,
          squareMeters: squareMeters.toFixed(4),
          itemCode: product.ItemCode || null,
          minOrderQty: product.MinOrderQty || null
        });
      }
    }
  });
  
  // Build pricing tiers
  const pricingTiers: PricingTier[] = [
    { id: 1, name: 'EXPORT', description: 'Export pricing tier' },
    { id: 2, name: 'MASTER_DISTRIBUTOR', description: 'Master distributor pricing tier' },
    { id: 3, name: 'DEALER', description: 'Dealer pricing tier' },
    { id: 4, name: 'DEALER_2', description: 'Dealer 2 pricing tier' },
    { id: 5, name: 'Approval_Retail', description: 'Approval retail pricing tier' },
    { id: 6, name: 'Stage25', description: 'Stage 2.5 pricing tier' },
    { id: 7, name: 'Stage2', description: 'Stage 2 pricing tier' },
    { id: 8, name: 'Stage15', description: 'Stage 1.5 pricing tier' },
    { id: 9, name: 'Stage1', description: 'Stage 1 pricing tier' },
    { id: 10, name: 'Retail', description: 'Retail pricing tier' }
  ];
  
  // Build product pricing
  const productPricing: ProductPricing[] = [];
  let pricingId = 1;
  
  tierPricing.forEach(tier => {
    // Find the matching type by product type name (exact match)
    const type = Array.from(typeMap.values()).find(t => t.name === tier.productType);
    
    if (type) {
      const tierPrices = [
        { tierId: 1, price: cleanPrice(tier.EXPORT_pricePerSqm) },
        { tierId: 2, price: cleanPrice(tier.MASTER_DISTRIBUTOR_pricePerSqm) },
        { tierId: 3, price: cleanPrice(tier.DEALER_pricePerSqm) },
        { tierId: 4, price: cleanPrice(tier.DEALER_2_pricePerSqm) },
        { tierId: 5, price: cleanPrice(tier.Approval_Retail__pricePerSqm) },
        { tierId: 6, price: cleanPrice(tier.Stage25_pricePerSqm) },
        { tierId: 7, price: cleanPrice(tier.Stage2_pricePerSqm) },
        { tierId: 8, price: cleanPrice(tier.Stage15_pricePerSqm) },
        { tierId: 9, price: cleanPrice(tier.Stage1_pricePerSqm) },
        { tierId: 10, price: cleanPrice(tier.Retail_pricePerSqm) }
      ];
      
      tierPrices.forEach(tierPrice => {
        if (!isNaN(tierPrice.price) && tierPrice.price > 0) {
          productPricing.push({
            id: pricingId++,
            productTypeId: type.id,
            tierId: tierPrice.tierId,
            pricePerSquareMeter: tierPrice.price.toFixed(2)
          });
        }
      });
    }
  });
  
  return {
    categories: Array.from(categoryMap.values()),
    types: Array.from(typeMap.values()),
    sizes: Array.from(sizeMap.values()),
    pricingTiers,
    productPricing
  };
}