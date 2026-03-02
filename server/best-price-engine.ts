import { db } from "./db";
import { customers, productPricingMaster, productCompetitorMappings, competitorPricing } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { odooClient } from "./odoo";

export interface BestPriceInput {
  productId?: number;
  itemCode?: string;
  customerId?: string;
  quantity?: number;
}

export interface BestPriceResult {
  recommendedPrice: number;
  priceRange: {
    floor: number;
    ceiling: number;
  };
  factors: PriceFactor[];
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  unitType: 'sheet' | 'roll' | 'unit';
  productInfo: {
    productName: string;
    size: string;
    minOrderQty: number | null;
    itemCode: string;
  };
  tierComparison: {
    customerTier: string;
    tierPrice: number;
    savings: number;
    savingsPercent: number;
    recommendation: string;
  } | null;
}

interface PriceFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  adjustment: number;
  description: string;
}

interface CustomerMetrics {
  pricingTier: string | null;
  totalSpent: number;
  totalOrders: number;
  isCompany: boolean;
  averageOrderValue: number;
}

interface ProductMetrics {
  cost: number;
  costPerSheet: number;
  tierPrices: Record<string, number>;
  tierPricesPerSheet: Record<string, number>;
  sheetArea: number;
  inventoryLevel: number;
  salesVelocity: number;
}

interface CompetitorMetrics {
  hasData: boolean;
  prices: {
    source: string;
    pricePerSheet: number;
    dimensions: string;
    productKind: string;
  }[];
  lowestPrice: number;
  averagePrice: number;
  highestPrice: number;
  priceCount: number;
}

const PRICING_TIER_ORDER = [
  'LANDED PRICE',
  'EXPORT ONLY',
  'DISTRIBUTOR',
  'DEALER-VIP',
  'DEALER',
  'SHOPIFY RETAIL',
  'RETAIL'
];

const TIER_FIELD_MAP: Record<string, string> = {
  'LANDED PRICE': 'landedPrice',
  'EXPORT ONLY': 'exportPrice',
  'DISTRIBUTOR': 'masterDistributorPrice',
  'DEALER-VIP': 'dealerPrice',
  'DEALER': 'dealer2Price',
  'APPROVAL NEEDED': 'approvalNeededPrice',
  'RETAIL': 'retailPrice',
  'SHOPIFY RETAIL': 'retailPrice',
};

export class BestPriceEngine {
  private minMarginPercent = 15;
  private loyaltyThresholds = {
    bronze: { orders: 3, discount: 0 },
    silver: { orders: 10, discount: 3 },
    gold: { orders: 25, discount: 5 },
    platinum: { orders: 50, discount: 8 },
  };
  private inventoryThresholds = {
    overstock: { level: 200, adjustment: -5 },
    healthy: { level: 50, adjustment: 0 },
    low: { level: 20, adjustment: 3 },
    critical: { level: 5, adjustment: 5 },
  };

  async calculateBestPrice(input: BestPriceInput): Promise<BestPriceResult> {
    const factors: PriceFactor[] = [];
    
    const product = await this.getProductData(input.productId, input.itemCode);
    if (!product) {
      throw new Error('Product not found');
    }

    const customer = input.customerId 
      ? await this.getCustomerMetrics(input.customerId) 
      : null;

    const productMetrics = await this.getProductMetrics(product);
    const competitorMetrics = await this.getCompetitorMetrics(product.id);
    
    // Use cost per sheet for margin floor calculation
    const marginFloor = productMetrics.costPerSheet * (1 + this.minMarginPercent / 100);
    
    // Use tier prices per sheet (not $/m²) to match Price/Sheet column display
    let tierCeiling = productMetrics.tierPricesPerSheet['RETAIL'] || marginFloor * 2;
    let baseTier = 'RETAIL';
    
    if (customer?.pricingTier) {
      const normalizedTier = customer.pricingTier.toUpperCase();
      const tierField = TIER_FIELD_MAP[normalizedTier];
      if (tierField && productMetrics.tierPricesPerSheet[normalizedTier]) {
        tierCeiling = productMetrics.tierPricesPerSheet[normalizedTier];
        baseTier = normalizedTier;
      }
    }

    factors.push({
      name: 'Base Tier',
      impact: 'neutral',
      adjustment: 0,
      description: `Customer tier: ${baseTier} → Starting at $${tierCeiling.toFixed(2)}/sheet`
    });

    let workingPrice = tierCeiling;
    let totalAdjustment = 0;

    if (customer) {
      const loyaltyAdjustment = this.calculateLoyaltyDiscount(customer);
      if (loyaltyAdjustment.discount > 0) {
        const discountAmount = workingPrice * (loyaltyAdjustment.discount / 100);
        totalAdjustment -= discountAmount;
        factors.push({
          name: 'Loyalty Reward',
          impact: 'positive',
          adjustment: -loyaltyAdjustment.discount,
          description: `${loyaltyAdjustment.level} customer (${customer.totalOrders} orders) → ${loyaltyAdjustment.discount}% off`
        });
      }
    }

    const inventoryAdjustment = this.calculateInventoryAdjustment(productMetrics);
    if (inventoryAdjustment.adjustment !== 0) {
      const adjustmentAmount = workingPrice * (inventoryAdjustment.adjustment / 100);
      totalAdjustment += adjustmentAmount;
      factors.push({
        name: 'Inventory Level',
        impact: inventoryAdjustment.adjustment < 0 ? 'positive' : 'negative',
        adjustment: inventoryAdjustment.adjustment,
        description: inventoryAdjustment.description
      });
    }

    if (input.quantity && input.quantity >= 100) {
      const volumeDiscount = Math.min(Math.floor(input.quantity / 100) * 2, 10);
      const discountAmount = workingPrice * (volumeDiscount / 100);
      totalAdjustment -= discountAmount;
      factors.push({
        name: 'Volume Discount',
        impact: 'positive',
        adjustment: -volumeDiscount,
        description: `Quantity ${input.quantity} → ${volumeDiscount}% volume discount`
      });
    }

    // Competitor pricing intelligence
    if (competitorMetrics.hasData) {
      const competitorAdjustment = this.calculateCompetitorAdjustment(
        workingPrice + totalAdjustment,
        competitorMetrics,
        marginFloor
      );
      if (competitorAdjustment.adjustment !== 0) {
        totalAdjustment += competitorAdjustment.adjustmentAmount;
      }
      factors.push({
        name: 'Competitor Intel',
        impact: competitorAdjustment.impact,
        adjustment: competitorAdjustment.adjustment,
        description: competitorAdjustment.description
      });
    }

    let recommendedPrice = workingPrice + totalAdjustment;
    
    if (recommendedPrice < marginFloor) {
      const originalRecommended = recommendedPrice;
      recommendedPrice = marginFloor;
      factors.push({
        name: 'Margin Protection',
        impact: 'negative',
        adjustment: 0,
        description: `Price raised from $${originalRecommended.toFixed(2)} to maintain ${this.minMarginPercent}% minimum margin`
      });
    }

    const confidence = this.calculateConfidence(productMetrics, customer, competitorMetrics);
    const rationale = this.generateRationale(factors, recommendedPrice, tierCeiling);

    // Determine unit type from product
    const unitType = this.determineUnitType(product);
    
    // Build tier comparison
    const tierComparison = this.buildTierComparison(
      recommendedPrice,
      tierCeiling,
      baseTier,
      customer?.pricingTier || null
    );

    return {
      recommendedPrice: Math.round(recommendedPrice * 100) / 100,
      priceRange: {
        floor: Math.round(marginFloor * 100) / 100,
        ceiling: Math.round(tierCeiling * 100) / 100,
      },
      factors,
      confidence,
      rationale,
      unitType,
      productInfo: {
        productName: product.productName || product.productType || 'Unknown',
        size: product.size || '',
        minOrderQty: product.minOrderQty ? parseInt(String(product.minOrderQty)) : null,
        itemCode: product.itemCode || '',
      },
      tierComparison,
    };
  }

  private determineUnitType(product: any): 'sheet' | 'roll' | 'unit' {
    // Check explicit rollSheet field
    if (product.rollSheet) {
      const rollSheetLower = product.rollSheet.toLowerCase();
      if (rollSheetLower === 'roll') return 'roll';
      if (rollSheetLower === 'sheet') return 'sheet';
    }
    
    // Check unitOfMeasure field
    if (product.unitOfMeasure) {
      const uom = product.unitOfMeasure.toLowerCase();
      if (uom.includes('roll')) return 'roll';
      if (uom.includes('sheet')) return 'sheet';
    }
    
    // Check size for roll indicators (feet notation)
    if (product.size) {
      const size = product.size;
      if (size.includes("'") || size.toLowerCase().includes('feet') || /\d+x\d+'/.test(size)) {
        return 'roll';
      }
    }
    
    // Default to sheet
    return 'sheet';
  }

  private buildTierComparison(
    recommendedPrice: number,
    tierPrice: number,
    tierName: string,
    customerTier: string | null
  ): BestPriceResult['tierComparison'] {
    const savings = tierPrice - recommendedPrice;
    const savingsPercent = tierPrice > 0 ? (savings / tierPrice) * 100 : 0;
    
    let recommendation = '';
    
    if (savings > 0) {
      recommendation = `Offer $${recommendedPrice.toFixed(2)} instead of list price $${tierPrice.toFixed(2)} - saves customer ${savingsPercent.toFixed(1)}%`;
    } else if (savings < 0) {
      recommendation = `List price $${tierPrice.toFixed(2)} is below recommended. Consider quoting $${recommendedPrice.toFixed(2)} to protect margin.`;
    } else {
      recommendation = `Quote at list price $${tierPrice.toFixed(2)}`;
    }
    
    return {
      customerTier: customerTier || tierName,
      tierPrice: Math.round(tierPrice * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      savingsPercent: Math.round(savingsPercent * 10) / 10,
      recommendation,
    };
  }

  private async getProductData(productId?: number, itemCode?: string) {
    if (productId) {
      const [product] = await db.select().from(productPricingMaster)
        .where(eq(productPricingMaster.id, productId)).limit(1);
      return product;
    }
    if (itemCode) {
      const [product] = await db.select().from(productPricingMaster)
        .where(eq(productPricingMaster.itemCode, itemCode)).limit(1);
      return product;
    }
    return null;
  }

  private async getCustomerMetrics(customerId: string): Promise<CustomerMetrics | null> {
    try {
      const [customer] = await db.select({
        pricingTier: customers.pricingTier,
        totalSpent: customers.totalSpent,
        totalOrders: customers.totalOrders,
        isCompany: customers.isCompany,
      }).from(customers).where(eq(customers.id, customerId)).limit(1);

      if (!customer) return null;

      const totalSpent = parseFloat(String(customer.totalSpent || 0));
      const totalOrders = customer.totalOrders || 0;

      return {
        pricingTier: customer.pricingTier,
        totalSpent,
        totalOrders,
        isCompany: customer.isCompany || false,
        averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
      };
    } catch (error) {
      console.error('[BestPrice] Error fetching customer metrics:', error);
      return null;
    }
  }

  private async getProductMetrics(product: any): Promise<ProductMetrics> {
    let cost = 0;
    let inventoryLevel = 50;
    let salesVelocity = 1;

    try {
      if (product.odooItemCode) {
        const products = await odooClient.searchRead(
          'product.product',
          [['default_code', '=', product.odooItemCode]],
          ['id', 'standard_price', 'qty_available', 'sales_count'],
          { limit: 1 }
        );
        
        if (products.length > 0) {
          cost = products[0].standard_price || 0;
          inventoryLevel = products[0].qty_available || 50;
          salesVelocity = products[0].sales_count || 1;
        }
      }
    } catch (error) {
      console.error('[BestPrice] Error fetching Odoo metrics:', error);
    }

    // Calculate sqm-per-sheet using the same formula as the quote calculator:
    //   pricePerSheet = (pricePerSqm × totalSqm) / minQuantity
    // totalSqm = total area of the minimum order pack; minQuantity = sheets in that pack.
    const totalSqm = parseFloat(String(product.totalSqm || 0));
    const minQty = Math.max(1, parseInt(String(product.minQuantity || 1)));
    const sheetArea = totalSqm / minQty;

    // Tier prices in $/m² from database
    const tierPrices: Record<string, number> = {};
    if (product.landedPrice) tierPrices['LANDED PRICE'] = parseFloat(String(product.landedPrice));
    if (product.exportPrice) tierPrices['EXPORT ONLY'] = parseFloat(String(product.exportPrice));
    if (product.masterDistributorPrice) tierPrices['DISTRIBUTOR'] = parseFloat(String(product.masterDistributorPrice));
    if (product.dealerPrice) tierPrices['DEALER-VIP'] = parseFloat(String(product.dealerPrice));
    if (product.dealer2Price) tierPrices['DEALER'] = parseFloat(String(product.dealer2Price));
    if (product.retailPrice) tierPrices['RETAIL'] = parseFloat(String(product.retailPrice));

    // Convert tier prices to price per sheet ($/m² × sheet area = $/sheet)
    const tierPricesPerSheet: Record<string, number> = {};
    for (const [tier, pricePerSqm] of Object.entries(tierPrices)) {
      tierPricesPerSheet[tier] = sheetArea > 0 ? pricePerSqm * sheetArea : pricePerSqm;
    }

    if (cost === 0) {
      if (product.landedPrice) {
        cost = parseFloat(String(product.landedPrice)) * 0.6;
      } else if (tierPrices['EXPORT ONLY']) {
        cost = tierPrices['EXPORT ONLY'] * 0.5;
      } else if (tierPrices['DISTRIBUTOR']) {
        cost = tierPrices['DISTRIBUTOR'] * 0.4;
      } else {
        const anyPrice = Object.values(tierPrices).find(p => p > 0);
        if (anyPrice) {
          cost = anyPrice * 0.35;
        }
      }
    }

    // Convert cost to cost per sheet
    const costPerSheet = sheetArea > 0 ? cost * sheetArea : cost;

    return {
      cost,
      costPerSheet,
      tierPrices,
      tierPricesPerSheet,
      sheetArea,
      inventoryLevel,
      salesVelocity,
    };
  }

  private calculateLoyaltyDiscount(customer: CustomerMetrics): { level: string; discount: number } {
    const orders = customer.totalOrders;
    
    if (orders >= this.loyaltyThresholds.platinum.orders) {
      return { level: 'Platinum', discount: this.loyaltyThresholds.platinum.discount };
    }
    if (orders >= this.loyaltyThresholds.gold.orders) {
      return { level: 'Gold', discount: this.loyaltyThresholds.gold.discount };
    }
    if (orders >= this.loyaltyThresholds.silver.orders) {
      return { level: 'Silver', discount: this.loyaltyThresholds.silver.discount };
    }
    return { level: 'Bronze', discount: this.loyaltyThresholds.bronze.discount };
  }

  private calculateInventoryAdjustment(metrics: ProductMetrics): { adjustment: number; description: string } {
    const level = metrics.inventoryLevel;
    
    if (level >= this.inventoryThresholds.overstock.level) {
      return {
        adjustment: this.inventoryThresholds.overstock.adjustment,
        description: `High inventory (${level} units) → 5% discount to move stock`
      };
    }
    if (level <= this.inventoryThresholds.critical.level) {
      return {
        adjustment: this.inventoryThresholds.critical.adjustment,
        description: `Critical stock (${level} units) → Hold price, limited availability`
      };
    }
    if (level <= this.inventoryThresholds.low.level) {
      return {
        adjustment: this.inventoryThresholds.low.adjustment,
        description: `Low stock (${level} units) → Price protection active`
      };
    }
    return { adjustment: 0, description: 'Healthy inventory levels' };
  }

  private async getCompetitorMetrics(productId: number): Promise<CompetitorMetrics> {
    try {
      // Get all competitor pricing entries mapped to this product
      const mappings = await db
        .select({
          mapping: productCompetitorMappings,
          competitor: competitorPricing,
        })
        .from(productCompetitorMappings)
        .innerJoin(competitorPricing, eq(productCompetitorMappings.competitorPricingId, competitorPricing.id))
        .where(
          and(
            eq(productCompetitorMappings.productId, productId),
            eq(productCompetitorMappings.status, 'active')
          )
        );

      if (mappings.length === 0) {
        return {
          hasData: false,
          prices: [],
          lowestPrice: 0,
          averagePrice: 0,
          highestPrice: 0,
          priceCount: 0,
        };
      }

      const prices = mappings.map(m => {
        // Calculate price per sheet from competitor data
        const inputPrice = parseFloat(String(m.competitor.inputPrice || 0));
        const packQty = parseInt(String(m.competitor.packQty || 1)) || 1;
        const pricePerSheet = m.competitor.pricePerSheet 
          ? parseFloat(String(m.competitor.pricePerSheet))
          : inputPrice / packQty;

        return {
          source: m.competitor.source || 'Unknown',
          pricePerSheet,
          dimensions: m.competitor.dimensions || '',
          productKind: m.competitor.productKind || '',
        };
      }).filter(p => p.pricePerSheet > 0);

      if (prices.length === 0) {
        return {
          hasData: false,
          prices: [],
          lowestPrice: 0,
          averagePrice: 0,
          highestPrice: 0,
          priceCount: 0,
        };
      }

      const priceValues = prices.map(p => p.pricePerSheet);
      const lowestPrice = Math.min(...priceValues);
      const highestPrice = Math.max(...priceValues);
      const averagePrice = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;

      return {
        hasData: true,
        prices,
        lowestPrice,
        averagePrice,
        highestPrice,
        priceCount: prices.length,
      };
    } catch (error) {
      console.error('[BestPrice] Error fetching competitor metrics:', error);
      return {
        hasData: false,
        prices: [],
        lowestPrice: 0,
        averagePrice: 0,
        highestPrice: 0,
        priceCount: 0,
      };
    }
  }

  private calculateCompetitorAdjustment(
    currentPrice: number,
    competitors: CompetitorMetrics,
    marginFloor: number
  ): { adjustment: number; adjustmentAmount: number; impact: 'positive' | 'negative' | 'neutral'; description: string } {
    const avgCompetitorPrice = competitors.averagePrice;
    const lowestCompetitorPrice = competitors.lowestPrice;
    
    // Calculate how our price compares to competitors
    const priceDiffPercent = ((currentPrice - avgCompetitorPrice) / avgCompetitorPrice) * 100;
    
    // Strategy: Position slightly below average for competitiveness, but never below margin floor
    // If our price is 10%+ above average → suggest 5% discount
    // If our price is within ±5% of average → stay competitive
    // If our price is 10%+ below average → we're already competitive, no adjustment
    
    if (priceDiffPercent >= 15) {
      // We're significantly more expensive - recommend matching closer to average
      const targetPrice = avgCompetitorPrice * 0.98; // Slightly below average
      const adjustment = Math.max(targetPrice, marginFloor) - currentPrice;
      const adjustmentPercent = (adjustment / currentPrice) * 100;
      
      return {
        adjustment: Math.round(adjustmentPercent),
        adjustmentAmount: adjustment,
        impact: 'positive',
        description: `${competitors.priceCount} competitors avg $${avgCompetitorPrice.toFixed(2)} → Match market`
      };
    } else if (priceDiffPercent >= 5) {
      // We're moderately above average
      const adjustmentPercent = -3; // Small 3% adjustment
      const adjustmentAmount = currentPrice * (adjustmentPercent / 100);
      
      return {
        adjustment: adjustmentPercent,
        adjustmentAmount,
        impact: 'positive',
        description: `Competitors avg $${avgCompetitorPrice.toFixed(2)} (${competitors.priceCount} sources) → Minor alignment`
      };
    } else if (priceDiffPercent <= -10) {
      // We're significantly cheaper than competitors
      return {
        adjustment: 0,
        adjustmentAmount: 0,
        impact: 'positive',
        description: `Price advantage: ${Math.abs(priceDiffPercent).toFixed(0)}% below competitor avg ($${avgCompetitorPrice.toFixed(2)})`
      };
    }
    
    // We're close to market average - neutral position
    return {
      adjustment: 0,
      adjustmentAmount: 0,
      impact: 'neutral',
      description: `Market-aligned: ${competitors.priceCount} competitors at $${lowestCompetitorPrice.toFixed(2)}-$${competitors.highestPrice.toFixed(2)}`
    };
  }

  private calculateConfidence(metrics: ProductMetrics, customer: CustomerMetrics | null, competitors?: CompetitorMetrics): 'high' | 'medium' | 'low' {
    let score = 0;
    
    if (metrics.cost > 0) score += 25;
    if (Object.keys(metrics.tierPrices).length >= 3) score += 15;
    if (customer?.pricingTier) score += 20;
    if (customer && customer.totalOrders > 0) score += 20;
    if (competitors?.hasData) score += 20; // Boost confidence with competitor data
    
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  private generateRationale(factors: PriceFactor[], recommendedPrice: number, tierCeiling: number): string {
    const positiveFactors = factors.filter(f => f.impact === 'positive');
    const negativeFactors = factors.filter(f => f.impact === 'negative');
    
    let rationale = `Recommended price: $${recommendedPrice.toFixed(2)}`;
    
    if (recommendedPrice < tierCeiling) {
      const savings = tierCeiling - recommendedPrice;
      const savingsPercent = ((savings / tierCeiling) * 100).toFixed(1);
      rationale += ` (${savingsPercent}% below list)`;
    }
    
    if (positiveFactors.length > 0) {
      rationale += `. Benefits applied: ${positiveFactors.map(f => f.name).join(', ')}`;
    }
    
    return rationale;
  }
}

export const bestPriceEngine = new BestPriceEngine();
