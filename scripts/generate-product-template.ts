import * as XLSX from 'xlsx';
import path from 'path';

// Current product category data
const productCategories = [
  {
    categoryKey: 'graffiti',
    displayName: 'Graffiti POLYESTER PAPER',
    logoFile: 'Graffiti-Logo--long_1765564746224.png',
    features: 'Scuff Free / Waterproof / Tear Resistant',
    subFeatures: 'High Rigidity / Excellent Alcohol & Stain Resistance',
    compatibleWith: 'Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh, Fuji Inkjet and others',
    matchesProducts: 'Products containing "graffiti" (but not graffitistick or slickstick)'
  },
  {
    categoryKey: 'graffitistick',
    displayName: 'GraffitiSTICK',
    logoFile: 'GraffitiSTICK-left_align_1765564758521.jpg',
    features: 'Self-Adhesive / Waterproof / Tear Resistant',
    subFeatures: 'Easy Application / Removable or Permanent Options',
    compatibleWith: 'Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh, Fuji Inkjet and others',
    matchesProducts: 'Products containing "graffitistick" or "slickstick"'
  },
  {
    categoryKey: 'cliq',
    displayName: 'CLIQ Photo Paper',
    logoFile: 'CLIQ_Final_logo2_med_size_1765564721731.png',
    features: 'Photo Quality / Archival Inks Compatible / High Color Gamut',
    subFeatures: 'Instant Dry / Premium Finish',
    compatibleWith: 'Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh, Fuji Inkjet and others',
    matchesProducts: 'Products containing "cliq", "photo", "eie", "ele", or "paper"'
  },
  {
    categoryKey: 'solvit',
    displayName: 'SolviT Sign & Display Media',
    logoFile: 'Solvit_Logo-new_1765564775082.png',
    features: 'Sign & Display Media / Indoor/Outdoor Use',
    subFeatures: 'UV Resistant / Durable',
    compatibleWith: 'Compatible with All Eco-Solvent, Latex and UV Printers',
    matchesProducts: 'Products containing "solvit"'
  },
  {
    categoryKey: 'rang',
    displayName: 'Rang Print Canvas',
    logoFile: 'Rang_Print_Canvas_Logo_1765564783260.png',
    features: 'Premium Canvas / Archival Quality',
    subFeatures: 'True Color Reproduction / Artist Grade',
    compatibleWith: 'Compatible with All Wide Format Inkjet Printers',
    matchesProducts: 'Products containing "rang" or "canvas"'
  }
];

// Create workbook
const wb = XLSX.utils.book_new();

// Create worksheet data
const wsData = [
  ['Product Category Configuration Template'],
  [''],
  ['Instructions:'],
  ['1. Update the values in the columns below for each product category'],
  ['2. The "Category Key" column is used to match products - do not change these'],
  ['3. "Features" are shown in bold at the top of the PDF section'],
  ['4. "Sub Features" are shown in italic below the main features'],
  ['5. "Compatible With" is shown at the bottom of each product section'],
  ['6. "Matches Products" column shows which product names will use this category (for reference only)'],
  [''],
  ['Category Key', 'Display Name', 'Logo File', 'Features (Bold)', 'Sub Features (Italic)', 'Compatible With', 'Matches Products (Reference)']
];

// Add data rows
productCategories.forEach(cat => {
  wsData.push([
    cat.categoryKey,
    cat.displayName,
    cat.logoFile,
    cat.features,
    cat.subFeatures,
    cat.compatibleWith,
    cat.matchesProducts
  ]);
});

// Create worksheet
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Set column widths
ws['!cols'] = [
  { wch: 15 },  // Category Key
  { wch: 30 },  // Display Name
  { wch: 45 },  // Logo File
  { wch: 50 },  // Features
  { wch: 50 },  // Sub Features
  { wch: 80 },  // Compatible With
  { wch: 60 }   // Matches Products
];

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Product Categories');

// Write file
const outputPath = path.join(process.cwd(), 'product-category-template.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✓ Template created at: ${outputPath}`);
