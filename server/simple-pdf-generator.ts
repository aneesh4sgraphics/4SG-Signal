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
  const { customerName, quoteItems, quoteNumber, totalAmount, salesRep = "Sales Representative" } = request;
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Generate table rows for quote items
  const itemRows = quoteItems.map((item, index) => `
    <tr>
      <td style="text-align: center;">${index + 1}</td>
      <td>${item.productType}</td>
      <td>${item.productSize}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">$${item.pricePerSheet.toFixed(2)}</td>
      <td style="text-align: right;">$${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  const logoBase64 = getLogoBase64();
  const logoHtml = logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" alt="4S Graphics Logo" style="height: 60px; margin-right: 20px;">` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quote ${quoteNumber}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: white;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
        }
        .logo-container {
          text-align: center;
          margin-bottom: 10px;
        }
        .company-name {
          font-size: 36px;
          font-weight: bold;
          color: #333;
          margin: 10px 0 5px 0;
        }
        .company-details {
          font-size: 16px;
          color: #666;
          margin-bottom: 20px;
        }
        .price-list-title {
          font-size: 28px;
          font-weight: bold;
          color: #333;
          margin: 20px 0;
        }
        .quote-header-info {
          margin-bottom: 30px;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 8px;
        }
        .quote-field {
          margin-bottom: 8px;
          text-align: left;
        }
        .quote-field:last-child {
          margin-bottom: 0;
        }
        .quote-field strong {
          font-weight: bold;
          color: #333;
        }
        .quote-field span {
          font-size: 16px;
          color: #666;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          border: none;
        }
        .items-table th {
          background-color: #4a5568;
          color: white;
          padding: 15px 12px;
          text-align: left;
          font-weight: bold;
          border: none;
        }
        .items-table th:nth-child(1) {
          text-align: center;
          width: 8%;
        }
        .items-table th:nth-child(2) {
          width: 35%;
        }
        .items-table th:nth-child(3) {
          width: 15%;
        }
        .items-table th:nth-child(4) {
          text-align: center;
          width: 12%;
        }
        .items-table th:nth-child(5),
        .items-table th:nth-child(6) {
          text-align: right;
          width: 15%;
        }
        .items-table td {
          padding: 12px;
          border: none;
          background-color: #f8f9fa;
        }
        .items-table tr:nth-child(even) td {
          background-color: #ffffff;
        }
        .total-row {
          background-color: #e2e8f0 !important;
          font-weight: bold;
        }
        .total-row td {
          background-color: #e2e8f0 !important;
          border-top: 2px solid #4a5568;
        }
        .total-amount {
          font-size: 18px;
          font-weight: bold;
          color: #7c3aed;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #666;
          border-top: 1px solid #ddd;
          padding-top: 20px;
        }
        @media print {
          body {
            margin: 0;
            padding: 15px;
          }
          .header {
            margin-bottom: 20px;
          }
          .quote-info {
            margin-bottom: 20px;
          }
          .customer-section {
            margin-bottom: 20px;
          }
          .footer {
            margin-top: 30px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-container">
          ${logoHtml}
        </div>
        <h1 class="company-name">${companyDetails.name}</h1>
        <div class="company-details">
          ${companyDetails.address}, ${companyDetails.city}<br>
          Phone: ${companyDetails.phone} | Website: https://${companyDetails.website}
        </div>
        <div class="price-list-title">PRICE LIST</div>
      </div>

      <div class="quote-header-info">
        <div class="quote-field">
          <strong>Quote for:</strong> <span>${customerName}</span>
        </div>
        <div class="quote-field">
          <strong>Date Issued:</strong> <span>${currentDate}</span>
        </div>
        <div class="quote-field">
          <strong>Sales Rep:</strong> <span>${salesRep}</span>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Product Type</th>
            <th>Size</th>
            <th>Quantity</th>
            <th>Price/Sheet</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr class="total-row">
            <td colspan="5" style="text-align: right; font-weight: bold; padding: 15px 12px;">Total Amount:</td>
            <td style="text-align: right; font-weight: bold; padding: 15px 12px;">
              <span class="total-amount">$${totalAmount.toFixed(2)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>This quote is valid for 30 days from the date above.</p>
      </div>
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