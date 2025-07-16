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
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          font-size: 12px;
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
        <div class="quote-date">Quote Date: ${currentDate}</div>
      </div>
      
      <div class="quote-info">
        <div>Quote Prepared for: ${customerName}</div>
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
        <p>Date: ${currentDate}</p>
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