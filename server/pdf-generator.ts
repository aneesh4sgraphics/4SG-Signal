import pdf from 'html-pdf-node';
import { SentQuote } from '@shared/schema';
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
  const itemRows = quoteItems.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${item.productType}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.productSize}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.tierName}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">$${item.pricePerSheet.toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center; font-weight: bold;">$${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

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
          padding: 40px;
          color: #333;
          line-height: 1.6;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 2px solid #4CAF50;
        }
        .logo {
          max-width: 200px;
          height: auto;
          margin-bottom: 20px;
        }
        .company-info {
          margin-bottom: 20px;
        }
        .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #4CAF50;
          margin-bottom: 10px;
        }
        .company-details {
          font-size: 14px;
          color: #666;
          line-height: 1.4;
        }
        .quote-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          padding: 20px;
          background-color: #f9f9f9;
          border-radius: 8px;
        }
        .quote-details {
          flex: 1;
        }
        .quote-number {
          font-size: 20px;
          font-weight: bold;
          color: #4CAF50;
          margin-bottom: 10px;
        }
        .customer-info {
          margin-bottom: 30px;
        }
        .customer-name {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          background-color: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .items-table th {
          background-color: #4CAF50;
          color: white;
          padding: 15px 12px;
          text-align: left;
          font-weight: bold;
        }
        .items-table th:nth-child(2),
        .items-table th:nth-child(3),
        .items-table th:nth-child(4),
        .items-table th:nth-child(5),
        .items-table th:nth-child(6) {
          text-align: center;
        }
        .total-section {
          text-align: right;
          margin-top: 30px;
          padding: 20px;
          background-color: #f9f9f9;
          border-radius: 8px;
        }
        .total-amount {
          font-size: 24px;
          font-weight: bold;
          color: #4CAF50;
          margin-top: 10px;
        }
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 12px;
          color: #666;
          border-top: 1px solid #e5e5e5;
          padding-top: 20px;
        }
        .page-number {
          position: fixed;
          bottom: 20px;
          right: 20px;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="data:image/jpeg;base64,${getLogoBase64()}" alt="4S Graphics Logo" class="logo">
        <div class="company-info">
          <div class="company-name">${companyDetails.name}</div>
          <div class="company-details">
            ${companyDetails.address}<br>
            ${companyDetails.city}<br>
            Phone: ${companyDetails.phone}<br>
            Website: ${companyDetails.website}
          </div>
        </div>
      </div>

      <div class="quote-info">
        <div class="quote-details">
          <div class="quote-number">Quote #${quoteNumber}</div>
          <div>Date: ${currentDate}</div>
        </div>
      </div>

      <div class="customer-info">
        <div class="customer-name">Dear ${customerName},</div>
        <p>Here below is the quote you requested:</p>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Size</th>
            <th>Pricing Tier</th>
            <th>Quantity</th>
            <th>Price per Sheet</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 16px; margin-bottom: 10px;">Quote Total:</div>
        <div class="total-amount">$${totalAmount.toFixed(2)}</div>
      </div>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>This quote is valid for 30 days from the date issued.</p>
      </div>

      <div class="page-number">Page 1</div>
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

export async function generateQuotePDF(request: PDFGenerationRequest): Promise<Buffer> {
  const html = generateQuoteHTML(request);
  
  const options = {
    format: 'A4',
    border: {
      top: '0.5in',
      right: '0.5in',
      bottom: '0.5in',
      left: '0.5in'
    },
    type: 'pdf',
    quality: '100',
    puppeteerArgs: {
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    }
  };

  try {
    const pdfBuffer = await pdf.generatePdf({ content: html }, options);
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
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