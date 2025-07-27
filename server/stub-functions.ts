// stub-function.ts

import fs from "fs";
import path from "path";
import axios from "axios";
import { generatePaymentInstructionsHTML } from "./config/paymentInstructions";

// Cache for logo to avoid repeated network requests
let logoCache: string | null = null;

async function getLogoBase64FromURL(): Promise<string> {
  // Return cached logo if available
  if (logoCache !== null) {
    return logoCache;
  }
  
  try {
    const imageUrl = "https://cdn.shopify.com/s/files/1/3039/2358/files/4s-logo-high-res.png?v=1688121438";
    const response = await axios.get(imageUrl, { 
      responseType: "arraybuffer",
      headers: {
        'Accept': 'image/png,image/*,*/*'
      }
    });
    
    // Check if we actually got an image (not an HTML 404 page)
    if (response.status === 200 && response.headers['content-type']?.startsWith('image/')) {
      const buffer = Buffer.from(response.data, "binary");
      logoCache = buffer.toString("base64");
      console.log("✓ Successfully fetched 4S Graphics logo from CDN");
      return logoCache;
    } else {
      throw new Error(`Invalid response: ${response.status} - ${response.headers['content-type']}`);
    }
  } catch (error) {
    console.error("❌ Failed to fetch logo from CDN, falling back to local file:", error);
    
    // Fallback to local file
    const logoPath = path.join(process.cwd(), "client", "public", "4s-logo-high-res.png");
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath);
      logoCache = buffer.toString("base64");
      console.log("✓ Using local 4S Graphics logo as fallback");
      return logoCache;
    }
    
    console.error("❌ No logo available - both CDN and local fallback failed");
    logoCache = "";
    return logoCache;
  }
}

export function generateQuoteNumber(): string {
  return `Q${Date.now()}`;
}

export function generateUniqueQuoteNumber(): string {
  return `Q${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function validateQuoteNumber(quoteNumber: string): boolean {
  return typeof quoteNumber === 'string' && quoteNumber.length > 0;
}

export function generateQuoteHTMLForDownload(data: any): string {
  const { customerName, quoteNumber, quoteItems, totalAmount, title = "QUICK QUOTE" } = data;
  const logo = getLogoBase64();

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
      const orderQty = Math.max(item.minOrderQty || 0, item.quantity);
      const itemTotal = orderQty * item.pricePerSheet;
      // Determine unit based on minimum order quantity
      const unitLabel = (item.minOrderQty === 1) ? 'roll' : 'sheet';
      
      return `
        <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
          <td style="padding: 8px 12px; border: 1px solid #dee2e6; font-family: monospace; color: #000;">${item.itemCode || '-'}</td>
          <td style="padding: 8px 12px; border: 1px solid #dee2e6; color: #000;">${item.size}</td>
          <td style="padding: 8px 12px; border: 1px solid #dee2e6; text-align: center; color: #000;">${item.minOrderQty || 0}</td>
          <td style="padding: 8px 12px; border: 1px solid #dee2e6; text-align: right; color: #000;">$${item.pricePerSheet.toFixed(2)}/${unitLabel}</td>
          <td style="padding: 8px 12px; border: 1px solid #dee2e6; text-align: right; font-weight: bold; color: #000;">$${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="margin-bottom: 25px;">
        <div style="margin-bottom: 10px;">
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${productType}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; background-color: white; border: 1px solid #ddd;">
          <thead>
            <tr style="background-color: #bfdbfe;">
              <th style="padding: 10px 12px; color: #000; text-align: left; font-weight: bold; font-size: 11px; border: 1px solid #dee2e6;">Item Code</th>
              <th style="padding: 10px 12px; color: #000; text-align: left; font-weight: bold; font-size: 11px; border: 1px solid #dee2e6;">Size</th>
              <th style="padding: 10px 12px; color: #000; text-align: center; font-weight: bold; font-size: 11px; border: 1px solid #dee2e6;">Min Order Qty</th>
              <th style="padding: 10px 12px; color: #000; text-align: right; font-weight: bold; font-size: 11px; border: 1px solid #dee2e6;">Price/Unit</th>
              <th style="padding: 10px 12px; color: #000; text-align: right; font-weight: bold; font-size: 11px; border: 1px solid #dee2e6;">Total</th>
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
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          font-size: 12px;
          color: #000;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .header img {
          height: 60px;
        }
        .company-name {
          font-size: 22px;
          font-weight: 700;
          margin-top: 10px;
        }
        .company-details {
          font-size: 13px;
          margin-top: 4px;
          color: #374151;
        }
        .document-title {
          font-size: 18px;
          font-weight: bold;
          margin: 30px 0 10px;
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
          background-color: #f0f4f8;
          text-align: left;
          font-weight: 600;
        }
        .total {
          margin-top: 20px;
          text-align: right;
          font-size: 14px;
          font-weight: bold;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #555;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">4S Graphics, Inc.</div>
        <div class="company-details">
          764 NW 57th Court, Fort Lauderdale, FL 33309<br>
          Phone: (954) 493.6484 | Website: https://4sgraphics.com/
        </div>
      </div>

      <div class="document-title">${title}</div>

      <div class="quote-info">
        <div><strong>Quote #:</strong> ${quoteNumber}</div>
        <div><strong>Date:</strong> ${currentDate}</div>
      </div>

      <div style="margin-bottom: 20px; padding: 10px; background-color: #f5f5f5;">
        <div style="font-weight: bold;">Prepared for: ${customerName}</div>
      </div>

      <div class="items-section">
        ${productTables}
      </div>

      <div class="total" style="margin-top: 25px; text-align: right; padding: 15px; background-color: #f9f9f9;">
        <strong style="font-size: 16px;">Total Amount: $${totalAmount.toFixed(2)}</strong>
      </div>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For questions about this quote, please contact us at (954) 493.6484</p>
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
  const logo = await getLogoBase64FromURL();

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Generate quote number if not provided
  const listNumber = quoteNumber || `PL-${Date.now().toString().slice(-6)}`;

  const grouped = items.reduce((acc: any, item: any) => {
    if (!acc[item.productType]) acc[item.productType] = [];
    acc[item.productType].push(item);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([type, rows]) => {
    const rowHtml = (rows as any[]).map((row: any, index: number) => {
      // Debug logging for each row - check all possible min qty field names
      console.log('Processing PDF row:', {
        size: row.size,
        itemCode: row.itemCode,
        minQty: row.minQty,
        minOrderQty: row.minOrderQty,
        minQuantity: row.minQuantity,
        min_quantity: row.min_quantity,
        pricePerSheet: row.pricePerSheet,
        pricePerPack: row.pricePerPack,
        total: row.total
      });
      
      // Try multiple field names for minimum quantity - minOrderQty is the correct field from frontend
      const minQtyValue = row.minOrderQty || row.minQty || row.minQuantity || row.min_quantity || 1;
      
      return `
      <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
        <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 10px;">${row.size || 'N/A'}</td>
        <td style="padding: 4px 6px; border: 1px solid #ccc; text-align: center; font-size: 10px;">${row.itemCode || '-'}</td>
        <td style="padding: 4px 6px; border: 1px solid #ccc; text-align: center; font-size: 10px;">${minQtyValue}</td>
        <td style="padding: 4px 6px; border: 1px solid #ccc; text-align: right; font-size: 10px;">$${(row.pricePerSheet || 0).toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #ccc; text-align: right; font-size: 10px; font-weight: bold;">$${(row.total || row.pricePerPack || 0).toFixed(2)}</td>
      </tr>
      `;
    }).join('');

    // Extract category from the first row to display category + product type
    const firstRow = (rows as any[])[0];
    const productCategory = getCategoryDisplayName(
      firstRow?.productCategory || firstRow?.productName || categoryName,
      type
    );
    
    return `
      <div style="page-break-inside: avoid; margin-bottom: 12px;">
        <div style="margin: 8px 0 6px 0; border-bottom: 1px solid #3b82f6; padding-bottom: 4px;">
          <div style="font-size: 12px; font-weight: 600; color: #3b82f6; margin-bottom: 1px;">${productCategory}</div>
          <div style="font-size: 13px; font-weight: bold; color: #1f2937;">${type}</div>
        </div>
        <table width="100%" style="border-collapse:collapse;table-layout:fixed;">
          <thead>
            <tr style="background: #3b82f6;">
              <th style="padding: 6px 8px; border: 1px solid #ccc; color: white; font-weight: bold; text-align: left; font-size: 11px;">Size</th>
              <th style="padding: 6px 8px; border: 1px solid #ccc; color: white; font-weight: bold; text-align: center; font-size: 11px;">Item Code</th>
              <th style="padding: 6px 8px; border: 1px solid #ccc; color: white; font-weight: bold; text-align: center; font-size: 11px;">Min Qty</th>
              <th style="padding: 6px 8px; border: 1px solid #ccc; color: white; font-weight: bold; text-align: right; font-size: 11px;">Price/Sheet</th>
              <th style="padding: 6px 8px; border: 1px solid #ccc; color: white; font-weight: bold; text-align: right; font-size: 11px;">Price/Pack</th>
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
        /* Removed Google Fonts import for faster PDF generation - using system fonts */
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          margin: 0;
          padding: 15px;
          font-size: 10px;
          color: #1f2937;
          background: #ffffff;
          max-width: 8.5in;
          line-height: 1.2;
        }
        
        .header {
          text-align: center;
          margin-bottom: 15px;
          padding: 12px;
          background: white;
          border: 1px solid #ccc;
          color: #1f2937;
        }
        
        .header img {
          height: 45px;
          margin-bottom: 8px;
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        
        .company-name {
          font-size: 22px;
          font-weight: 700;
          margin: 8px 0 4px;
          font-family: Arial, sans-serif;
        }
        
        .company-details {
          font-size: 12px;
          opacity: 0.95;
          line-height: 1.5;
        }
        
        .document-info {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin: 10px 0;
          padding: 8px;
          background: #f5f5f5;
          border-left: 3px solid #3b82f6;
        }
        
        .document-title {
          font-size: 20px;
          font-weight: bold;
          color: #1f2937;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .document-meta {
          text-align: right;
          font-size: 11px;
          color: #6b7280;
        }
        
        .customer-info {
          margin: 8px 0;
          padding: 6px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          font-size: 9px;
        }
        
        .customer-info strong {
          color: #374151;
          font-weight: 600;
        }
        
        .footer {
          margin-top: 15px;
          padding-top: 8px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 8px;
          color: #6b7280;
          font-style: italic;
        }
        
        @media print {
          body { 
            margin: 0; 
            padding: 20px;
            max-width: none;
          }
          .header { 
            break-inside: avoid; 
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${logo ? `<img src="data:image/png;base64,${logo}" alt="4S Graphics Logo" style="display: block; margin: 0 auto 15px auto; height: 60px;" />` : ""}
        <div class="company-name">4S Graphics, Inc.</div>
        <div class="company-details">
          764 NW 57th Court, Fort Lauderdale, FL 33309<br>
          Phone: (954) 493-6484 | Website: www.4sgraphics.com
        </div>
      </div>

      <div class="document-info">
        <div>
          <div class="document-title">${title}</div>
          <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
            Category: <strong>${categoryName}</strong>
          </div>
        </div>
        <div class="document-meta">
          <div><strong>List #:</strong> ${listNumber}</div>
          <div><strong>Date:</strong> ${currentDate}</div>
        </div>
      </div>

      ${customerName && customerName !== "N/A" ? `
      <div class="customer-info">
        <strong>Prepared for:</strong> ${customerName}
      </div>
      ` : ''}

      ${sections}

      <div class="footer">
        This price list was generated on ${currentDate} by 4S Graphics, Inc.<br>
        For questions or to place an order, contact us at (954) 493-6484 or visit www.4sgraphics.com
      </div>
    </body>
    </html>
  `;
}