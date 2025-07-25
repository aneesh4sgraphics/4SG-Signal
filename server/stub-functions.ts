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
  const { customerName, quoteNumber, quoteItems, totalAmount, title = "Quote" } = data;

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const itemsHTML = quoteItems.map((item: any, index: number) => `
    <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
      <td style="padding: 8px; text-align: center;">${index + 1}</td>
      <td style="padding: 8px; font-weight: 600;">${item.productType}</td>
      <td style="padding: 8px;">${item.size}</td>
      <td style="padding: 8px; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; text-align: right;">$${item.pricePerSheet.toFixed(2)}</td>
      <td style="padding: 8px; text-align: right; font-weight: bold;">$${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

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
        <img src="https://cdn.shopify.com/s/files/1/3039/2358/files/4s_logo_square_75x75_71812ee1-54b3-46ab-b989-46554c7fd1e0.jpg?v=1688121438" alt="4S Graphics Logo" />
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
        <div><strong>Customer:</strong> ${customerName}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="total">
        Total: $${totalAmount.toFixed(2)}
      </div>

      <div class="footer">
        Thank you for choosing 4S Graphics. Please contact us if you have questions about this quote.
      </div>
    </body>
    </html>
  `;
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

  const sections = Object.entries(grouped).map(([type, rows]: [string, any[]]) => {
    const rowHtml = rows.map((row, index) => `
      <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
        <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: 500;">${row.size}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-family: monospace;">${row.itemCode}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-weight: 500;">${row.minQty}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right; font-weight: 600;">$${row.pricePerSheet.toFixed(2)}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right; font-weight: 700; color: #059669;">$${row.pricePerPack.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <div style="page-break-inside: avoid; margin-bottom: 25px;">
        <h3 style="margin: 20px 0 12px 0; font-size: 16px; font-weight: bold; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 5px;">${type}</h3>
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

export function generatePriceListCSV(data: any): string {
  return 'Product,Price\nSample Product,$10.00';
}