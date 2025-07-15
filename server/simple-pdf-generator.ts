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
}

const companyDetails = {
  name: "4S Graphics, Inc.",
  address: "764 NW 57th Court",
  city: "Fort Lauderdale, FL 33309",
  phone: "(954) 493.6484",
  website: "www.4sgraphics.com"
};

function generateQuoteHTML(request: PDFGenerationRequest): string {
  const { customerName, quoteItems, quoteNumber, totalAmount } = request;
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Generate table rows for quote items
  const itemRows = quoteItems.map((item, index) => `
    <tr>
      <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
      <td style="padding: 12px; border: 1px solid #ddd;">${item.productType}</td>
      <td style="padding: 12px; border: 1px solid #ddd;">${item.productSize}</td>
      <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">$${item.pricePerSheet.toFixed(2)}</td>
      <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">$${item.total.toFixed(2)}</td>
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
          display: flex;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #7c3aed;
        }
        .company-info {
          flex: 1;
        }
        .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #7c3aed;
          margin: 0;
        }
        .company-details {
          font-size: 14px;
          color: #666;
          margin-top: 5px;
        }
        .quote-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .quote-number {
          font-size: 18px;
          font-weight: bold;
          color: #7c3aed;
        }
        .quote-date {
          font-size: 14px;
          color: #666;
        }
        .customer-section {
          margin-bottom: 30px;
        }
        .customer-label {
          font-weight: bold;
          color: #333;
          margin-bottom: 5px;
        }
        .customer-name {
          font-size: 16px;
          color: #666;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .items-table th {
          background-color: #7c3aed;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: bold;
        }
        .items-table th:nth-child(1),
        .items-table th:nth-child(4) {
          text-align: center;
        }
        .items-table th:nth-child(5),
        .items-table th:nth-child(6) {
          text-align: right;
        }
        .total-row {
          background-color: #f8f9fa;
          font-weight: bold;
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
        ${logoHtml}
        <div class="company-info">
          <h1 class="company-name">${companyDetails.name}</h1>
          <div class="company-details">
            ${companyDetails.address}<br>
            ${companyDetails.city}<br>
            Phone: ${companyDetails.phone}<br>
            Website: ${companyDetails.website}
          </div>
        </div>
      </div>

      <div class="quote-info">
        <div>
          <div class="quote-number">Quote #${quoteNumber}</div>
          <div class="quote-date">Date: ${currentDate}</div>
        </div>
      </div>

      <div class="customer-section">
        <div class="customer-label">Quote For:</div>
        <div class="customer-name">${customerName}</div>
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
            <td colspan="5" style="padding: 12px; border: 1px solid #ddd; text-align: right; font-weight: bold;">Total Amount:</td>
            <td style="padding: 12px; border: 1px solid #ddd; text-align: right; font-weight: bold;">
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