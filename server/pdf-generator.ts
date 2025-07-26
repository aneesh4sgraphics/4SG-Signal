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

  // Group items by product type
  const itemsByType: { [key: string]: QuoteItem[] } = {};
  quoteItems.forEach(item => {
    if (!itemsByType[item.productType]) {
      itemsByType[item.productType] = [];
    }
    itemsByType[item.productType].push(item);
  });

  // Calculate total amount based on Min Order Qty × Price/Sheet
  const calculatedTotalAmount = quoteItems.reduce((sum, item) => {
    const orderQty = Math.max(item.minOrderQty || 0, item.quantity);
    const itemTotal = orderQty * item.pricePerSheet;
    return sum + itemTotal;
  }, 0);

  // Convert total amount to words
  function numberToWords(num: number): string {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    if (num === 0) return 'zero';
    
    const dollars = Math.floor(num);
    const cents = Math.round((num - dollars) * 100);
    
    function convertHundreds(n: number): string {
      let result = '';
      
      if (n >= 100) {
        result += ones[Math.floor(n / 100)] + ' hundred ';
        n %= 100;
      }
      
      if (n >= 20) {
        result += tens[Math.floor(n / 10)];
        if (n % 10 !== 0) result += '-' + ones[n % 10];
      } else if (n > 0) {
        result += ones[n];
      }
      
      return result.trim();
    }
    
    function convertToWords(n: number): string {
      if (n === 0) return '';
      
      if (n < 1000) return convertHundreds(n);
      if (n < 1000000) return convertHundreds(Math.floor(n / 1000)) + ' thousand ' + convertHundreds(n % 1000);
      if (n < 1000000000) return convertHundreds(Math.floor(n / 1000000)) + ' million ' + convertToWords(n % 1000000);
      
      return n.toString(); // fallback for very large numbers
    }
    
    let result = convertToWords(dollars).trim();
    if (result) result += ' dollar' + (dollars !== 1 ? 's' : '');
    
    if (cents > 0) {
      if (result) result += ' and ';
      result += convertToWords(cents) + ' cent' + (cents !== 1 ? 's' : '');
    }
    
    return result || 'zero dollars';
  }

  // Generate separate tables for each product type
  const productTables = Object.entries(itemsByType).map(([productType, items]) => {
    const categoryName = getCategoryDisplayName(productType);
    
    const productRows = items.map((item, index) => {
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
          <strong style="font-size: 18px;">Total Amount: $${calculatedTotalAmount.toFixed(2)}</strong>
          <div style="font-size: 12px; margin-top: 5px; color: #666; font-weight: normal;">
            (${numberToWords(calculatedTotalAmount)})
          </div>
        </div>
      </div>

      <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 8px;">
        <h4 style="font-size: 14px; font-weight: bold; color: #333; margin-bottom: 10px;">Payment Instructions</h4>
        <div style="font-size: 10px; color: #666; line-height: 1.4;">
          <p style="margin: 5px 0;"><strong>All payments should be made to 4S GRAPHICS, INC. only.</strong></p>
          <p style="margin: 5px 0;"><strong>ACH Payments:</strong> Account# 0126734133 | Routing# 063104668 | SWIFT Code: UPNBUS44 / ABA: 062005690</p>
          <p style="margin: 5px 0;"><strong>Credit Cards:</strong> Visa, MasterCard, and American Express (4.5% processing fee applies)</p>
          <p style="margin: 5px 0;"><strong>Zelle Payments:</strong> Linked Phone Number for Payment: 260-580-0526</p>
          <p style="margin: 5px 0;"><strong>PayPal Payments:</strong> info@4sgraphics.com (4.5% PayPal fee applies)</p>
          <p style="margin: 5px 0;"><strong>Shipping Costs:</strong> At Actuals - Discuss with your Sales Rep to get accurate Shipping costs</p>
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
    return pdfBuffer as Buffer;
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