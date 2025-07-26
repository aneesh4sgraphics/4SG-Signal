// pdf-generator.ts (Complete Drop-in Replacement)

import pdf from "html-pdf-node";
import fs from "fs";
import path from "path";

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
  website: "https://4sgraphics.com",
};

function getLogoBase64(): string {
  // Use the company logo from client/public directory
  const logoPath = path.join(process.cwd(), "client", "public", "company-logo.jpg");
  
  if (fs.existsSync(logoPath)) {
    console.log(`Using company logo from: ${logoPath}`);
    const buffer = fs.readFileSync(logoPath);
    return buffer.toString("base64");
  }
  
  console.warn("Company logo not found at expected location:", logoPath);
  return "";
}

function numberToWords(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Category mapping function to get proper category display names
function getCategoryDisplayName(productType: string): string {
  // Category mappings based on product types
  const categoryMappings: { [key: string]: string } = {
    // Graffiti Polyester Paper products
    'Graffiti Polyester Paper': 'Graffiti Polyester Paper',
    'AuraBoard - Holographics': 'Graffiti Polyester Paper',
    // Solvit products
    'Solvit Poster Paper 175gsm': 'Solvit Sign & Display Media',
    'Solvit Backlit Film 8mil': 'Solvit Sign & Display Media',
    'Solvit Self Adhesive Vinyl - 4mil (Greyback)': 'Solvit Sign & Display Media',
    'Solvit Self Adhesive Vinyl - 6mil (white Back)': 'Solvit Sign & Display Media',
    'Solvit PolySign 11mil': 'Solvit Sign & Display Media',
    'Solvit PolySign 17mil': 'Solvit Sign & Display Media',
    'Solvit SlickStick 5mil Polyester': 'Solvit Sign & Display Media',
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
    // Default fallback
    default: 'Product Media'
  };

  return categoryMappings[productType] || categoryMappings.default;
}

function generateQuoteHTML(data: PDFGenerationRequest): string {
  const { customerName, quoteNumber, quoteItems, totalAmount } = data;
  const logo = getLogoBase64();
  const date = new Date().toLocaleDateString();

  // Group by productType
  const grouped = quoteItems.reduce(
    (acc, item) => {
      const key = item.productType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, QuoteItem[]>,
  );

  const tables = Object.entries(grouped)
    .map(([type, items]) => {
      const rows = items
        .map(
          (item, idx) => `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f2f2f2"};">
        <td>${item.size}</td>
        <td style="text-align:center;">${item.minOrderQty}</td>
        <td style="text-align:right;">$${item.pricePerSheet.toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold;">$${(item.minOrderQty * item.pricePerSheet).toFixed(2)}</td>
      </tr>
    `,
        )
        .join("");

      // Get the proper category display name for this product type
      const categoryDisplayName = getCategoryDisplayName(type);

      return `
      <div style="margin-bottom: 25px;">
        <div style="margin-bottom: 10px;">
          <div style="font-size: 14px; font-weight: 600; color: #3b82f6; margin-bottom: 2px;">${categoryDisplayName}</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${type}</div>
        </div>
        <table width="100%" style="border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="background:#374151;color:white;">
              <th style="padding:8px;text-align:left;">Size</th>
              <th style="padding:8px;text-align:center;">Min Order Qty</th>
              <th style="padding:8px;text-align:right;">Price/Sheet</th>
              <th style="padding:8px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
    })
    .join("");

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #333; }
          .header { text-align: center; margin-bottom: 32px; }
          .header img { height: 60px; margin-bottom: 10px; }
          .quote-number { font-weight: bold; color: #000; }
          .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 24px; }
          .footer { font-size: 11px; margin-top: 40px; line-height: 1.5; color: #555; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logo ? `<img src="data:image/png;base64,${logo}" alt="4S Graphics Logo" />` : ""}
          <h2>${companyDetails.name}</h2>
          <p>${companyDetails.address}, ${companyDetails.city}</p>
          <p>Phone: ${companyDetails.phone} | Website: ${companyDetails.website}</p>
          <h3>QUICK QUOTE</h3>
        </div>

        <div><strong>Quote #:</strong> ${quoteNumber} <span style="float:right;"><strong>Date:</strong> ${date}</span></div>
        <p><strong>Prepared for:</strong> ${customerName}</p>

        ${tables}

        <div class="total">Total Amount: ${numberToWords(totalAmount)}</div>

        <div class="footer">
          <p><strong>Payment Instructions</strong></p>
          <p>All payments should be made to 4S GRAPHICS, INC. only.</p>
          <p>ACH Payments: Account# 0126734133 | Routing# 063104668 | SWIFT: UPNBUS44 / ABA: 062005690</p>
          <p>Credit Cards: Visa, MasterCard, and AmEx (4.5% processing fee applies)</p>
          <p>Zelle: 260-580-0526</p>
          <p>PayPal: info@4sgraphics.com (4.5% fee applies)</p>
          <p>Shipping Costs: At Actuals — Discuss with Sales Rep</p>
        </div>
      </body>
    </html>
  `;
}

export async function generateQuotePDF(
  request: PDFGenerationRequest,
): Promise<Buffer> {
  const html = generateQuoteHTML(request);

  const pdfOptions = {
    format: "A4" as const,
    printBackground: true,
  };

  const file = { content: html };
  
  try {
    const pdfBuffer = await pdf.generatePdf(file, pdfOptions);
    // html-pdf-node returns a Buffer directly
    return pdfBuffer as Buffer;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error('Failed to generate PDF');
  }
}

export function generateQuoteNumber(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}
