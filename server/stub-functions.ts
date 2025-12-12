// stub-function.ts

import fs from "fs";
import path from "path";
import axios from "axios";
import { generatePaymentInstructionsHTML } from "./config/paymentInstructions";

// Cache for logo to avoid repeated network requests
let logoCache: string | null = null;

// Cache for product category logos
const productLogoCache: Record<string, string> = {};

// Product category logo mappings
const PRODUCT_LOGO_FILES: Record<string, string> = {
  'graffiti': 'Graffiti-Logo--long_1765564746224.png',
  'graffitistick': 'GraffitiSTICK-left_align_1765564758521.jpg',
  'slickstick': 'GraffitiSTICK-left_align_1765564758521.jpg',
  'cliq': 'CLIQ_Final_logo2_med_size_1765564721731.png',
  'solvit': 'Solvit_Logo-new_1765564775082.png',
  'rang': 'Rang_Print_Canvas_Logo_1765564783260.png',
  'canvas': 'Rang_Print_Canvas_Logo_1765564783260.png',
  'photo': 'CLIQ_Final_logo2_med_size_1765564721731.png',
  'eie': 'CLIQ_Final_logo2_med_size_1765564721731.png',
  'ele': 'CLIQ_Final_logo2_med_size_1765564721731.png',
  'paper': 'CLIQ_Final_logo2_med_size_1765564721731.png',
};

// Product features by category
const PRODUCT_FEATURES: Record<string, string[]> = {
  'graffiti': ['Scuff Free', 'Waterproof', 'Tear Resistant', 'High Rigidity', 'Excellent Alcohol & Stain Resistance'],
  'graffitistick': ['Self-Adhesive', 'Waterproof', 'Tear Resistant', 'Easy Application', 'Removable or Permanent Options'],
  'slickstick': ['Self-Adhesive', 'Waterproof', 'Tear Resistant', 'Easy Application'],
  'solvit': ['Sign & Display Media', 'Indoor/Outdoor Use', 'UV Resistant', 'Durable'],
  'rang': ['Premium Canvas', 'Archival Quality', 'True Color Reproduction', 'Artist Grade'],
  'cliq': ['Photo Quality', 'Archival Inks Compatible', 'High Color Gamut', 'Instant Dry'],
  'photo': ['Photo Quality', 'High Color Gamut', 'Premium Finish'],
  'default': ['Premium Quality', 'Professional Grade', 'Reliable Performance'],
};

// Priority order for matching - more specific first
const LOGO_MATCH_ORDER = ['graffitistick', 'slickstick', 'graffiti', 'solvit', 'rang', 'canvas', 'cliq', 'photo', 'eie', 'ele', 'paper'];
const FEATURE_MATCH_ORDER = ['graffitistick', 'slickstick', 'graffiti', 'solvit', 'rang', 'cliq', 'photo'];

function getProductLogoBase64(productType: string): string {
  const normalized = productType.toLowerCase();
  
  // Find matching logo key using priority order (more specific first)
  let logoKey = 'default';
  for (const key of LOGO_MATCH_ORDER) {
    if (normalized.includes(key)) {
      logoKey = key;
      break;
    }
  }
  
  // Return cached logo if available
  if (productLogoCache[logoKey]) {
    return productLogoCache[logoKey];
  }
  
  // Load logo from file
  const logoFile = PRODUCT_LOGO_FILES[logoKey];
  if (logoFile) {
    const logoPath = path.join(process.cwd(), 'attached_assets', logoFile);
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath);
      const ext = logoFile.endsWith('.jpg') || logoFile.endsWith('.jpeg') ? 'jpeg' : 'png';
      productLogoCache[logoKey] = `data:image/${ext};base64,${buffer.toString('base64')}`;
      return productLogoCache[logoKey];
    }
  }
  
  return '';
}

function getProductFeatures(productType: string): string[] {
  const normalized = productType.toLowerCase();
  
  // Use priority order (more specific first)
  for (const key of FEATURE_MATCH_ORDER) {
    if (normalized.includes(key)) {
      return PRODUCT_FEATURES[key] || PRODUCT_FEATURES['default'];
    }
  }
  
  return PRODUCT_FEATURES['default'];
}

async function getLogoBase64FromURL(): Promise<string> {
  // Return cached logo if available
  if (logoCache !== null) {
    return logoCache;
  }
  
  // Use the logo from public directory
  const logoPath = path.join(process.cwd(), "client", "public", "4s-graphics-logo.png");
  
  if (fs.existsSync(logoPath)) {
    const buffer = fs.readFileSync(logoPath);
    logoCache = buffer.toString("base64");
    console.log("✓ Using 4S Graphics logo from public directory");
    return logoCache;
  }
  
  console.error("❌ 4S Graphics logo not found in public directory");
  logoCache = "";
  return logoCache;
}

export function generateQuoteNumber(): string {
  return `Q${Date.now()}`;
}

export function generateUniqueQuoteNumber(): string {
  // Generate 7-digit alphanumeric quote number
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(
    { length: 7 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export function validateQuoteNumber(quoteNumber: string): boolean {
  return typeof quoteNumber === 'string' && quoteNumber.length > 0;
}

export async function generateQuoteHTMLForDownload(data: any): Promise<string> {
  const { customerName, quoteNumber, quoteItems, totalAmount, title = "QUICK QUOTE" } = data;
  const logo = await getLogoBase64FromURL();

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Group items by product type
  const itemsByType: { [key: string]: any[] } = {};
  quoteItems.forEach((item: any) => {
    if (!itemsByType[item.productType]) {
      itemsByType[item.productType] = [];
    }
    itemsByType[item.productType].push(item);
  });

  // Get category display name function
  function getCategoryDisplayName(productType: string): string {
    const categoryMappings: { [key: string]: string } = {
      // CLiQ products
      'CliQ Cold Press Paper 300gsm': 'CLiQ Aqueous Media',
      'Cold Press Paper 300gsm': 'CLiQ Aqueous Media',
      'CliQ Hot Press Paper 270gsm': 'CLiQ Aqueous Media',
      'CliQ Cotton Rag Paper 300gsm': 'CLiQ Aqueous Media',
      'CliQ Inkjet Matte Paper 230gsm': 'CLiQ Aqueous Media',
      'CliQ PETBull 7mil': 'CLiQ Aqueous Media',
      'CliQ Photo Paper 10.4mil': 'CLiQ Aqueous Media',
      'CliQ Photo Paper 11.2 mil': 'CLiQ Aqueous Media',
      'CliQ Banner Media - 15mil': 'CLiQ Aqueous Media',
      'CliQ Inkjet Matte Paper 170gsm': 'CLiQ Aqueous Media',
      'CliQ Photo Paper 8.4mil': 'CLiQ Aqueous Media',
      'CliQ Self Adhesive Vinyl - 5mil (PVC)': 'CLiQ Aqueous Media',
      'CliQ SlickStick 10.4mil': 'CLiQ Aqueous Media',
      // Graffiti products
      'Graffiti Polyester Paper': 'Graffiti Polyester Paper',
      'AuraBoard - Holographics': 'Graffiti Polyester Paper',
      'AuraBoard - Silver': 'Graffiti Polyester Paper',
      'thickness: 5mil': 'Graffiti Polyester Paper',
      'thickness: 8mil': 'Graffiti Polyester Paper',
      'thickness: 10mil': 'Graffiti Polyester Paper',
      'thickness: 11mil': 'Graffiti Polyester Paper',
      'thickness: 14mil': 'Graffiti Polyester Paper',
      // Solvit products
      'Solvit Poster Paper 175gsm': 'Solvit Sign & Display Media',
      'Solvit Backlit Film 8mil': 'Solvit Sign & Display Media',
      'Solvit Self Adhesive Vinyl - 4mil (Greyback)': 'Solvit Sign & Display Media',
      'Solvit Self Adhesive Vinyl - 6mil (white Back)': 'Solvit Sign & Display Media',
      // CoHo products
      'CoHo Films for Fabrics': 'DTF Films',
      // Rang products
      'Rang DL Polyester Canvas 280gsm': 'Rang Print Canvas',
      'Rang Duo PolyCotton Canvas 400gsm': 'Rang Print Canvas',
      'Rang Duo PolyCotton Canvas 420gsm': 'Rang Print Canvas',
      // EiE/eLe products
      'EiE Inkjet Waterproof Film': 'EiE Media',
      'eLe Frosted Laser Film': 'eLe Laser Media',
      'eLe Clear Laser Film': 'eLe Laser Media',
      'eLe Polyester Laser Plate MXP': 'MXP Media'
    };

    return categoryMappings[productType] || productType;
  }

  // Generate separate tables for each product type
  const productTables = Object.entries(itemsByType).map(([productType, items]) => {
    const categoryName = getCategoryDisplayName(productType);
    
    const productRows = items.map((item: any, index: number) => {
      // Use the updated quantity from the frontend
      const displayQty = item.quantity;
      // Use the already calculated total from the frontend (includes retail rounding)
      const itemTotal = item.total;
      // Determine unit based on minimum order quantity
      const unitLabel = (item.minOrderQty === 1) ? 'roll' : 'sheet';
      
      return `
        <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f9f9f9'};">
          <td style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:center;">${item.itemCode || '-'}</td>
          <td style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;">${item.size}</td>
          <td style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:center;">${displayQty}</td>
          <td style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:center;">${item.minOrderQty || 0}</td>
          <td style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:right;">$${item.pricePerSheet.toFixed(2)}/${unitLabel}</td>
          <td style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:right;font-weight:500;">$${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="margin-bottom: 25px;">
        <div style="margin-bottom: 10px;">
          <div style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; color: #1f2937;">${productType}</div>
        </div>
        <table width="100%" style="border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="background:#bfdbfe;color:#000000;">
              <th style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:center;font-weight:700;">Item Code</th>
              <th style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:left;font-weight:700;">Size</th>
              <th style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:center;font-weight:700;">Quantity</th>
              <th style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:center;font-weight:700;">Min Order Qty</th>
              <th style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:right;font-weight:700;">Price/Unit</th>
              <th style="font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding:8px;text-align:right;font-weight:700;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${title} - ${quoteNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
        
        body {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 12px;
          font-weight: 400;
          padding: 24px;
          color: #333;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          margin-bottom: 32px;
          background-color: white;
          border: 1px solid #e5e7eb;
          padding: 20px;
          border-radius: 8px;
        }
        .header img {
          height: 45px;
          display: block;
          margin: 0 auto 15px auto;
        }
        .company-name {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 22px;
          font-weight: 700;
          margin-top: 10px;
        }
        .company-details {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 13px;
          font-weight: 300;
          margin-top: 4px;
          color: #374151;
        }
        .document-title {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 18px;
          font-weight: 700;
          margin: 15px 0;
          text-transform: uppercase;
          color: #1f2937;
          text-align: center;
        }
        .quote-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          border: 1px solid #ccc;
          padding: 10px;
          border-radius: 6px;
        }
        .quote-info div {
          font-size: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          border: 1px solid #ccc;
          padding: 8px;
        }
        th {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          background-color: #f0f4f8;
          text-align: left;
          font-weight: 700;
        }
        .total {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          text-align: right;
          font-size: 16px;
          font-weight: 700;
          margin-top: 24px;
        }
        .footer {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 11px;
          font-weight: 300;
          margin-top: 40px;
          line-height: 1.5;
          color: #555;
        }
        .footer p {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          margin: 5px 0;
        }
        .footer strong {
          font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${logo ? `<img src="data:image/png;base64,${logo}" alt="4S Graphics Logo" style="height: 45px; display: block; margin: 0 auto 15px auto;" />` : ''}
        <div class="company-name">4S Graphics, Inc.</div>
        <div class="company-details">
          764 NW 57th Court, Fort Lauderdale, FL 33309<br>
          Phone: (954) 493.6484 | Website: https://4sgraphics.com/
        </div>
      </div>

      <div class="document-title">${title}</div>

      <div><strong>Quote #:</strong> ${quoteNumber} <span style="float:right;"><strong>Date:</strong> ${currentDate}</span></div>
      <p><strong>Prepared for:</strong> ${customerName}</p>

      <div class="items-section">
        ${productTables}
      </div>

      <div class="total">Total Amount: $${totalAmount.toFixed(2)}</div>

      <div class="footer">
        <p><strong>Payment Instructions</strong></p>
        <p>All payments should be made to 4S GRAPHICS, INC. only.</p>
        <p>ACH Payments: Account# 0126734133 | Routing# 063104668 | SWIFT: UPNBUS44 / ABA: 062005690</p>
        <p>Credit Cards: Visa, MasterCard, and AmEx (4.5% processing fee applies)</p>
        <p>Zelle: 260-580-0526</p>
        <p>PayPal: info@4sgraphics.com (4.5% fee applies)</p>
        <p>Shipping Costs: At Actuals — Discuss with Sales Rep</p>
      </div>
    </body>
    </html>
  `;
}

// Category mapping function to get proper category display names
function getCategoryDisplayName(productName: string, productType: string): string {
  
  // Category mappings based on product types - comprehensive mapping for all products
  const categoryMappings: { [key: string]: string } = {
    // Graffiti Polyester Paper products
    'Graffiti Polyester Paper': 'Graffiti Polyester Paper',
    'AuraBoard - Holographics': 'Graffiti Polyester Paper',
    
    // Graffiti Blended Poly products
    'Graffiti Blended Poly': 'Graffiti Blended Poly',
    
    // Graffiti SOFT Poly products  
    'Graffiti SOFT Poly': 'Graffiti SOFT Poly',
    
    // Graffiti STICK products
    'Graffiti STICK': 'Graffiti STICK',
    
    // Solvit products
    'Solvit Poster Paper 175gsm': 'Solvit Sign & Display Media',
    'Solvit Backlit Film 8mil': 'Solvit Sign & Display Media',
    'Solvit Self Adhesive Vinyl - 4mil (Greyback)': 'Solvit Sign & Display Media',
    'Solvit Self Adhesive Vinyl - 6mil (white Back)': 'Solvit Sign & Display Media',
    'Solvit PolySign 11mil': 'Solvit Sign & Display Media',
    'Solvit PolySign 17mil': 'Solvit Sign & Display Media',
    'Solvit SlickStick 5mil Polyester': 'Solvit Sign & Display Media',
    
    // CLiQ products
    'CliQ Cold Press Paper 300gsm': 'CLiQ Aqueous Media',
    'Cold Press Paper 300gsm': 'CLiQ Aqueous Media',
    'CliQ Hot Press Paper 270gsm': 'CLiQ Aqueous Media',
    'CliQ Cotton Rag Paper 300gsm': 'CLiQ Aqueous Media',
    'CliQ Inkjet Matte Paper 230gsm': 'CLiQ Aqueous Media',
    'CliQ PETBull 7mil': 'CLiQ Aqueous Media',
    'CliQ Photo Paper 10.4mil': 'CLiQ Aqueous Media',
    'CliQ Photo Paper 11.2 mil': 'CLiQ Aqueous Media',
    'CliQ Banner Media - 15mil': 'CLiQ Aqueous Media',
    'CliQ Inkjet Matte Paper 170gsm': 'CLiQ Aqueous Media',
    'CliQ Photo Paper 8.4mil': 'CLiQ Aqueous Media',
    'CliQ Self Adhesive Vinyl - 5mil (PVC)': 'CLiQ Aqueous Media',
    'CliQ SlickStick 10.4mil': 'CLiQ Aqueous Media',
    
    // Rang products
    'Rang DL Polyester Canvas 280gsm': 'Rang Print Canvas',
    'Rang Duo PolyCotton Canvas 400gsm': 'Rang Print Canvas',
    'Rang Duo PolyCotton Canvas 420gsm': 'Rang Print Canvas',
    'Rang Lux PolyCotton Canvas 345gsm': 'Rang Print Canvas',
    'Rang Lux PolyCotton Canvas 380gsm': 'Rang Print Canvas',
    'Rang Lux PolyCotton Canvas 390gsm': 'Rang Print Canvas',
    
    // EiE/eLe products
    'EiE Inkjet Waterproof Film': 'EiE Media',
    'eLe Frosted Laser Film': 'eLe Laser Media',
    'eLe Clear Laser Film': 'eLe Laser Media',
    'eLe Polyester Laser Plate MXP': 'MXP Media',
    
    // CoHo products
    'CoHo DTF Films for Fabrics': 'DTF Films',
    'CoHo Films for Fabrics': 'DTF Films',
    
    // Screen Printing products
    'Screen Printing': 'Screen Printing Media',
    
    // Offset Plates products
    'Offset Plates': 'Offset Plates Media'
  };

  // Normalize input for fuzzy matching
  const normalized = productType.trim().toLowerCase();
  
  // Check for direct mapping first
  if (categoryMappings[productType]) {
    return categoryMappings[productType];
  }
  
  // Check for fuzzy matching (normalized)
  const normalizedKey = Object.keys(categoryMappings).find(key => key.toLowerCase() === normalized);
  if (normalizedKey) {
    return categoryMappings[normalizedKey];
  }
  
  // Pattern matching for common prefixes (normalized)
  if (normalized.startsWith('graffiti')) {
    if (normalized.includes('polyester paper')) return 'Graffiti Polyester Paper';
    if (normalized.includes('blended poly')) return 'Graffiti Blended Poly';
    if (normalized.includes('soft poly')) return 'Graffiti SOFT Poly';
    if (normalized.includes('stick')) return 'Graffiti STICK';
    return 'Graffiti Media';
  }
  
  if (normalized.startsWith('solvit')) {
    return 'Solvit Sign & Display Media';
  }
  
  if (normalized.startsWith('cliq') || normalized.startsWith('cold press')) {
    return 'CLiQ Aqueous Media';
  }
  
  if (normalized.startsWith('rang')) {
    return 'Rang Print Canvas';
  }
  
  if (normalized.startsWith('eie')) {
    return 'EiE Media';
  }
  
  if (normalized.startsWith('ele')) {
    return 'eLe Laser Media';
  }
  
  if (normalized.startsWith('coho')) {
    return 'DTF Films';
  }

  // Fall back to product name (category name) or original productType for display
  return productName || productType || 'Product Media';
}

export async function generatePriceListHTML(data: any): Promise<string> {
  const { categoryName, tierName, items, customerName, title = "PRICE LIST", quoteNumber } = data;

  // Format dates
  const issueDate = new Date();
  const validUntil = new Date(issueDate);
  validUntil.setMonth(validUntil.getMonth() + 6);
  
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const issueDateStr = formatDate(issueDate);
  const validUntilStr = formatDate(validUntil);

  // Generate list number if not provided
  const listNumber = quoteNumber || `PL-${Date.now().toString().slice(-6)}`;

  // Get tier display name for header
  const tierDisplayNames: Record<string, string> = {
    'exportPrice': 'EXPORT PRICING',
    'masterDistributorPrice': 'MASTER DISTRIBUTOR PRICING',
    'dealerPrice': 'DEALER-VIP PRICING',
    'dealer2Price': 'DEALER PRICING',
    'approvalNeededPrice': 'SHOPIFY LOWEST PRICING',
    'tierStage25Price': 'SHOPIFY 3 PRICING',
    'tierStage2Price': 'SHOPIFY 2 PRICING',
    'tierStage15Price': 'SHOPIFY 1 PRICING',
    'tierStage1Price': 'SHOPIFY-ACCOUNT PRICING',
    'retailPrice': 'RETAIL PRICING',
  };
  const tierDisplay = tierDisplayNames[tierName] || tierName?.toUpperCase() || 'PRICING';

  // Group items by product type
  const grouped = items.reduce((acc: any, item: any) => {
    if (!acc[item.productType]) acc[item.productType] = [];
    acc[item.productType].push(item);
    return acc;
  }, {});

  // Sort by the first item's sortOrder to preserve CSV file order
  const sortedProductTypes = Object.keys(grouped).sort((a, b) => {
    const aFirstItem = grouped[a][0];
    const bFirstItem = grouped[b][0];
    const aSortOrder = aFirstItem?.sortOrder || 999999;
    const bSortOrder = bFirstItem?.sortOrder || 999999;
    return aSortOrder - bSortOrder;
  });

  // Determine primary product logo and features from first product type
  const primaryProductType = sortedProductTypes[0] || categoryName || '';
  const productLogo = getProductLogoBase64(primaryProductType);
  const productFeatures = getProductFeatures(primaryProductType);

  // Calculate total items for page numbering
  const totalItems = items.length;
  const itemsPerPage = 25;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const sections = sortedProductTypes.map((type) => {
    const rows = grouped[type];
    const rowHtml = (rows as any[]).map((row: any, index: number) => {
      const minQtyValue = row.minOrderQty || row.minQty || row.minQuantity || row.min_quantity || 1;
      const unitLabel = minQtyValue === 1 ? 'roll' : 'sheet';
      const pricePerSheet = row.pricePerSheet || 0;
      const pricePerPack = row.total || row.pricePerPack || (pricePerSheet * minQtyValue);
      
      return `
      <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f5f5f5'}; border-bottom: 1px solid #ddd;">
        <td style="font-family: Arial, sans-serif; padding: 6px 8px; font-size: 9px; border-left: 1px solid #ccc;">${row.size || 'N/A'}</td>
        <td style="font-family: 'Courier New', monospace; padding: 6px 8px; text-align: center; font-size: 9px; font-weight: 500;">${row.itemCode || '-'}</td>
        <td style="font-family: Arial, sans-serif; padding: 6px 8px; text-align: center; font-size: 9px;">${minQtyValue}</td>
        <td style="font-family: Arial, sans-serif; padding: 6px 8px; text-align: right; font-size: 9px;">$${pricePerSheet.toFixed(2)}</td>
        <td style="font-family: Arial, sans-serif; padding: 6px 8px; text-align: right; font-size: 9px; font-weight: 600; border-right: 1px solid #ccc;">$${pricePerPack.toFixed(2)}</td>
      </tr>
      `;
    }).join('');

    return `
      <div style="page-break-inside: avoid; margin-bottom: 20px;">
        <table width="100%" style="border-collapse: collapse; margin-bottom: 0;">
          <thead>
            <tr style="background: linear-gradient(180deg, #2c3e50 0%, #1a252f 100%);">
              <th colspan="5" style="font-family: Arial, sans-serif; padding: 10px 12px; color: white; font-weight: 700; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #1a252f;">
                ${type}
              </th>
            </tr>
            <tr style="background: #e8e8e8;">
              <th style="font-family: Arial, sans-serif; padding: 8px; border: 1px solid #ccc; color: #333; font-weight: 600; text-align: left; font-size: 9px; width: 25%;">Size</th>
              <th style="font-family: Arial, sans-serif; padding: 8px; border: 1px solid #ccc; color: #333; font-weight: 600; text-align: center; font-size: 9px; width: 25%;">Product Code</th>
              <th style="font-family: Arial, sans-serif; padding: 8px; border: 1px solid #ccc; color: #333; font-weight: 600; text-align: center; font-size: 9px; width: 15%;">Packing/Carton</th>
              <th style="font-family: Arial, sans-serif; padding: 8px; border: 1px solid #ccc; color: #333; font-weight: 600; text-align: right; font-size: 9px; width: 15%;">Price/Sheet</th>
              <th style="font-family: Arial, sans-serif; padding: 8px; border: 1px solid #ccc; color: #333; font-weight: 600; text-align: right; font-size: 9px; width: 20%;">Price/Pack</th>
            </tr>
          </thead>
          <tbody>
            ${rowHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${title} - ${categoryName}</title>
      <style>
        @page {
          size: letter;
          margin: 0.5in;
        }
        
        body {
          font-family: Arial, Helvetica, sans-serif;
          margin: 0;
          padding: 0;
          font-size: 10px;
          color: #333;
          background: #ffffff;
          line-height: 1.3;
        }
        
        .page-container {
          max-width: 8in;
          margin: 0 auto;
          padding: 10px;
        }
        
        .header-section {
          margin-bottom: 15px;
        }
        
        .product-logo {
          height: 50px;
          max-width: 200px;
          object-fit: contain;
          margin-bottom: 10px;
        }
        
        .features-banner {
          background: linear-gradient(90deg, #f8f9fa 0%, #e9ecef 100%);
          padding: 8px 12px;
          border-left: 4px solid #2c3e50;
          margin-bottom: 10px;
          font-size: 10px;
          color: #495057;
        }
        
        .features-banner .primary {
          font-weight: 600;
          color: #2c3e50;
          margin-bottom: 2px;
        }
        
        .features-banner .secondary {
          font-style: italic;
          font-size: 9px;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
          padding: 10px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
        }
        
        .info-left {
          font-size: 9px;
          color: #6c757d;
        }
        
        .info-right {
          text-align: right;
        }
        
        .tier-badge {
          display: inline-block;
          background: linear-gradient(180deg, #28a745 0%, #1e7e34 100%);
          color: white;
          padding: 6px 16px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          border-radius: 2px;
          margin-bottom: 5px;
        }
        
        .date-info {
          font-size: 9px;
          color: #495057;
          line-height: 1.5;
        }
        
        .date-info strong {
          color: #212529;
        }
        
        .customer-bar {
          background: #fff3cd;
          border: 1px solid #ffc107;
          padding: 8px 12px;
          margin-bottom: 15px;
          font-size: 10px;
        }
        
        .customer-bar strong {
          color: #856404;
        }
        
        .footer-section {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 2px solid #2c3e50;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9px;
          color: #6c757d;
        }
        
        .footer-contact {
          font-weight: 500;
          color: #495057;
        }
        
        .footer-page {
          font-weight: 600;
          color: #495057;
        }
        
        @media print {
          body { 
            margin: 0; 
            padding: 0;
          }
          .page-container {
            max-width: none;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="page-container">
        <!-- Header with Product Logo -->
        <div class="header-section">
          ${productLogo ? `<img src="${productLogo}" alt="Product Logo" class="product-logo" />` : ''}
          
          <!-- Features Banner -->
          <div class="features-banner">
            <div class="primary">${productFeatures.slice(0, 3).join(' / ')}</div>
            ${productFeatures.length > 3 ? `<div class="secondary">${productFeatures.slice(3).join(' / ')}</div>` : ''}
          </div>
        </div>
        
        <!-- Info Row -->
        <div class="info-row">
          <div class="info-left">
            <div style="font-size: 10px; color: #495057; margin-bottom: 3px;">Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh, Fuji Inkjet and others</div>
            <div style="font-size: 9px; color: #6c757d;">List #: <strong style="color: #495057;">${listNumber}</strong></div>
          </div>
          <div class="info-right">
            <div class="tier-badge">${tierDisplay}</div>
            <div class="date-info">
              <div><strong>Date of Issue:</strong> ${issueDateStr}</div>
              <div><strong>Valid Until:</strong> ${validUntilStr}</div>
            </div>
          </div>
        </div>
        
        ${customerName && customerName !== "N/A" ? `
        <div class="customer-bar">
          <strong>Prepared for:</strong> ${customerName}
        </div>
        ` : ''}
        
        <!-- Product Tables -->
        ${sections}
        
        <!-- Footer -->
        <div class="footer-section">
          <div class="footer-contact">
            Phone: (954) 493-6484 &nbsp;&nbsp;|&nbsp;&nbsp; www.4sgraphics.com
          </div>
          <div class="footer-page">
            Page 1 of ${totalPages}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}