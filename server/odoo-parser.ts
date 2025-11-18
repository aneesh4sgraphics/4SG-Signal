import { storage } from "./storage";
import { InsertCustomer } from "../shared/schema";
import * as XLSX from 'xlsx';
import { nanoid } from 'nanoid';

interface ParsedOdooRow {
  completeName: string;
  phone: string;
  email: string;
  salesperson: string;
  city: string;
  country: string;
  zip: string;
}

function parseOdooRow(row: any): ParsedOdooRow | null {
  // Extract fields from row object
  const completeName = row['Complete Name']?.toString().trim() || '';
  const phone = row['Phone']?.toString().trim() || '';
  const email = row['Email']?.toString().trim() || '';
  const salesperson = row['Salesperson']?.toString().trim() || '';
  const city = row['City']?.toString().trim() || '';
  const country = row['Country']?.toString().trim() || '';
  const zip = row['Zip']?.toString().trim() || '';

  if (!completeName && !email && !phone) {
    console.log('Skipping row with no identifiable information');
    return null;
  }

  return {
    completeName,
    phone,
    email,
    salesperson,
    city,
    country,
    zip
  };
}

function splitCompleteName(completeName: string): { 
  company: string; 
  firstName: string; 
  lastName: string;
} {
  // Odoo format can be:
  // "Company Name"
  // "Company Name, First Last"
  // "First Last"
  
  const parts = completeName.split(',').map(p => p.trim());
  
  if (parts.length >= 2) {
    // Format: "Company Name, Person Name"
    const company = parts[0];
    const personName = parts[1];
    const nameParts = personName.split(' ').filter(p => p.length > 0);
    
    return {
      company,
      firstName: nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''
    };
  } else {
    // Format: "Name" (could be person or company)
    const nameParts = completeName.split(' ').filter(p => p.length > 0);
    
    if (nameParts.length === 1) {
      // Single word - treat as company
      return {
        company: completeName,
        firstName: '',
        lastName: ''
      };
    } else {
      // Multiple words - treat as person name
      return {
        company: '',
        firstName: nameParts.slice(0, -1).join(' '),
        lastName: nameParts[nameParts.length - 1]
      };
    }
  }
}

export async function parseOdooExcel(fileBuffer: Buffer): Promise<{
  newCustomers: number;
  updatedCustomers: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let newCustomers = 0;
  let updatedCustomers = 0;

  try {
    // Parse Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Processing ${jsonData.length} rows from Odoo Excel file`);

    if (jsonData.length === 0) {
      throw new Error('Excel file is empty or has no data rows');
    }

    // Parse all customers first
    const parsedCustomers: Array<{ customerData: InsertCustomer; lineNumber: number }> = [];
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    
    for (let i = 0; i < jsonData.length; i++) {
      try {
        const row = jsonData[i];
        const parsedOdoo = parseOdooRow(row);

        if (!parsedOdoo) {
          continue;
        }

        // Split the complete name into company/firstName/lastName
        const { company, firstName, lastName } = splitCompleteName(parsedOdoo.completeName);

        // Generate unique ID using nanoid
        let customerId = nanoid(12);
        
        // Check for duplicate emails or phones within the CSV to avoid conflicts
        const isDuplicateEmail = parsedOdoo.email && seenEmails.has(parsedOdoo.email.toLowerCase());
        const isDuplicatePhone = parsedOdoo.phone && seenPhones.has(parsedOdoo.phone);
        
        if (isDuplicateEmail || isDuplicatePhone) {
          // This is likely a duplicate entry, append index to make unique
          customerId = `${customerId}-${i}`;
        }
        
        if (parsedOdoo.email) seenEmails.add(parsedOdoo.email.toLowerCase());
        if (parsedOdoo.phone) seenPhones.add(parsedOdoo.phone);

        const customerData: InsertCustomer = {
          id: customerId,
          firstName,
          lastName,
          email: parsedOdoo.email,
          acceptsEmailMarketing: false,
          company,
          address1: '',
          address2: '',
          city: parsedOdoo.city,
          province: '',
          country: parsedOdoo.country,
          zip: parsedOdoo.zip,
          phone: parsedOdoo.phone,
          defaultAddressPhone: parsedOdoo.phone,
          acceptsSmsMarketing: false,
          totalSpent: "0",
          totalOrders: 0,
          note: '',
          taxExempt: false,
          tags: parsedOdoo.salesperson ? `Salesperson: ${parsedOdoo.salesperson}` : ''
        };

        parsedCustomers.push({ customerData, lineNumber: i + 2 }); // +2 for header row

      } catch (error) {
        const errorMsg = `Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Parsed ${parsedCustomers.length} valid customers from Odoo, now processing batch operations...`);

    // Get all existing customers
    console.log('Fetching existing customers from database...');
    const startTime = Date.now();
    const allExistingCustomers = await storage.getAllCustomers();
    console.log(`Fetched ${allExistingCustomers.length} existing customers in ${Date.now() - startTime}ms`);

    // Create a map of existing customers by email and phone for matching
    const existingByEmail = new Map(
      allExistingCustomers
        .filter(c => c.email)
        .map(c => [c.email!.toLowerCase(), c])
    );
    const existingByPhone = new Map(
      allExistingCustomers
        .filter(c => c.phone)
        .map(c => [c.phone!, c])
    );

    // Separate into new vs existing customers
    const customersToCreate: InsertCustomer[] = [];
    const customersToUpdate: Array<{ id: string; data: InsertCustomer }> = [];

    for (const { customerData } of parsedCustomers) {
      // Check if customer exists by email or phone
      let existingCustomer = null;
      
      if (customerData.email) {
        existingCustomer = existingByEmail.get(customerData.email.toLowerCase());
      }
      
      if (!existingCustomer && customerData.phone) {
        existingCustomer = existingByPhone.get(customerData.phone);
      }

      if (existingCustomer) {
        // Update existing customer
        customersToUpdate.push({ 
          id: existingCustomer.id, 
          data: {
            ...customerData,
            id: existingCustomer.id // Use existing ID
          }
        });
      } else {
        // Create new customer
        customersToCreate.push(customerData);
      }
    }

    console.log(`Batch processing: ${customersToCreate.length} to create, ${customersToUpdate.length} to update`);

    // Process in batches
    const BATCH_SIZE = 100;

    // Create new customers in batches
    for (let i = 0; i < customersToCreate.length; i += BATCH_SIZE) {
      const batch = customersToCreate.slice(i, i + BATCH_SIZE);
      try {
        await storage.createCustomersBatch(batch);
        newCustomers += batch.length;
        console.log(`Created batch of ${batch.length} customers (${i + batch.length}/${customersToCreate.length})`);
      } catch (error) {
        console.error(`Error creating customer batch:`, error);
        errors.push(`Batch create error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Update existing customers in batches
    for (let i = 0; i < customersToUpdate.length; i += BATCH_SIZE) {
      const batch = customersToUpdate.slice(i, i + BATCH_SIZE);
      try {
        await storage.updateCustomersBatch(batch);
        updatedCustomers += batch.length;
        console.log(`Updated batch of ${batch.length} customers (${i + batch.length}/${customersToUpdate.length})`);
      } catch (error) {
        console.error(`Error updating customer batch:`, error);
        errors.push(`Batch update error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`Odoo import completed: ${newCustomers} new, ${updatedCustomers} updated, ${errors.length} errors`);

    return {
      newCustomers,
      updatedCustomers,
      errors
    };

  } catch (error) {
    console.error('Error parsing Odoo Excel file:', error);
    throw new Error(`Failed to parse Odoo Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
