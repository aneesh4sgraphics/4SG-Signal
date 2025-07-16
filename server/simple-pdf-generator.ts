import fs from 'fs';
import path from 'path';

interface QuoteItem {
  id: string;
  productBrand: string;
  productType: string;
  productSize: string;
  squareMeters: number;
  pricePerSheet: number;
  quantity: number;
  total: number;
  tierId: number;
  tierName: string;
  minOrderQty: string;
  itemCode: string;
}

interface PDFGenerationRequest {
  customerName: string;
  customerEmail?: string;
  quoteItems: QuoteItem[];
  quoteNumber: string;
  totalAmount: number;
  salesRep?: string;
}

const companyDetails = {
  name: "4S Graphics, Inc.",
  address: "764 NW 57th Court",
  city: "Fort Lauderdale, FL 33309",
  phone: "(954) 493.6484",
  website: "www.4sgraphics.com"
};

function generateQuoteHTML(request: PDFGenerationRequest): string {
  const { customerName, quoteItems, quoteNumber, totalAmount, salesRep = "aneesh@4sgraphics.com" } = request;
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });

  // Check if any item has quantity below minimum order quantity
  const hasMinOrderQtyDisplay = quoteItems.some(item => {
    const minOrderQty = parseInt(item.minOrderQty) || 50;
    return item.quantity < minOrderQty;
  });

  // Generate table rows for quote items
  const itemRows = quoteItems.map((item, index) => {
    const minOrderQty = parseInt(item.minOrderQty) || 50;
    const isMinOrderQtyActive = item.quantity < minOrderQty;
    
    return `
      <tr>
        <td>${item.productBrand}</td>
        <td>${item.productType}</td>
        <td>${item.productSize}</td>
        <td>${item.quantity}</td>
        ${hasMinOrderQtyDisplay ? `<td>${isMinOrderQtyActive ? minOrderQty : '-'}</td>` : ''}
        <td>$${item.pricePerSheet.toFixed(2)}</td>
        <td>$${item.total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const logoBase64 = getLogoBase64();
  const logoHtml = logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" alt="4S Graphics Logo" style="height: 80px; margin-right: 15px;">` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quote ${quoteNumber}</title>
      <style>
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          margin: 0;
          padding: 30px;
          background-color: white;
          color: #000;
          line-height: 1.4;
        }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
          border-bottom: 2px solid #000;
          padding-bottom: 20px;
        }
        
        .company-info {
          display: flex;
          align-items: flex-start;
        }
        
        .company-details {
          margin-left: 15px;
        }
        
        .company-name {
          font-size: 18px;
          font-weight: bold;
          color: #000;
          margin-bottom: 5px;
        }
        
        .company-address {
          font-size: 12px;
          color: #000;
          margin-bottom: 2px;
        }
        
        .quote-date {
          font-size: 12px;
          color: #000;
          text-align: right;
        }
        
        .quote-info {
          margin-bottom: 30px;
          font-size: 12px;
        }
        
        .quote-info div {
          margin-bottom: 5px;
        }
        
        .price-quote-title {
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          color: #000;
          margin: 30px 0;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          border: 1px solid #000;
        }
        
        .items-table th {
          background-color: #6FA8DC !important;
          color: #000 !important;
          padding: 8px;
          text-align: center;
          font-weight: bold;
          border: 1px solid #000;
          font-size: 12px;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .items-table td {
          padding: 8px;
          text-align: center;
          border: 1px solid #000;
          font-size: 12px;
        }
        
        .total-row {
          text-align: right;
          font-size: 14px;
          font-weight: bold;
          margin: 20px 0;
        }
        
        .confirm-order {
          margin-top: 30px;
        }
        
        .confirm-order h3 {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        
        .confirm-order p {
          font-size: 12px;
          margin-bottom: 5px;
        }
        
        .confirm-order ol {
          font-size: 12px;
          margin-left: 20px;
        }
        
        .footer-info {
          margin-top: 30px;
          font-size: 12px;
        }
        
        .page-number {
          text-align: center;
          font-size: 12px;
          margin-top: 40px;
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div class="company-info">
          ${logoHtml}
          <div class="company-details">
            <div class="company-name">${companyDetails.name}</div>
            <div class="company-address">${companyDetails.address}</div>
            <div class="company-address">${companyDetails.city}</div>
            <div class="company-address">Phone: ${companyDetails.phone} | Website: https://${companyDetails.website}/</div>
          </div>
        </div>
      </div>
      
      <div class="quote-info">
        <div>Quote Prepared for: ${customerName}</div>
        <div>Quote Number: ${quoteNumber}</div>
        <div>Quote Date: ${currentDate}</div>
      </div>
      
      <div class="price-quote-title">PRICE QUOTE</div>
      
      <table class="items-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Product Type</th>
            <th>Size</th>
            <th>Qty</th>
            ${hasMinOrderQtyDisplay ? '<th>Min Order Qty</th>' : ''}
            <th>Price/Sheet</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      
      <div class="total-row">
        Quote Total: $${totalAmount.toFixed(2)}
      </div>
      
      <div class="confirm-order">
        <h3>Confirm Your Order</h3>
        <p>To proceed with this order, please choose one of the following options:</p>
        <ol>
          <li>Forward this PDF to: sales@4sgraphics.com</li>
        </ol>
      </div>
      
      <div class="footer-info">
        <p>Quote Prepared by: ${salesRep}</p>
      </div>
      
      <div class="page-number">Page 1 of 1</div>
    </body>
    </html>
  `;
}

function getLogoBase64(): string {
  try {
    const logoPath = path.join(process.cwd(), 'client', 'public', 'company-logo.jpg');
    const logoBuffer = fs.readFileSync(logoPath);
    return logoBuffer.toString('base64');
  } catch (error) {
    console.error('Error reading logo file:', error);
    return '';
  }
}

export function generateQuoteNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `4SG-${year}${month}${day}-${random}`;
}

export function generateQuoteHTMLForDownload(request: PDFGenerationRequest): string {
  return generateQuoteHTML(request);
}

interface PriceListItem {
  size: {
    id: number;
    name: string;
    width: string;
    height: string;
    widthUnit: string;
    heightUnit: string;
    squareMeters: string;
    itemCode: string;
    minOrderQty: string;
  };
  type: {
    id: number;
    name: string;
    description: string;
  };
  pricing: {
    pricePerSquareMeter: string;
  };
}

interface PriceListRequest {
  clientName: string;
  categoryName: string;
  tierName: string;
  items: PriceListItem[];
}

export function generatePriceListHTML(request: PriceListRequest): string {
  const { clientName, categoryName, tierName, items } = request;
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });

  // Group items by product type
  const itemsByType = items.reduce((acc, item) => {
    if (!acc[item.type.name]) {
      acc[item.type.name] = [];
    }
    acc[item.type.name].push(item);
    return acc;
  }, {} as Record<string, PriceListItem[]>);

  // Generate table sections for each product type
  const typeSections = Object.entries(itemsByType).map(([typeName, typeItems]) => {
    const itemRows = typeItems.map((item) => {
      const pricePerSqm = parseFloat(item.pricing.pricePerSquareMeter);
      const squareMeters = parseFloat(item.size.squareMeters);
      const totalPrice = pricePerSqm * squareMeters;
      
      return `
        <tr>
          <td>${item.size.name}</td>
          <td>${item.size.itemCode}</td>
          <td>${item.size.width} ${item.size.widthUnit} × ${item.size.height} ${item.size.heightUnit}</td>
          <td>${item.size.minOrderQty}</td>
          <td>$${totalPrice.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="product-type-section">
        <h3 class="product-type-name">${typeName}</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Item Code</th>
              <th>Dimensions</th>
              <th>Min Qty</th>
              <th>Total Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const logoBase64 = getLogoBase64();
  const logoHtml = logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" alt="4S Graphics Logo" style="height: 80px; margin-right: 15px;">` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Price List - ${categoryName}</title>
      <style>
        body {
          font-family: 'Roboto', Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #ffffff;
          color: #333;
        }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #333;
        }
        
        .company-info {
          display: flex;
          align-items: center;
        }
        
        .company-name {
          font-size: 15px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .company-address {
          font-size: 10px;
          margin-bottom: 2px;
        }
        
        .price-list-info {
          margin-bottom: 20px;
        }
        
        .price-list-info div {
          font-size: 12px;
          margin-bottom: 5px;
        }
        
        .price-list-title {
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          margin: 30px 0 20px 0;
        }
        
        .product-type-section {
          margin-bottom: 30px;
        }
        
        .product-type-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 10px;
          background-color: #f8f9fa;
          padding: 8px 12px;
          border-left: 4px solid #007bff;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        
        .items-table th {
          background-color: #f8f9fa;
          font-size: 10px;
          font-weight: bold;
          padding: 8px 6px;
          text-align: left;
          border: 1px solid #dee2e6;
        }
        
        .items-table td {
          font-size: 10px;
          padding: 6px;
          border: 1px solid #dee2e6;
        }
        
        .items-table tr:nth-child(even) {
          background-color: #f8f9fa;
        }
        
        .items-table tr:nth-child(odd) {
          background-color: #ffffff;
        }
        
        .footer-info {
          margin-top: 30px;
          font-size: 10px;
          text-align: center;
        }
        
        .page-number {
          text-align: center;
          font-size: 10px;
          margin-top: 40px;
        }

        @media print {
          body { margin: 0; padding: 15px; }
          .header-container { page-break-inside: avoid; }
          .product-type-section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div class="company-info">
          ${logoHtml}
          <div class="company-details">
            <div class="company-name">${companyDetails.name}</div>
            <div class="company-address">${companyDetails.address}</div>
            <div class="company-address">${companyDetails.city}</div>
            <div class="company-address">Phone: ${companyDetails.phone} | Website: https://${companyDetails.website}/</div>
          </div>
        </div>
      </div>
      
      <div class="price-list-info">
        <div>Price List for: ${clientName}</div>
        <div>Product Category: ${categoryName}</div>
        <div>Date: ${currentDate}</div>
      </div>
      
      <div class="price-list-title">PRICE LIST - ${categoryName.toUpperCase()}</div>
      
      ${typeSections}
      
      <div class="footer-info">
        <p>This price list was generated on ${currentDate} for ${clientName}</p>
        <p>Contact us at ${companyDetails.phone} or visit https://${companyDetails.website}/ for more information</p>
      </div>
      
      <div class="page-number">Page 1 of 1</div>
    </body>
    </html>
  `;
}

export function generatePriceListCSV(request: PriceListRequest): string {
  const { clientName, categoryName, tierName, items } = request;
  const currentDate = new Date().toLocaleDateString('en-US');

  // Group items by product type
  const itemsByType = items.reduce((acc, item) => {
    if (!acc[item.type.name]) {
      acc[item.type.name] = [];
    }
    acc[item.type.name].push(item);
    return acc;
  }, {} as Record<string, PriceListItem[]>);

  let csvContent = `Price List for ${clientName}\n`;
  csvContent += `Product Category: ${categoryName}\n`;
  csvContent += `Date: ${currentDate}\n\n`;

  // Generate CSV sections for each product type
  Object.entries(itemsByType).forEach(([typeName, typeItems]) => {
    csvContent += `${typeName}\n`;
    csvContent += `Size,Item Code,Dimensions,Min Qty,Total Price\n`;
    
    typeItems.forEach((item) => {
      const pricePerSqm = parseFloat(item.pricing.pricePerSquareMeter);
      const squareMeters = parseFloat(item.size.squareMeters);
      const totalPrice = pricePerSqm * squareMeters;
      
      csvContent += `"${item.size.name}","${item.size.itemCode}","${item.size.width} ${item.size.widthUnit} × ${item.size.height} ${item.size.heightUnit}","${item.size.minOrderQty}","$${totalPrice.toFixed(2)}"\n`;
    });
    
    csvContent += `\n`;
  });

  return csvContent;
}