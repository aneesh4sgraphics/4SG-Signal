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
    
    // Filter out rows that seem to contain extra CSV data appended to size field
    if (row.length > 6 && row[3] && row[3].includes(',,')) {
      // This indicates the size field got corrupted with extra CSV data
      const sizeField = row[3];
      const cleanSize = sizeField.split(',,')[0]; // Take only the size part before the corruption
      row[3] = cleanSize;
      // Keep only the first 6 columns to avoid malformed data
      row.splice(6);
    }
    
    result.push(row);
  }
  
  return result;
}

function parseSize(sizeStr: string): { width: number; height: number; widthUnit: string; heightUnit: string } {
  // Remove extra spaces, anything in parentheses, and handle corrupted CSV data
  let cleanSize = sizeStr.trim().replace(/\s*\([^)]*\)\s*/g, '');
  
  // Handle cases where extra CSV data got appended to size (like "24x100',,1 Roll,2.88...")
  if (cleanSize.includes(',,') || cleanSize.includes(',1 Roll') || cleanSize.includes(',50 Sheets')) {
    cleanSize = cleanSize.split(/,,|,\d+\s*(Roll|Sheet)/)[0].trim();
  }
  
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
    // Pattern 6: Double quotes like 54""x100' - fixed to properly capture width/height with mixed units
    /^(\d+(?:\.\d+)?)""[\s]*[x×][\s]*(\d+(?:\.\d+)?)['\u2018\u2019\u201A\u2032]$/i,
    // Pattern 7: Double quotes both sides like 12""x18""
    /^(\d+(?:\.\d+)?)""[\s]*[x×][\s]*(\d+(?:\.\d+)?)""|""$/i,
    // Pattern 8: 24x100' (number x number with ending apostrophe for feet) 
    /^(\d+(?:\.\d+)?)[\s]*[x×][\s]*(\d+(?:\.\d+)?)['\u2018\u2019\u201A\u2032]$/i,
    // Pattern 9: 12x18 (no units, assume inches)
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
      // Pattern 6: double quotes x feet (54""x100')
      else if (i === 5) {
        widthUnit = 'inch';
        heightUnit = 'feet';
      }
      // Pattern 8: inches x feet (24x100')
      else if (i === 7) {
        widthUnit = 'inch';
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
  const productDataPath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
  const tierPricingPath = path.join(process.cwd(), 'attached_assets', 'tier_pricing_template.csv');
  
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
    // Extract base category name by removing redundant prefixes from ProductType
    let categoryName = product.ProductName;
    
    // Handle cases where ProductType contains the ProductName redundantly
    if (product.ProductType && product.ProductType.startsWith(product.ProductName)) {
      // Keep the original ProductName as category, ProductType will be processed separately
      categoryName = product.ProductName;
    }
    
    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, {
        id: categoryId++,
        name: categoryName,
        description: null
      });
    }
  });
  
  // Build types
  const typeMap = new Map<string, ProductType>();
  let typeId = 1;
  
  products.forEach(product => {
    let categoryName = product.ProductName;
    let typeName = product.ProductType;
    
    // Use the original ProductType name from the CSV data for exact matching
    // This should match the productType field in the pricing CSV
    const typeKey = `${categoryName}|${typeName}`;
    
    if (!typeMap.has(typeKey)) {
      const category = categoryMap.get(categoryName);
      if (category) {
        typeMap.set(typeKey, {
          id: typeId++,
          categoryId: category.id,
          name: typeName, // Use original ProductType for exact matching
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
  
  // Load external pricing data if available
  let productPricing: ProductPricing[] = [];
  
  // First try to load from separate pricing file
  const types = Array.from(typeMap.values());
  
  // Create a mapping function to match product types between files with category awareness
  const createProductTypeMapping = () => {
    const mapping = new Map<string, {typeName: string, categoryId: number}>();
    
    // For Graffiti Polyester Paper products (Category 1)
    mapping.set("graffiti polyester paper 5mil", {typeName: "thickness: 5mil", categoryId: 1});
    mapping.set("graffiti polyester paper 8mil", {typeName: "thickness: 8mil", categoryId: 1});
    mapping.set("graffiti polyester paper 10mil", {typeName: "thickness: 10mil", categoryId: 1});
    mapping.set("graffiti polyester paper 11mil", {typeName: "thickness: 11mil", categoryId: 1});
    mapping.set("graffiti polyester paper 14mil", {typeName: "thickness: 14mil", categoryId: 1});
    mapping.set("graffiti blockout polyester 11mil", {typeName: "thickness: blockout 11mil", categoryId: 1});
    
    // For Metallic products (Category 1)
    mapping.set("graffiti metallic gold 8mil", {typeName: "gold 8mil", categoryId: 1});
    mapping.set("graffiti metallic gold 11mil", {typeName: "gold 11mil", categoryId: 1});
    mapping.set("graffiti metallic silver 8mil", {typeName: "silver 8mil", categoryId: 1});
    mapping.set("graffiti metallic silver 11mil", {typeName: "silver 11mil", categoryId: 1});
    mapping.set("graffiti metallic rose 8mil", {typeName: "rose 8mil", categoryId: 1});
    mapping.set("graffiti metallic rose 11mil", {typeName: "rose 11mil", categoryId: 1});
    mapping.set("graffiti metallic mirror 8mil", {typeName: "mirror 8mil", categoryId: 1});
    
    // For CoHo products (Category 10)
    mapping.set("coho dtf films for fabrics", {typeName: "coho films for fabrics", categoryId: 10});
    
    // For Graffiti Blended Poly products (Category 2)
    mapping.set("graffiti blended poly 8mil", {typeName: "thickness: 8mil", categoryId: 2});
    mapping.set("graffiti blended poly 11mil", {typeName: "thickness: 11mil", categoryId: 2});
    mapping.set("graffiti blended poly 14mil", {typeName: "thickness: 14mil", categoryId: 2});
    
    // For Graffiti SOFT Poly products (Category 3)
    mapping.set("graffiti soft poly 8mil", {typeName: "thickness: 8mil", categoryId: 3});
    mapping.set("graffiti soft poly 11mil", {typeName: "thickness: 11mil", categoryId: 3});
    mapping.set("graffiti soft poly 14mil", {typeName: "thickness: 14mil", categoryId: 3});
    
    return mapping;
  };
  
  const pricingToProductMapping = createProductTypeMapping();
  const externalPricing = parsePricingData(types, pricingToProductMapping);
  
  if (externalPricing.length > 0) {
    console.log('Using external pricing data from tier_pricing_template.csv');
    productPricing = externalPricing;
  } else {
    // Fallback to embedded pricing data
    console.log('Using embedded pricing data from product CSV');
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
  }
  
  return {
    categories: Array.from(categoryMap.values()),
    types: Array.from(typeMap.values()),
    sizes: Array.from(sizeMap.values()),
    pricingTiers,
    productPricing
  };
}

// Parse separate pricing data file
export function parsePricingData(types: ProductType[], pricingToProductMapping: Map<string, string>): ProductPricing[] {
  const pricingPath = path.join(process.cwd(), 'attached_assets', 'tier_pricing_template.csv');
  
  if (!fs.existsSync(pricingPath)) {
    console.warn('No pricing data file found at:', pricingPath);
    return [];
  }

  try {
    const csvContent = fs.readFileSync(pricingPath, 'utf-8');
    const rows = parseCSV(csvContent);
    
    if (rows.length < 2) {
      console.warn('Pricing file is empty or has no data rows');
      return [];
    }

    const headers = rows[0];
    const pricingData = rows.slice(1);
    
    console.log('Pricing headers:', headers);
    console.log('First pricing row:', pricingData[0]);
    
    const productPricing: ProductPricing[] = [];
    let pricingId = 1;
    
    // Create a map of product types for faster lookup
    const typeMap = new Map<string, ProductType>();
    types.forEach(type => {
      typeMap.set(type.name.toLowerCase(), type);
      // Also map by partial name matches
      typeMap.set(type.name.replace(/thickness:\s*/i, '').toLowerCase(), type);
    });
    
    console.log('Available product types:', Array.from(typeMap.keys()));
    console.log('Sample product types values:', Array.from(typeMap.values()).slice(0, 10).map(t => t.name));
    
    // Debug: show some Graffiti types specifically
    const graffitiTypes = Array.from(typeMap.values()).filter(t => t.name.toLowerCase().includes('graffiti')).slice(0, 5);
    console.log('Graffiti product types found:', graffitiTypes.map(t => t.name));

    pricingData.forEach((row, index) => {
      const data: any = {};
      headers.forEach((header, i) => {
        data[header] = row[i] || '';
      });
      
      const productTypeFromCsv = data.productType || '';
      console.log(`Row ${index + 1}: Looking for type "${productTypeFromCsv}"`);
      
      // Try to find matching product type
      let matchedType: ProductType | undefined;
      
      // First try exact match
      matchedType = typeMap.get(productTypeFromCsv.toLowerCase());
      
      // If no exact match, try mapping through the pricing-to-product mapping
      if (!matchedType) {
        const mappingResult = pricingToProductMapping.get(productTypeFromCsv.toLowerCase());
        if (mappingResult) {
          // Find the type that matches both name and category
          const candidateType = Array.from(typeMap.values()).find(type => 
            type.name.toLowerCase() === mappingResult.typeName.toLowerCase() && 
            type.categoryId === mappingResult.categoryId
          );
          if (candidateType) {
            matchedType = candidateType;
            console.log(`  Mapped "${productTypeFromCsv}" to "${mappingResult.typeName}" in category ${mappingResult.categoryId}`);
          }
        }
      }
      
      // If still no match, try direct product type name matching
      if (!matchedType) {
        const typeEntries = Array.from(typeMap.entries());
        for (const [typeName, type] of typeEntries) {
          if (typeName.toLowerCase() === productTypeFromCsv.toLowerCase()) {
            matchedType = type;
            break;
          }
        }
      }
      
      if (matchedType) {
        console.log(`Found matching type: ${matchedType.name} for "${productTypeFromCsv}"`);
        
        // Create pricing entries for each tier
        const tierMappings = [
          { col: 'EXPORT_pricePerSqm', tierId: 1 },
          { col: 'MASTER_DISTRIBUTOR_pricePerSqm', tierId: 2 },
          { col: 'DEALER_pricePerSqm', tierId: 3 },
          { col: 'DEALER_2_pricePerSqm', tierId: 4 },
          { col: 'Approval_Retail__pricePerSqm', tierId: 5 },
          { col: 'Stage25_pricePerSqm', tierId: 6 },
          { col: 'Stage2_pricePerSqm', tierId: 7 },
          { col: 'Stage15_pricePerSqm', tierId: 8 },
          { col: 'Stage1_pricePerSqm', tierId: 9 },
          { col: 'Retail_pricePerSqm', tierId: 10 }
        ];
        
        tierMappings.forEach(({ col, tierId }) => {
          const priceStr = data[col] || '';
          const price = cleanPrice(priceStr);
          
          if (!isNaN(price) && price > 0) {
            productPricing.push({
              id: pricingId++,
              productTypeId: matchedType!.id,
              tierId,
              pricePerSquareMeter: price.toFixed(2)
            });
          }
        });
      } else {
        console.warn(`No matching product type found for: "${productTypeFromCsv}"`);
      }
    });
    
    console.log(`Created ${productPricing.length} pricing entries from external pricing file`);
    return productPricing;
    
  } catch (error) {
    console.error('Error parsing pricing data file:', error);
    return [];
  }
}