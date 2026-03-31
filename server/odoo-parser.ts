import { storage } from "./storage";
import { InsertCustomer } from "../shared/schema";
import ExcelJS from 'exceljs';
import { nanoid } from 'nanoid';
import { deriveRegionTag } from './odoo';

const FREIGHT_KEYWORDS = ['freight', 'shipping', 'ship'];

export function isFreightContact(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return FREIGHT_KEYWORDS.some(kw => lower.includes(kw));
}

interface ParsedOdooRow {
  completeName: string;
  phone: string;
  email: string;
  salesperson: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  jobTitle: string;
  comment: string;
}

function parseOdooRow(row: Record<string, ExcelJS.CellValue>): ParsedOdooRow | null {
  const getValue = (key: string): string => {
    const value = row[key];
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };

  const completeName = getValue('Complete Name');
  const phone = getValue('Phone') || getValue('Mobile');
  const email = getValue('Email');
  const salesperson = getValue('Salesperson');
  const street = getValue('Street') || getValue('Address') || getValue('Street and Number');
  const street2 = getValue('Street2') || getValue('Street 2');
  const city = getValue('City');
  const state = getValue('State') || getValue('State/Province') || getValue('Province');
  const country = getValue('Country');
  const zip = getValue('Zip') || getValue('ZIP') || getValue('Postal Code');
  const jobTitle = getValue('Job Position') || getValue('Function') || getValue('Job Title');
  const comment = getValue('Notes') || getValue('Comment') || getValue('Internal Notes');

  if (!completeName && !email && !phone) {
    console.log('Skipping row with no identifiable information');
    return null;
  }

  return {
    completeName,
    phone,
    email,
    salesperson,
    street,
    street2,
    city,
    state,
    country,
    zip,
    jobTitle,
    comment,
  };
}

function splitCompleteName(completeName: string): { 
  company: string; 
  firstName: string; 
  lastName: string;
} {
  const parts = completeName.split(',').map(p => p.trim());
  
  if (parts.length >= 2) {
    const company = parts[0];
    const personName = parts[1];
    const nameParts = personName.split(' ').filter(p => p.length > 0);
    
    return {
      company,
      firstName: nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''
    };
  } else {
    const nameParts = completeName.split(' ').filter(p => p.length > 0);
    
    if (nameParts.length === 1) {
      return {
        company: completeName,
        firstName: '',
        lastName: ''
      };
    } else {
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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Excel file has no worksheets');
    }

    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || '');
    });

    const jsonData: Record<string, ExcelJS.CellValue>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      const rowData: Record<string, ExcelJS.CellValue> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      jsonData.push(rowData);
    });

    console.log(`Processing ${jsonData.length} rows from Odoo Excel file`);

    if (jsonData.length === 0) {
      throw new Error('Excel file is empty or has no data rows');
    }

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

        const { company, firstName, lastName } = splitCompleteName(parsedOdoo.completeName);

        if (isFreightContact(company) || isFreightContact(parsedOdoo.completeName)) {
          console.log(`[Odoo Parser] Skipping freight/shipping contact: ${parsedOdoo.completeName}`);
          continue;
        }

        let customerId = nanoid(12);
        
        const isDuplicateEmail = parsedOdoo.email && seenEmails.has(parsedOdoo.email.toLowerCase());
        const isDuplicatePhone = parsedOdoo.phone && seenPhones.has(parsedOdoo.phone);
        
        if (isDuplicateEmail || isDuplicatePhone) {
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
          address1: parsedOdoo.street || '',
          address2: parsedOdoo.street2 || '',
          city: parsedOdoo.city,
          province: parsedOdoo.state || '',
          country: parsedOdoo.country,
          zip: parsedOdoo.zip,
          phone: parsedOdoo.phone,
          defaultAddressPhone: parsedOdoo.phone,
          acceptsSmsMarketing: false,
          totalSpent: "0",
          totalOrders: 0,
          taxExempt: false,
          tags: parsedOdoo.salesperson ? `Salesperson: ${parsedOdoo.salesperson}` : '',
          sources: ['odoo'],
          jobTitle: parsedOdoo.jobTitle || null,
          note: parsedOdoo.comment || null,
        };

        const derivedRegion = deriveRegionTag(parsedOdoo.country, null);
        console.log(`[Odoo Import] Row ${i + 2}: derivedRegionTag=${derivedRegion} (country="${parsedOdoo.country}")`);

        parsedCustomers.push({ customerData, lineNumber: i + 2 });

      } catch (error) {
        const errorMsg = `Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Parsed ${parsedCustomers.length} valid customers from Odoo, now processing batch operations...`);

    console.log('Fetching existing customers from database...');
    const startTime = Date.now();
    const allExistingCustomers = await storage.getAllCustomers();
    console.log(`Fetched ${allExistingCustomers.length} existing customers in ${Date.now() - startTime}ms`);

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

    const customersToCreate: InsertCustomer[] = [];
    const customersToUpdate: Array<{ id: string; data: InsertCustomer }> = [];

    for (const { customerData } of parsedCustomers) {
      let existingCustomer = null;
      
      if (customerData.email) {
        existingCustomer = existingByEmail.get(customerData.email.toLowerCase());
      }
      
      if (!existingCustomer && customerData.phone) {
        existingCustomer = existingByPhone.get(customerData.phone);
      }

      if (existingCustomer) {
        const existingSources = existingCustomer.sources || [];
        const mergedSources = existingSources.includes('odoo') 
          ? existingSources 
          : [...existingSources, 'odoo'];
        
        customersToUpdate.push({ 
          id: existingCustomer.id, 
          data: {
            ...customerData,
            id: existingCustomer.id,
            sources: mergedSources
          }
        });
      } else {
        customersToCreate.push(customerData);
      }
    }

    console.log(`Batch processing: ${customersToCreate.length} to create, ${customersToUpdate.length} to update`);

    const BATCH_SIZE = 100;

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
