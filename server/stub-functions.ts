// Stub functions for removed PDF generation functionality

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
  const { customerName, quoteNumber, quoteItems, totalAmount } = data;
  
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const itemsHTML = quoteItems.map((item: any, index: number) => `
    <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'}; border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px; border-right: 1px solid #e5e7eb; font-size: 11px; text-align: center; font-weight: 500;">${index + 1}</td>
      <td style="padding: 8px; border-right: 1px solid #e5e7eb; font-size: 11px; font-weight: 600; color: #1f2937;">${item.productType}</td>
      <td style="padding: 8px; border-right: 1px solid #e5e7eb; font-size: 11px; color: #374151;">${item.size}</td>
      <td style="padding: 8px; border-right: 1px solid #e5e7eb; text-align: center; font-size: 11px; font-weight: 500;">${item.quantity}</td>
      <td style="padding: 8px; border-right: 1px solid #e5e7eb; text-align: right; font-size: 11px; font-weight: 500;">$${item.pricePerSheet.toFixed(2)}</td>
      <td style="padding: 8px; text-align: right; font-weight: 600; font-size: 11px; color: #059669;">$${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Quote ${quoteNumber}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body {
          font-family: 'Inter', 'Roboto', Arial, sans-serif;
          margin: 0;
          padding: 40px;
          color: #1f2937;
          line-height: 1.4;
          font-size: 12px;
          background-color: #ffffff;
        }
        .letterhead {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          padding: 30px;
          text-align: center;
          margin: -40px -40px 40px -40px;
          border-radius: 0 0 8px 8px;
        }
        .company-name {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
          font-family: 'Inter', sans-serif;
        }
        .company-tagline {
          font-size: 14px;
          font-weight: 400;
          margin-bottom: 15px;
          opacity: 0.9;
        }
        .company-details {
          font-size: 12px;
          line-height: 1.6;
          opacity: 0.95;
        }
        .document-title {
          text-align: center;
          font-size: 28px;
          font-weight: 600;
          color: #1f2937;
          margin: 30px 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .quote-header {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 30px;
          margin: 30px 0;
          padding: 20px;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-radius: 8px;
          border-left: 4px solid #2563eb;
        }
        .quote-field {
          text-align: center;
        }
        .quote-field-label {
          font-weight: 600;
          color: #6b7280;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 5px;
        }
        .quote-field-value {
          font-weight: 700;
          color: #1f2937;
          font-size: 14px;
        }
        .products-section {
          margin: 30px 0;
        }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        }
        th {
          background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%);
          color: white;
          padding: 12px 10px;
          text-align: left;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        th:first-child {
          text-align: center;
        }
        th:nth-child(4) {
          text-align: center;
        }
        th:nth-child(5), th:nth-child(6) {
          text-align: right;
        }
        td {
          border-bottom: 1px solid #e5e7eb;
        }
        .total-section {
          margin-top: 20px;
          padding: 20px;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-radius: 8px;
          border-left: 4px solid #059669;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .total-label {
          font-size: 16px;
          font-weight: 600;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .total-amount {
          font-size: 20px;
          font-weight: 700;
          color: #059669;
        }
        .footer {
          margin-top: 40px;
          padding: 20px;
          background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
          color: white;
          text-align: center;
          border-radius: 8px;
          margin-left: -40px;
          margin-right: -40px;
        }
        .footer-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .footer-text {
          font-size: 11px;
          line-height: 1.5;
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="letterhead">
        <div class="company-name">4S Graphics, Inc.</div>
        <div class="company-tagline">Professional Printing Solutions</div>
        <div class="company-details">
          764 NW 57th Court • Fort Lauderdale, FL 33309<br>
          Phone: (954) 493.6484 • Website: https://www.4sgraphics.com/
        </div>
      </div>

      <div class="document-title">QUOTATION</div>

      <div class="quote-header">
        <div class="quote-field">
          <div class="quote-field-label">Quote Number</div>
          <div class="quote-field-value">${quoteNumber}</div>
        </div>
        <div class="quote-field">
          <div class="quote-field-label">Date</div>
          <div class="quote-field-value">${currentDate}</div>
        </div>
        <div class="quote-field">
          <div class="quote-field-label">Prepared For</div>
          <div class="quote-field-value">${customerName}</div>
        </div>
      </div>

      <div class="products-section">
        <div class="section-title">Products & Services</div>
        <table>
          <thead>
            <tr>
              <th style="width: 8%">#</th>
              <th style="width: 35%">Product</th>
              <th style="width: 20%">Size</th>
              <th style="width: 12%">Qty</th>
              <th style="width: 15%">Unit Price</th>
              <th style="width: 15%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-row">
            <div class="total-label">Total Amount</div>
            <div class="total-amount">$${totalAmount.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="footer-title">4S Graphics | Professional Printing Solutions</div>
        <div class="footer-text">
          Thank you for choosing 4S Graphics. Please contact us if you have any questions about this quote.
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generatePriceListHTML(data: any): string {
  const { categoryName, tierName, items, customerName } = data;

  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });

  const groupedItems = items.reduce((groups: any, item: any) => {
    const type = item.productType || 'Unknown';
    if (!groups[type]) groups[type] = [];
    groups[type].push(item);
    return groups;
  }, {});

  const productSections = Object.entries(groupedItems).map(([productType, typeItems]: [string, any]) => {
    const itemRows = (typeItems as any[]).map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ccc;">${item.size || 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${item.itemCode || 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #ccc; text-align: center;">${item.minQty || 0} Sheets</td>
        <td style="padding: 8px; border: 1px solid #ccc; text-align: right;">$${(item.pricePerSheet || 0).toFixed(2)}</td>
        <td style="padding: 8px; border: 1px solid #ccc; text-align: right;">$${(item.pricePerPack || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <div class="product-section">
        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #2563eb; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">${productType}</h3>
        <table style="width: 100%; border-collapse: collapse; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden;">
          <thead style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white;">
            <tr>
              <th style="padding: 12px 8px; border: none; font-weight: 600; text-align: left;">Size</th>
              <th style="padding: 12px 8px; border: none; font-weight: 600; text-align: left;">Item Code</th>
              <th style="padding: 12px 8px; border: none; font-weight: 600; text-align: center;">Min Qty</th>
              <th style="padding: 12px 8px; border: none; font-weight: 600; text-align: right;">Price Per Sheet</th>
              <th style="padding: 12px 8px; border: none; font-weight: 600; text-align: right;">Price Per Pack</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Price List - ${categoryName}</title>
      <style>
        @media print {
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          font-size: 12px;
          color: #000;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #2563eb;
        }
        .logo {
          width: 200px;
          height: 80px;
          margin: 0 auto 20px auto;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
          font-weight: bold;
          letter-spacing: 2px;
        }
        .main-title {
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          text-transform: uppercase;
          margin: 30px 0;
          color: #2563eb;
        }
        .company-info {
          font-size: 13px;
          font-weight: bold;
          color: #374151;
        }
        .price-list-info {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f8fafc;
          border-radius: 6px;
          border-left: 4px solid #2563eb;
        }
        .product-section {
          margin-bottom: 30px;
        }
        .product-section:not(:first-child) {
          page-break-before: always;
        }
        .footer {
          margin-top: 40px;
          font-size: 11px;
          text-align: center;
          color: #666;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">4S GRAPHICS</div>
        <div class="company-info">
          4S Graphics, Inc.<br>
          764 NW 57th Court, Fort Lauderdale, FL 33309<br>
          (954) 493.6484 • www.4sgraphics.com
        </div>
      </div>

      <div class="price-list-info">
        ${customerName ? `<strong>Customer:</strong> ${customerName}<br>` : ''}
        <strong>Category:</strong> ${categoryName}<br>
        <strong>Date:</strong> ${currentDate}
      </div>

      <div class="main-title">Price List - ${categoryName.toUpperCase()}</div>

      ${productSections}

      <div class="footer">
        This price list was generated on ${currentDate}${customerName ? ` for ${customerName}` : ''}.<br>
        Contact us at (954) 493.6484 or visit www.4sgraphics.com
      </div>
    </body>
    </html>
  `;
}

export function generatePriceListCSV(data: any): string {
  return 'Product,Price\nSample Product,$10.00';
}