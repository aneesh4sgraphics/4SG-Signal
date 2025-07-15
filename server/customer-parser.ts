import fs from 'fs';
import path from 'path';

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  acceptsEmailMarketing: boolean;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  totalSpent: number;
  totalOrders: number;
  note: string;
  tags: string;
}

function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split('\n');
  const result: string[][] = [];
  
  for (const line of lines) {
    if (line.trim()) {
      const row = line.split(',');
      // Clean up quoted values
      const cleanRow = row.map(cell => cell.replace(/^'|'$/g, '').replace(/"/g, ''));
      result.push(cleanRow);
    }
  }
  
  return result;
}

export function parseCustomerData(): Customer[] {
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'customers_export.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCSV(csvContent);
    
    if (rows.length === 0) return [];
    
    // Skip header row
    const dataRows = rows.slice(1);
    const customers: Customer[] = [];
    
    for (const row of dataRows) {
      if (row.length >= 20) {
        const customer: Customer = {
          id: row[0] || '',
          firstName: row[1] || '',
          lastName: row[2] || '',
          email: row[3] || '',
          acceptsEmailMarketing: row[4] === 'yes',
          company: row[5] || '',
          address1: row[6] || '',
          address2: row[7] || '',
          city: row[8] || '',
          province: row[9] || '',
          country: row[10] || '',
          zip: row[11] || '',
          phone: row[13] || '',
          totalSpent: parseFloat(row[15]) || 0,
          totalOrders: parseInt(row[16]) || 0,
          note: row[17] || '',
          tags: row[19] || ''
        };
        
        customers.push(customer);
      }
    }
    
    return customers;
  } catch (error) {
    console.error('Error parsing customer data:', error);
    return [];
  }
}