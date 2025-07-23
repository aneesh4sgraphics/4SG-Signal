import fs from 'fs';
import path from 'path';
import { ProductCategory, ProductType, ProductSize, ProductPricing, PricingTier } from '../shared/schema.js';

// Clean price function to handle various formats
function cleanPrice(priceStr: string): number {
  if (!priceStr || priceStr.trim() === '') return 0;
  
  // Remove dollar signs, spaces, and other non-numeric characters except decimal points
  const cleaned = priceStr.replace(/[$\s,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Enhanced CSV parsing with proper quote handling
function parseCSVLine(line: string): string[] {
  const cells = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (!inQuotes) {
        inQuotes = true;
      } else if (nextChar === '"') {
        // Handle escaped quotes
        currentCell += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(currentCell.trim());
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  
  cells.push(currentCell.trim());
  return cells;
}

// New function with proper product-to-pricing matching logic
function parsePricingDataWithNewLogic(types: ProductType[]): ProductPricing[] {
  const pricingFilePath = path.join(process.cwd(), 'attached_assets', 'pricing-data_1753205072892.csv');
  
  if (!fs.existsSync(pricingFilePath)) {
    console.log('External pricing file not found, skipping external pricing');
    return [];
  }

  const pricingCsvContent = fs.readFileSync(pricingFilePath, 'utf-8');
  const pricingLines = pricingCsvContent.split('\n').filter(line => line.trim());
  
  if (pricingLines.length === 0) {
    console.log('Pricing file is empty');
    return [];
  }

  const pricingHeaders = parseCSVLine(pricingLines[0]);
  const pricingData = pricingLines.slice(1).map(line => parseCSVLine(line));
  
  console.log('Pricing headers:', pricingHeaders);
  console.log('Found', pricingData.length, 'pricing rows');
  
  const productPricing: ProductPricing[] = [];
  let pricingId = 1;
  
  // Create a map of product types for faster lookup - key is "ProductName ProductType"
  const typeMap = new Map<string, ProductType>();
  
  // Load product data to understand the full product structure
  const productFilePath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
  if (fs.existsSync(productFilePath)) {
    const productCsvContent = fs.readFileSync(productFilePath, 'utf-8');
    const productLines = productCsvContent.split('\n').filter(line => line.trim());
    const productHeaders = parseCSVLine(productLines[0]);
    const productData = productLines.slice(1).map(line => parseCSVLine(line));
    
    console.log('Product headers:', productHeaders);
    console.log('Found', productData.length, 'product rows');
    
    // Build lookup map: "ProductName ProductType" -> ProductType object
    productData.forEach((row, index) => {
      const data: any = {};
      productHeaders.forEach((header, i) => {
        data[header] = row[i] || '';
      });
      
      const productName = data.ProductName || '';
      const productType = data.ProductType || '';
      const fullProductKey = `${productName} ${productType}`.toLowerCase().trim();
      
      // Find the matching type from our loaded types
      const matchingType = types.find(type => 
        type.name.toLowerCase() === productType.toLowerCase()
      );
      
      if (matchingType) {
        typeMap.set(fullProductKey, matchingType);
        // Also map just the product type for fallback
        typeMap.set(productType.toLowerCase().trim(), matchingType);
      }
    });
  }
  
  console.log('Built type map with', typeMap.size, 'entries');
  
  // Process pricing data
  pricingData.forEach((row, index) => {
    const data: any = {};
    pricingHeaders.forEach((header, i) => {
      data[header] = row[i] || '';
    });
    
    const productTypeFromCsv = data.productType || '';
    console.log(`Row ${index + 1}: Looking for pricing "${productTypeFromCsv}"`);
    
    // Try to find matching product type
    let matchedType: ProductType | undefined;
    
    // Direct lookup in our map
    const lookupKey = productTypeFromCsv.toLowerCase().trim();
    matchedType = typeMap.get(lookupKey);
    
    if (!matchedType) {
      // Try variations
      const variations = [
        productTypeFromCsv.toLowerCase().replace(/\s+/g, ' ').trim(),
        productTypeFromCsv.toLowerCase().replace(/-/g, ' ').trim(),
        productTypeFromCsv.toLowerCase().replace(/graffiti\s+/i, '').trim(),
        productTypeFromCsv.toLowerCase().replace(/polyester\s+paper\s+/i, 'thickness: ').trim(),
        productTypeFromCsv.toLowerCase().replace(/blended\s+poly\s+/i, 'thickness: ').trim(),
        productTypeFromCsv.toLowerCase().replace(/soft\s+poly\s+/i, 'thickness: ').trim(),
      ];
      
      for (const variation of variations) {
        matchedType = typeMap.get(variation);
        if (matchedType) {
          console.log(`  Found with variation: "${variation}"`);
          break;
        }
      }
    }
    
    if (matchedType) {
      console.log(`Found matching type: ${matchedType.name} (ID: ${matchedType.id}) for "${productTypeFromCsv}"`);
      
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
            pricePerSquareMeter: price.toString()
          });
        }
      });
    } else {
      console.log(`No matching product type found for: "${productTypeFromCsv}"`);
    }
  });
  
  console.log(`Created ${productPricing.length} pricing entries from external pricing file`);
  return productPricing;
}

export function parseProductDataAndPricing() {
  try {
    const productFilePath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
    
    if (!fs.existsSync(productFilePath)) {
      throw new Error('Product data file not found');
    }

    const csvContent = fs.readFileSync(productFilePath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Product data file is empty');
    }

    const headers = parseCSVLine(lines[0]);
    const data = lines.slice(1).map(line => parseCSVLine(line));
    
    console.log('Product data headers:', headers);
    console.log('Found', data.length, 'product rows');

    // Build data structures
    const categoryMap = new Map<string, ProductCategory>();
    const typeMap = new Map<string, ProductType>();
    const sizes: ProductSize[] = [];
    
    let categoryId = 1;
    let typeId = 1;
    let sizeId = 1;

    data.forEach(row => {
      const rowData: any = {};
      headers.forEach((header, i) => {
        rowData[header] = row[i] || '';
      });

      const productName = rowData.ProductName || '';
      const productType = rowData.ProductType || '';
      const size = rowData.Size || '';
      const itemCode = rowData.ItemCode || '';
      const minOrderQty = rowData.MinOrderQty || '';

      // Create or get category
      if (!categoryMap.has(productName)) {
        categoryMap.set(productName, {
          id: categoryId++,
          name: productName,
          description: null
        });
      }
      const category = categoryMap.get(productName)!;

      // Create unique key for product type within category
      const typeKey = `${productName}-${productType}`;
      if (!typeMap.has(typeKey)) {
        typeMap.set(typeKey, {
          id: typeId++,
          categoryId: category.id,
          name: productType,
          description: null
        });
      }
      const type = typeMap.get(typeKey)!;

      // Parse size dimensions
      const sizeMatch = size.match(/(\d+(?:\.\d+)?)"?\s*x\s*(\d+(?:\.\d+)?)"?/);
      let width = 0, height = 0, squareMeters = 0;
      
      if (sizeMatch) {
        width = parseFloat(sizeMatch[1]);
        height = parseFloat(sizeMatch[2]);
        squareMeters = (width * height) / 1550; // Convert square inches to square meters
      }

      // Create product size
      sizes.push({
        id: sizeId++,
        typeId: type.id,
        name: size,
        width: width.toString(),
        height: height.toString(),
        widthUnit: "inch",
        heightUnit: "inch", 
        squareMeters: squareMeters.toString(),
        itemCode: itemCode,
        minOrderQty: minOrderQty
      });
    });

    const categories = Array.from(categoryMap.values());
    const typeArray = Array.from(typeMap.values());
    
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
    
    // Load pricing data using new logic
    const productPricing = parsePricingDataWithNewLogic(typeArray);
    
    console.log(`Loaded ${categories.length} categories, ${typeArray.length} types, ${sizes.length} sizes, ${productPricing.length} pricing entries`);
    
    return { categories, types: typeArray, sizes, pricing: productPricing, tiers: pricingTiers };
    
  } catch (error) {
    console.error('Error parsing product data:', error);
    throw error;
  }
}