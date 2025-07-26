// stub-function.ts

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
      
      return `
        <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${item.size}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.minOrderQty || 0}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">$${item.pricePerSheet.toFixed(2)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold;">$${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="margin-bottom: 25px;">
        <div style="margin-bottom: 10px;">
          <div style="font-size: 14px; font-weight: 600; color: #3b82f6; margin-bottom: 2px;">${categoryName}</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${productType}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; background-color: white; border: 1px solid #ddd;">
          <thead>
            <tr style="background-color: #374151;">
              <th style="padding: 10px 12px; color: white; text-align: left; font-weight: bold; font-size: 11px;">Size</th>
              <th style="padding: 10px 12px; color: white; text-align: center; font-weight: bold; font-size: 11px;">Min Order Qty</th>
              <th style="padding: 10px 12px; color: white; text-align: right; font-weight: bold; font-size: 11px;">Price/Sheet</th>
              <th style="padding: 10px 12px; color: white; text-align: right; font-weight: bold; font-size: 11px;">Total</th>
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
  // Category mappings based on product types
  const categoryMappings: { [key: string]: string } = {
    // Graffiti Polyester Paper products
    'Graffiti Polyester Paper': 'Graffiti Polyester Paper',
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
    'CoHo Films for Fabrics': 'DTF Films'
  };

  // First try direct mapping by product type
  if (categoryMappings[productType]) {
    return categoryMappings[productType];
  }

  // Fall back to product name (category name)
  return productName;
}

export function generatePriceListHTML(data: any): string {
  const { categoryName, tierName, items, customerName, title = "PRICE LIST", quoteNumber } = data;

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
      // Debug logging for each row
      console.log('Processing PDF row:', {
        size: row.size,
        itemCode: row.itemCode,
        minQty: row.minQty,
        pricePerSheet: row.pricePerSheet,
        pricePerPack: row.pricePerPack
      });
      
      return `
      <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
        <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: 500;">${row.size || 'N/A'}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-family: monospace;">${row.itemCode || '-'}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-weight: 500;">${row.minQty || 0}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right; font-weight: 600;">$${(row.pricePerSheet || 0).toFixed(2)}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right; font-weight: 700; color: #059669;">$${(row.pricePerPack || 0).toFixed(2)}</td>
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
      <div style="page-break-inside: avoid; margin-bottom: 25px;">
        <div style="margin: 20px 0 12px 0; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">
          <div style="font-size: 14px; font-weight: 600; color: #3b82f6; margin-bottom: 2px;">${productCategory}</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${type}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
              <th style="padding: 12px 10px; border: 1px solid #1d4ed8; color: white; font-weight: bold; text-align: left;">Size</th>
              <th style="padding: 12px 10px; border: 1px solid #1d4ed8; color: white; font-weight: bold; text-align: center;">Item Code</th>
              <th style="padding: 12px 10px; border: 1px solid #1d4ed8; color: white; font-weight: bold; text-align: center;">Min Qty</th>
              <th style="padding: 12px 10px; border: 1px solid #1d4ed8; color: white; font-weight: bold; text-align: right;">Price/Sheet</th>
              <th style="padding: 12px 10px; border: 1px solid #1d4ed8; color: white; font-weight: bold; text-align: right;">Price/Pack</th>
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap');
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 30px;
          font-size: 11px;
          color: #1f2937;
          background: #ffffff;
          max-width: 8.5in;
          line-height: 1.4;
        }
        
        .header {
          text-align: center;
          margin-bottom: 25px;
          padding: 20px;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          border-radius: 12px;
          color: white;
        }
        
        .header img {
          height: 50px;
          margin-bottom: 8px;
          filter: brightness(0) invert(1);
        }
        
        .company-name {
          font-size: 22px;
          font-weight: 700;
          margin: 8px 0 4px;
          font-family: 'Roboto', sans-serif;
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
          margin: 20px 0;
          padding: 15px;
          background: #f8fafc;
          border-radius: 8px;
          border-left: 4px solid #3b82f6;
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
          margin: 15px 0;
          padding: 12px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }
        
        .customer-info strong {
          color: #374151;
          font-weight: 600;
        }
        
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 2px solid #e5e7eb;
          text-align: center;
          font-size: 10px;
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
        <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiByeD0iOCIgZmlsbD0id2hpdGUiLz4KPHRleHQgeD0iMjUiIHk9IjMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iSW50ZXIsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTgiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiMzYjgyZjYiPjRTPC90ZXh0Pgo8L3N2Zz4K" alt="4S Graphics Logo" />
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
            Category: <strong>${categoryName}</strong> | Tier: <strong>${tierName}</strong>
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