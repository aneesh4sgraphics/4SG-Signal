import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all product categories
  app.get("/api/product-categories", async (req, res) => {
    try {
      const categories = await storage.getProductCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product categories" });
    }
  });

  // Get product types by category
  app.get("/api/product-types/:categoryId", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      if (isNaN(categoryId)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      
      const types = await storage.getProductTypesByCategory(categoryId);
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product types" });
    }
  });

  // Get product sizes by type
  app.get("/api/product-sizes/:typeId", async (req, res) => {
    try {
      const typeId = parseInt(req.params.typeId);
      if (isNaN(typeId)) {
        return res.status(400).json({ error: "Invalid type ID" });
      }
      
      const sizes = await storage.getProductSizesByType(typeId);
      res.json(sizes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product sizes" });
    }
  });

  // Get all pricing tiers
  app.get("/api/pricing-tiers", async (req, res) => {
    try {
      const tiers = await storage.getPricingTiers();
      res.json(tiers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pricing tiers" });
    }
  });

  // Get price for specific square meters
  app.get("/api/price/:squareMeters", async (req, res) => {
    try {
      const squareMeters = parseFloat(req.params.squareMeters);
      if (isNaN(squareMeters) || squareMeters <= 0) {
        return res.status(400).json({ error: "Invalid square meters value" });
      }
      
      const price = await storage.getPriceForSquareMeters(squareMeters);
      res.json({ price });
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate price" });
    }
  });

  // Calculate custom size square meters
  app.post("/api/calculate-square-meters", async (req, res) => {
    try {
      const schema = z.object({
        width: z.number().positive(),
        height: z.number().positive(),
        widthUnit: z.enum(['inch', 'feet']),
        heightUnit: z.enum(['inch', 'feet'])
      });

      const { width, height, widthUnit, heightUnit } = schema.parse(req.body);
      
      const widthInches = widthUnit === 'feet' ? width * 12 : width;
      const heightInches = heightUnit === 'feet' ? height * 12 : height;
      const squareMeters = (widthInches * heightInches) * (0.0254 * 0.0254);
      
      const price = await storage.getPriceForSquareMeters(squareMeters);
      
      res.json({ 
        squareMeters: parseFloat(squareMeters.toFixed(4)), 
        price 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data" });
      }
      res.status(500).json({ error: "Failed to calculate square meters" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
