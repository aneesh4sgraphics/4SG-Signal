import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { 
  ArrowLeft, Package, DollarSign, Users, Warehouse, 
  ShoppingCart, ExternalLink, TrendingUp, Box, Layers,
  AlertCircle, Loader2, Target, TrendingDown, TrendingUp as TrendUp,
  Eye, EyeOff
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface PricingTier {
  key: string;
  label: string;
  pricePerSqm: number;
  pricePerSheet: number;
  minOrderQtyPrice: number;
}

interface LocalPricing {
  productName: string;
  productType: string;
  size: string;
  totalSqm: number;
  minQuantity: number;
  rollSheet: string | null;
  unitOfMeasure: string | null;
  tiers: PricingTier[];
}

interface BestPriceData {
  hasData: boolean;
  message?: string;
  recommendedPrice?: number;
  statistics?: {
    weightedAverage: number;
    simpleAverage: number;
    median: number;
    minPrice: number;
    maxPrice: number;
    percentile25: number;
    percentile75: number;
  };
  volume?: {
    totalInvoices: number;
    totalQuantitySold: number;
    distinctCustomers: number;
  };
  recentActivity?: {
    mostRecentPrice: number;
    mostRecentDate: string;
  };
}

interface ProductDetails {
  product: {
    id: number;
    name: string;
    sku: string;
    listPrice: number;
    averageCost: number;
    category: string | null;
    type: string;
    description: string;
    uom: string;
  };
  pricingTiers: Array<{
    id: number;
    pricelistName: string;
    pricelistId: number;
    fixedPrice: number;
    minQuantity: number;
    computePrice: string;
    percentPrice: number;
  }>;
  localPricing: LocalPricing | null;
  inventory: {
    available: number;
    virtual: number;
    incoming: number;
    outgoing: number;
    variants: Array<{
      id: number;
      sku: string;
      available: number;
      virtual: number;
      incoming: number;
      outgoing: number;
    }>;
  };
  purchaseOrders: {
    totalOnOrder: number;
    orders: Array<{
      id: number;
      order_name: string;
      product_qty: number;
      qty_received: number;
      qty_remaining: number;
      price_unit: number;
      date_planned: string;
      state: string;
    }>;
  };
  customerPurchases: Array<{
    partnerId: number;
    partnerName: string;
    totalQty: number;
    totalRevenue: number;
    orderCount: number;
  }>;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(num);
}

function getProductTypeLabel(type: string): string {
  switch (type) {
    case 'consu': return 'Consumable';
    case 'service': return 'Service';
    case 'product': return 'Storable';
    default: return type;
  }
}

function getProductTypeColor(type: string): string {
  switch (type) {
    case 'consu': return 'bg-blue-100 text-blue-800';
    case 'service': return 'bg-purple-100 text-purple-800';
    case 'product': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function OdooProductDetail() {
  const [, params] = useRoute("/odoo-products/:id");
  const productId = params?.id;
  const { user } = useAuth();
  const [landedPriceRevealed, setLandedPriceRevealed] = useState(false);
  
  const isAdmin = (user as any)?.role === 'admin';

  const { data, isLoading, error } = useQuery<ProductDetails>({
    queryKey: ['/api/odoo/products', productId, 'details'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/products/${productId}/details`);
      if (!res.ok) {
        throw new Error('Failed to fetch product details');
      }
      return res.json();
    },
    enabled: !!productId,
  });

  const { data: bestPriceData, isLoading: bestPriceLoading } = useQuery<BestPriceData>({
    queryKey: ['/api/odoo/products', productId, 'best-price'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/products/${productId}/best-price`);
      if (!res.ok) {
        throw new Error('Failed to fetch best price data');
      }
      return res.json();
    },
    enabled: !!productId,
  });

  if (!productId) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">Invalid Product ID</h3>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Link href="/odoo-products">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
        </Link>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">Failed to load product</h3>
          <p className="text-gray-500 mt-2">{error?.message || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const { product, pricingTiers, localPricing, inventory, purchaseOrders, customerPurchases } = data;
  const margin = product.listPrice > 0 && product.averageCost > 0
    ? ((product.listPrice - product.averageCost) / product.listPrice * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/odoo-products">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {product.sku && (
                <span className="text-sm font-mono text-gray-500">{product.sku}</span>
              )}
              <Badge variant="secondary" className={getProductTypeColor(product.type)}>
                {getProductTypeLabel(product.type)}
              </Badge>
              {product.category && (
                <Badge variant="outline">
                  <Layers className="w-3 h-3 mr-1" />
                  {product.category}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <a
          href={`https://4sgraphics.odoo.com/web#id=${product.id}&model=product.product&view_type=form`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in Odoo
          </Button>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Average Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatPrice(product.averageCost)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              List: {formatPrice(product.listPrice)} • {margin.toFixed(1)}% margin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              Available Quantity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(inventory.available)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Virtual: {formatNumber(inventory.virtual)} • {product.uom}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              On Purchase Order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(purchaseOrders.totalOnOrder)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {purchaseOrders.orders.length} active orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(customerPurchases.length)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Have purchased this product
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Target className="w-5 h-5" />
            Best Price to Offer
          </CardTitle>
          <CardDescription>
            Based on invoice history from the last 12 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bestPriceLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-green-600" />
              <span className="text-gray-500">Analyzing invoice history...</span>
            </div>
          ) : bestPriceData?.hasData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-4xl font-bold text-green-700">
                    {formatPrice(bestPriceData.recommendedPrice || 0)}
                  </div>
                  <p className="text-sm text-green-600 mt-1">Recommended selling price per unit</p>
                </div>
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Avg (Weighted)</div>
                    <div className="text-lg font-semibold text-gray-800">
                      {formatPrice(bestPriceData.statistics?.weightedAverage || 0)}
                    </div>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Median</div>
                    <div className="text-lg font-semibold text-gray-800">
                      {formatPrice(bestPriceData.statistics?.median || 0)}
                    </div>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" /> Min
                    </div>
                    <div className="text-lg font-semibold text-gray-800">
                      {formatPrice(bestPriceData.statistics?.minPrice || 0)}
                    </div>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <TrendUp className="w-3 h-3" /> Max
                    </div>
                    <div className="text-lg font-semibold text-gray-800">
                      {formatPrice(bestPriceData.statistics?.maxPrice || 0)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 border-t border-green-200 pt-3">
                <span className="bg-white/80 px-2 py-1 rounded">
                  <strong>{bestPriceData.volume?.totalInvoices || 0}</strong> invoices
                </span>
                <span className="bg-white/80 px-2 py-1 rounded">
                  <strong>{formatNumber(bestPriceData.volume?.totalQuantitySold || 0)}</strong> units sold
                </span>
                <span className="bg-white/80 px-2 py-1 rounded">
                  <strong>{bestPriceData.volume?.distinctCustomers || 0}</strong> customers
                </span>
                {bestPriceData.recentActivity?.mostRecentDate && bestPriceData.recentActivity?.mostRecentPrice != null && (
                  <span className="text-gray-500 ml-auto">
                    Last sale: {bestPriceData.recentActivity.mostRecentDate} @ {formatPrice(bestPriceData.recentActivity.mostRecentPrice)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{bestPriceData?.message || 'No invoice data available'}</p>
              <p className="text-sm mt-1">Pricing recommendations require sales history</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Available Pricing Tiers
            </CardTitle>
            <CardDescription>
              {localPricing ? (
                <span>
                  Size: {localPricing.size || '-'} • {(localPricing.totalSqm || 0).toFixed(4)} sqm • Min Qty: {localPricing.minQuantity || 1} {localPricing.unitOfMeasure || 'Units'}
                </span>
              ) : (
                'Price by tier'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {localPricing && localPricing.tiers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pricing Tier</TableHead>
                    <TableHead className="text-right">$/m²</TableHead>
                    <TableHead className="text-right">
                      {localPricing.rollSheet === 'Roll' ? 'Price/Roll' : `Price/${localPricing.unitOfMeasure || 'Sheet'}`}
                    </TableHead>
                    <TableHead className="text-right">Min Order Qty Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localPricing.tiers
                    .filter(tier => {
                      const isLandedPrice = tier.key === 'landedPrice';
                      if (!isLandedPrice) return true;
                      return isAdmin && landedPriceRevealed;
                    })
                    .map((tier) => (
                    <TableRow key={tier.key}>
                      <TableCell className="font-medium uppercase">{tier.label}</TableCell>
                      <TableCell className="text-right text-gray-600">
                        {tier.pricePerSqm > 0 ? formatPrice(tier.pricePerSqm) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        {tier.pricePerSheet > 0 ? formatPrice(tier.pricePerSheet) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-700">
                        {tier.minOrderQtyPrice > 0 ? formatPrice(tier.minOrderQtyPrice) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {isAdmin && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLandedPriceRevealed(!landedPriceRevealed)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          {landedPriceRevealed ? (
                            <>
                              <EyeOff className="w-4 h-4 mr-2" />
                              Hide Landed Price
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Show Landed Price
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : pricingTiers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pricelist</TableHead>
                    <TableHead className="text-right">Min Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricingTiers.map((tier) => (
                    <TableRow key={tier.id}>
                      <TableCell className="font-medium">{tier.pricelistName}</TableCell>
                      <TableCell className="text-right">{tier.minQuantity}</TableCell>
                      <TableCell className="text-right">
                        {tier.computePrice === 'fixed' 
                          ? formatPrice(tier.fixedPrice)
                          : tier.computePrice === 'percentage'
                            ? `${tier.percentPrice}% off`
                            : formatPrice(tier.fixedPrice)
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No pricing data available</p>
                <p className="text-sm">This product is not in the QuickQuotes catalog</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Top Customers
            </CardTitle>
            <CardDescription>
              Customers who purchase this product
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customerPurchases.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No purchase history found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerPurchases.slice(0, 10).map((customer) => (
                    <TableRow key={customer.partnerId}>
                      <TableCell className="font-medium">
                        <Link 
                          href={`/odoo-contacts/${customer.partnerId}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {customer.partnerName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(customer.totalQty)}</TableCell>
                      <TableCell className="text-right">{formatPrice(customer.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{customer.orderCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {inventory.variants.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="w-5 h-5" />
              Inventory by Variant
            </CardTitle>
            <CardDescription>
              Stock levels for each product variant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Virtual</TableHead>
                  <TableHead className="text-right">Incoming</TableHead>
                  <TableHead className="text-right">Outgoing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell className="font-mono">{variant.sku || `ID: ${variant.id}`}</TableCell>
                    <TableCell className="text-right">{formatNumber(variant.available)}</TableCell>
                    <TableCell className="text-right">{formatNumber(variant.virtual)}</TableCell>
                    <TableCell className="text-right text-green-600">+{formatNumber(variant.incoming)}</TableCell>
                    <TableCell className="text-right text-red-600">-{formatNumber(variant.outgoing)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {purchaseOrders.orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Recent Purchase Orders
            </CardTitle>
            <CardDescription>
              Pending and completed purchase orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead>Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.orders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.order_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(po.product_qty)}</TableCell>
                    <TableCell className="text-right">{formatNumber(po.qty_received)}</TableCell>
                    <TableCell className="text-right font-medium text-orange-600">
                      {formatNumber(po.qty_remaining)}
                    </TableCell>
                    <TableCell className="text-right">{formatPrice(po.price_unit)}</TableCell>
                    <TableCell>
                      {po.date_planned 
                        ? new Date(po.date_planned).toLocaleDateString()
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
