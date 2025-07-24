import fs from 'fs';
import path from 'path';

// Utility function to apply brand-specific fonts to individual words
function applyBrandFonts(text: string): string {
  const words = text.split(' ');
  
  return words.map(word => {
    const lowerWord = word.toLowerCase();
    
    if (lowerWord.includes('graffiti')) {
      return `<span style="font-family: 'Lobster', cursive; font-weight: 400;">${word}</span>`;
    } else if (lowerWord.includes('solvit')) {
      return `<span style="font-family: 'Inter', sans-serif; font-weight: 700;">${word}</span>`;
    } else if (lowerWord.includes('cliq')) {
      return `<span style="font-family: 'Franklin Gothic Medium', sans-serif; font-weight: 500;">${word}</span>`;
    } else if (lowerWord.includes('rang')) {
      return `<span style="font-family: 'Inter', sans-serif; font-weight: 400;">${word}</span>`;
    } else if (lowerWord.includes('ele') || lowerWord.includes('eie')) {
      return `<span style="font-family: 'Roboto', sans-serif; font-weight: 400;">${word}</span>`;
    } else if (lowerWord.includes('polyester') || lowerWord.includes('paper') || lowerWord.includes('blended') || lowerWord.includes('poly') || lowerWord.includes('stick')) {
      return `<span style="font-family: 'Roboto', sans-serif; font-weight: 400;">${word}</span>`;
    }
    
    return word;
  }).join(' ');
}

// Utility function to round retail prices to .99 cents
function roundToNinetyNine(price: number): number {
  return Math.floor(price) + 0.99;
}

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
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Check if customer name is genuine (not test/placeholder data)
  const isGenuineCustomer = customerName && 
    !customerName.toLowerCase().includes('test') && 
    customerName.trim() !== '-' && 
    customerName.trim() !== '' &&
    customerName.toLowerCase() !== 'customer' &&
    customerName.toLowerCase() !== 'sample';

  // Generate filename following the requested format: QuickQuotes_4SGraphics_Date_for_CustomerName.pdf
  const filename = `QuickQuotes_4SGraphics_${currentDate.replace(/\//g, '-')}_for_${customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

  // Group items by category for better organization
  const groupedItems = quoteItems.reduce((acc, item) => {
    const category = item.productBrand || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  // Calculate subtotal (assuming no tax)
  const subtotal = totalAmount;

  // Generate category sections
  const categorySections = Object.entries(groupedItems).map(([category, items]) => {
    const categoryRows = items.map(item => {
      const pricePerSqM = item.pricePerSheet / (item.squareMeters || 1);
      const pricePerPack = parseFloat(item.pricePerSheet) * parseInt(item.minOrderQty || '1');
      
      return `
        <tr>
          <td>${item.productSize}</td>
          <td>${item.itemCode || '-'}</td>
          <td class="min-qty-display">1 Roll</td>
          <td class="price-column">$${pricePerSqM.toFixed(2)}</td>
          <td class="price-column">$${parseFloat(item.pricePerSheet).toFixed(2)}</td>
          <td class="price-column price-per-pack">$${pricePerPack.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="category-section">
        <div class="category-title">${applyBrandFonts(category)}</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Item Code</th>
              <th>Min Quantity</th>
              <th>Price/Sq.M</th>
              <th>Price/Sheet</th>
              <th>Price Per Pack</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRows}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${filename}</title>
      <link href="https://fonts.googleapis.com/css2?family=Lobster&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Franklin+Gothic+Medium&display=swap" rel="stylesheet">
      <style>
        @page {
          margin: 0.5in;
          size: A4;
        }
        
        body {
          font-family: 'Roboto', Arial, sans-serif;
          margin: 0;
          padding: 20px;
          line-height: 1.4;
          color: #333;
          font-size: 10px;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 15px;
        }
        
        .company-name {
          font-family: 'Roboto', Arial, sans-serif;
          font-size: 16px;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 5px;
        }
        
        .company-tagline {
          font-family: 'Roboto', Arial, sans-serif;
          font-size: 10px;
          color: #666;
          margin-bottom: 8px;
        }
        
        .company-address {
          font-family: 'Roboto', Arial, sans-serif;
          font-size: 10px;
          color: #666;
          margin-bottom: 2px;
        }
        
        .quote-info {
          background-color: #f8fafc;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
          text-align: left;
        }
        
        .quote-info div {
          margin-bottom: 5px;
          font-size: 11px;
        }
        
        .price-quote-title {
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          color: #1e40af;
          margin: 20px 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .category-section {
          margin-bottom: 25px;
        }
        
        .category-title {
          font-size: 14px;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 10px;
          padding: 8px 0;
          border-bottom: 2px solid #1e40af;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          border: 1px solid #d1d5db;
        }
        
        .items-table th {
          background-color: #1e40af;
          color: white;
          padding: 10px 8px;
          text-align: left;
          font-weight: bold;
          font-size: 9px;
          border-right: 1px solid #3b82f6;
        }
        
        .items-table th:last-child {
          border-right: none;
        }
        
        .items-table td {
          padding: 8px;
          border-bottom: 1px solid #e5e7eb;
          border-right: 1px solid #e5e7eb;
          font-size: 9px;
        }
        
        .items-table td:last-child {
          border-right: none;
        }
        
        .items-table tr:nth-child(even) {
          background-color: #f9fafb;
        }
        
        .price-column {
          text-align: right;
        }
        
        .price-per-pack {
          color: #16a34a;
          font-weight: bold;
        }
        
        .min-qty-display {
          text-align: center;
        }
        
        .totals-section {
          float: right;
          width: 300px;
          margin-top: 30px;
          padding: 15px;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
        }
        
        .totals-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 11px;
        }
        
        .totals-row.total {
          font-weight: bold;
          font-size: 14px;
          color: #1e40af;
          border-top: 2px solid #1e40af;
          padding-top: 8px;
          margin-top: 8px;
        }
        
        .footer {
          clear: both;
          text-align: center;
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 9px;
          color: #666;
        }
        
        .footer p {
          margin: 5px 0;
        }
        
        .page-number {
          position: fixed;
          bottom: 0.3in;
          right: 0.5in;
          font-size: 9px;
          color: #666;
        }
        
        @media print {
          body { margin: 0; }
          .page-number { position: fixed; bottom: 0.3in; right: 0.5in; }
          .totals-section { float: right; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">4S Graphics, Inc.</div>
        <div class="company-tagline">Synthetic & Specialty Substrates Supplier</div>
        <div class="company-address">Fort Lauderdale, FL 33309</div>
        <div class="company-address">Phone: (954) 493-6484</div>
        <div class="company-address">Email: ${salesRep}</div>
        <div class="company-address">Web: www.4sgraphics.com</div>
      </div>
      
      <div class="quote-info">
        <div><strong>Date:</strong> ${currentDate}</div>
        <div><strong>Prepared By:</strong> ${salesRep}</div>
        ${isGenuineCustomer ? `<div><strong>Prepared for:</strong> ${customerName}</div>` : ''}
        <div><strong>Quote Number:</strong> ${quoteNumber}</div>
      </div>
      
      <div class="price-quote-title">QUOTATION</div>
      
      ${categorySections}
      
      <div class="totals-section">
        <div class="totals-row">
          <span>Subtotal:</span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>
        <div class="totals-row">
          <span>Shipping:</span>
          <span>Extra At Actuals</span>
        </div>
        <div class="totals-row total">
          <span>Total:</span>
          <span>$${totalAmount.toFixed(2)}</span>
        </div>
      </div>
      
      <div class="footer">
        <p>This quote is valid for 30 days from the date above.</p>
        <p>Your business keeps us rolling (literally). Thank you!</p>
        <p>Visit www.4sgraphics.com</p>
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
  clientName: string | null;
  categoryName: string;
  tierName: string;
  items: PriceListItem[];
}

export function generatePriceListHTML(request: PriceListRequest): string {
  const { clientName, categoryName, tierName, items } = request;
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Check if client name is genuine (not test/placeholder data)
  const isGenuineClient = clientName && 
    !clientName.toLowerCase().includes('test') && 
    clientName.trim() !== '-' && 
    clientName.trim() !== '' &&
    clientName.toLowerCase() !== 'customer' &&
    clientName.toLowerCase() !== 'sample';

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
      const basePricePerSqm = parseFloat(item.pricing.pricePerSquareMeter);
      const squareMeters = parseFloat(item.size.squareMeters);
      
      // Apply 99-cent rounding for retail pricing tier
      const adjustedPricePerSqm = tierName.toLowerCase().includes('retail') 
        ? roundToNinetyNine(basePricePerSqm) 
        : basePricePerSqm;
      
      const pricePerSheet = adjustedPricePerSqm * squareMeters;
      const minOrderQty = parseInt(item.size.minOrderQty) || 1;
      const minQtyPrice = pricePerSheet * minOrderQty;
      
      return `
        <tr>
          <td>${item.size.name}</td>
          <td>${item.size.itemCode}</td>
          <td>${item.size.minOrderQty}</td>
          <td>$${pricePerSheet.toFixed(2)}</td>
          <td>$${minQtyPrice.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="product-type-section">
        <h3 class="product-type-name">${applyBrandFonts(typeName)}</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Item Code</th>
              <th>Min Qty</th>
              <th>Price per Sheet</th>
              <th>Price Per Pack</th>
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
      <link href="https://fonts.googleapis.com/css2?family=Lobster&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Franklin+Gothic+Medium&display=swap" rel="stylesheet">
      <style>
        @page {
          size: 8.5in 11in;
          orientation: portrait;
          margin: 0.75in;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          margin: 0;
          padding: 0;
          background-color: #ffffff;
          color: #333;
          line-height: 1.4;
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
          position: fixed;
          bottom: 0.5in;
          left: 0;
          right: 0;
        }

        @media print {
          body { margin: 0; padding: 0; }
          .header-container { page-break-inside: avoid; }
          .product-type-section { page-break-inside: avoid; }
          .page-number { display: block; }
          
          @page {
            @bottom-center {
              content: "Page " counter(page) " of " counter(pages);
            }
          }
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
        <div><strong>Date:</strong> ${currentDate}</div>
        <div><strong>Prepared By:</strong> aneesh@4sgraphics.com</div>
        ${isGenuineClient ? `<div><strong>Prepared for:</strong> ${clientName}</div>` : ''}
        <div><strong>Product Category:</strong> ${categoryName}</div>
      </div>
      
      <div class="price-list-title">PRICE LIST</div>
      
      ${typeSections}
      
      <div class="footer-info">
        <p>This price list was generated on ${currentDate}${clientName ? ` for ${clientName}` : ''}</p>
        <p>Contact us at ${companyDetails.phone} or visit https://${companyDetails.website}/ for more information</p>
      </div>
      
      <div class="page-number" id="page-number"></div>
      
      <script>
        // Set up proper page numbering
        function updatePageNumbers() {
          const pageNumberElement = document.getElementById('page-number');
          if (pageNumberElement) {
            pageNumberElement.textContent = 'Page 1 of 1';
          }
        }
        
        // Update page numbers when the document loads
        document.addEventListener('DOMContentLoaded', updatePageNumbers);
        
        // Update page numbers before printing
        window.addEventListener('beforeprint', function() {
          // For print, let CSS handle page numbering
          const pageNumberElement = document.getElementById('page-number');
          if (pageNumberElement) {
            pageNumberElement.style.display = 'none';
          }
        });
      </script>
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

  let csvContent = '';
  if (clientName) {
    csvContent += `Price List for ${clientName}\n`;
  }
  csvContent += `Product Category: ${categoryName}\n`;
  csvContent += `Date: ${currentDate}\n\n`;

  // Generate CSV sections for each product type
  Object.entries(itemsByType).forEach(([typeName, typeItems]) => {
    csvContent += `${typeName}\n`;
    csvContent += `Size,Item Code,Min Qty,Price per Sheet,Price Per Pack\n`;
    
    typeItems.forEach((item) => {
      const basePricePerSqm = parseFloat(item.pricing.pricePerSquareMeter);
      const squareMeters = parseFloat(item.size.squareMeters);
      
      // Apply 99-cent rounding for retail pricing tier
      const adjustedPricePerSqm = tierName.toLowerCase().includes('retail') 
        ? roundToNinetyNine(basePricePerSqm) 
        : basePricePerSqm;
      
      const pricePerSheet = adjustedPricePerSqm * squareMeters;
      const minOrderQty = parseInt(item.size.minOrderQty) || 1;
      const minQtyPrice = pricePerSheet * minOrderQty;
      
      csvContent += `"${item.size.name}","${item.size.itemCode}","${item.size.minOrderQty}","$${pricePerSheet.toFixed(2)}","$${minQtyPrice.toFixed(2)}"\n`;
    });
    
    csvContent += `\n`;
  });

  return csvContent;
}