// API endpoints for CSV file upload and conversion
import multer from "multer";
import * as fs from 'fs';
import * as path from 'path';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ 
  dest: uploadsDir,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export function addPricingRoutes(app: any, isAuthenticated: any, requireAdmin: any) {
  // Upload and process CSV file
  app.post("/api/upload-pricing-csv", isAuthenticated, requireAdmin, upload.single('file'), async (req: any, res: any) => {
    try {
      console.log("CSV upload started");
      
      if (!req.file) {
        console.log("No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log("File received:", req.file.originalname, "Size:", req.file.size);
      
      // Validate file extension
      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        console.log("Invalid file extension:", req.file.originalname);
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Only CSV files are allowed" });
      }

      const filePath = req.file.path;
      console.log("Reading file from:", filePath);
      
      // Read CSV file
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      console.log("CSV content length:", csvContent.length);
      
      // Basic validation - check if it looks like CSV
      const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        console.log("CSV appears to be empty or invalid");
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "CSV file appears to be empty or invalid" });
      }
      
      // Check header row for required columns
      const headerRow = lines[0].toLowerCase();
      const requiredColumns = ['itemcode', 'product_name', 'producttype', 'size', 'total_sqm', 'min_quantity'];
      const missingColumns = requiredColumns.filter(col => !headerRow.includes(col));
      
      if (missingColumns.length > 0) {
        console.log("Missing required columns:", missingColumns);
        fs.unlinkSync(filePath);
        return res.status(400).json({ 
          error: `Missing required columns: ${missingColumns.join(', ')}`,
          details: "Please ensure your CSV contains all required columns"
        });
      }
      
      // Write to attached_assets folder
      const outputPath = path.join(process.cwd(), 'attached_assets', 'converted_pricing_data.csv');
      console.log("Writing to:", outputPath);
      fs.writeFileSync(outputPath, csvContent);
      
      // Count records
      const recordsProcessed = Math.max(0, lines.length - 1); // Subtract header
      console.log("Records processed:", recordsProcessed);
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      console.log("CSV upload completed successfully");
      
      res.json({
        success: true,
        message: `CSV file processed successfully. ${recordsProcessed} products are now available. Previous data has been completely replaced.`,
        recordsProcessed: recordsProcessed,
        filename: 'converted_pricing_data.csv'
      });
      
    } catch (error) {
      console.error("Error processing CSV file:", error);
      
      // Clean up uploaded file if it exists
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError);
        }
      }
      
      res.status(500).json({ 
        error: "Failed to process CSV file", 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Download current pricing data
  app.get("/api/download-pricing-data", isAuthenticated, requireAdmin, async (req: any, res: any) => {
    try {
      const filePath = path.join(process.cwd(), 'attached_assets', 'converted_pricing_data.csv');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Pricing data file not found" });
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="pricing-data.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error downloading pricing data:", error);
      res.status(500).json({ error: "Failed to download pricing data" });
    }
  });
}