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
  return '<html><body><h1>Quote</h1><p>Basic quote content</p></body></html>';
}

export function generatePriceListHTML(data: any): string {
  return '<html><body><h1>Price List</h1><p>Basic price list content</p></body></html>';
}

export function generatePriceListCSV(data: any): string {
  return 'Product,Price\nSample Product,$10.00';
}