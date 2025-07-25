import pdf from 'html-pdf-node';
import { SentQuote } from '@shared/schema';
import fs from 'fs';
import path from 'path';

interface QuoteItem {
  id: string;
  productName: string;
  productType: string;
  size: string;
  itemCode: string;
  quantity: number;
  pricePerSqM: number;
  pricePerSheet: number;
  total: number;
  tier: string;
  squareMeters: number;
  minOrderQty: number;
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
  
  // Get the logo as base64
  const logoBase64 = getLogoBase64();

  // Group items by product type
  const itemsByType: { [key: string]: QuoteItem[] } = {};
  quoteItems.forEach(item => {
    if (!itemsByType[item.productType]) {
      itemsByType[item.productType] = [];
    }
    itemsByType[item.productType].push(item);
  });

  // Generate separate tables for each product type
  const productTables = Object.entries(itemsByType).map(([productType, items]) => {
    const productRows = items.map((item, index) => `
      <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${item.size}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.tier}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">$${item.pricePerSheet.toFixed(2)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold;">$${item.total.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom: 25px;">
        <h3 style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 10px; padding: 8px 0; border-bottom: 2px solid #4CAF50;">${productType}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; background-color: white; border: 1px solid #ddd;">
          <thead>
            <tr style="background-color: #4CAF50;">
              <th style="padding: 10px 12px; color: white; text-align: left; font-weight: bold; font-size: 11px;">Size</th>
              <th style="padding: 10px 12px; color: white; text-align: center; font-weight: bold; font-size: 11px;">Tier</th>
              <th style="padding: 10px 12px; color: white; text-align: center; font-weight: bold; font-size: 11px;">Qty</th>
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
      <meta charset="UTF-8">
      <title>Quick Quote ${quoteNumber}</title>
      <style>
        @media print {
          @page { margin: 0.5in; }
          body { print-color-adjust: exact; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
          line-height: 1.4;
          font-size: 11px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 15px;
        }
        .logo-section {
          margin-bottom: 15px;
        }
        .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #333;
          margin-bottom: 8px;
        }
        .company-details {
          font-size: 12px;
          color: #666;
          line-height: 1.3;
          margin-bottom: 15px;
        }
        .document-title {
          font-size: 20px;
          font-weight: bold;
          color: #333;
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #ccc;
        }
        .quote-info {
          margin-bottom: 25px;
          padding: 15px;
          background-color: #f9f9f9;
        }
        .quote-details {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .quote-number {
          font-size: 16px;
          font-weight: bold;
          color: #4CAF50;
        }
        .quote-date {
          font-size: 12px;
          color: #666;
        }
        .customer-info {
          margin-bottom: 25px;
          padding: 10px;
          background-color: #f5f5f5;
        }
        .customer-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .total-section {
          text-align: right;
          margin-top: 25px;
          padding: 15px;
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
        <div class="logo-section">
          ${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" alt="4S Graphics Logo" style="max-height: 60px; max-width: 150px; margin-bottom: 10px;" />` : ''}
          <div class="company-name">${companyDetails.name}</div>
          <div class="company-details">
            ${companyDetails.address}, ${companyDetails.city}<br>
            Phone: ${companyDetails.phone} | Website: https://${companyDetails.website}
          </div>
          <div class="document-title">QUICK QUOTE</div>
        </div>
      </div>

      <div class="quote-info">
        <div class="quote-details">
          <div class="quote-number">Quote #${quoteNumber}</div>
          <div class="quote-date">${currentDate}</div>
        </div>
      </div>

      <div class="customer-info">
        <div class="customer-name">Prepared for: ${customerName}</div>
      </div>

      <div class="items-section">
        ${productTables}
      </div>

      <div class="total-section">
        <div class="total-amount">
          <strong style="font-size: 14px;">Total Amount: $${totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 15px;">
        <p>Thank you for your business!</p>
        <p>For questions about this quote, please contact us at ${companyDetails.phone}</p>
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
  // Generate 6-digit alphanumeric (mix of numbers and uppercase letters)
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Function to generate unique quote number with database checking
export async function generateUniqueQuoteNumber(storage: any): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const quoteNumber = generateQuoteNumber();
    
    try {
      // Check if quote number already exists in database
      const existingQuote = await storage.getSentQuoteByNumber(quoteNumber);
      if (!existingQuote) {
        return quoteNumber;
      }
    } catch (error) {
      console.error('Error checking quote number uniqueness:', error);
    }
    
    attempts++;
  }
  
  // Fallback: add timestamp suffix if can't generate unique number
  const fallbackNumber = generateQuoteNumber();
  const timestamp = Date.now().toString().slice(-3);
  return `${fallbackNumber.slice(0, 3)}${timestamp}`;
}