import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { 
  ArrowLeft, Package, DollarSign, Users, Warehouse, 
  ShoppingCart, ExternalLink, TrendingUp, Box, Layers,
  AlertCircle, Loader2, Target, TrendingDown, TrendingUp as TrendUp,
  Eye, EyeOff, ChevronLeft, ChevronRight, ImageIcon, FileText,
  Upload, Trash2, Download, X, Tag, TrendingUp as TrendingUpIcon,
  ClipboardList
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";

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
  const [, setLocation] = useLocation();
  const [landedPriceRevealed, setLandedPriceRevealed] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploadingType, setUploadingType] = useState<'photo' | 'pdf' | null>(null);
  const [pdfLabel, setPdfLabel] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  
  const userRole = (user as any)?.role || 'user';
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const canSeeCost = isAdmin || isManager;
  const canUpload = isAdmin || isManager;

  const { data: navData } = useQuery<{ prevId: number | null; nextId: number | null }>({
    queryKey: ['/api/odoo/products', productId, 'navigation'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/products/${productId}/navigation`);
      if (!res.ok) return { prevId: null, nextId: null };
      return res.json();
    },
    enabled: !!productId,
  });

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

  interface Attachment {
    id: number;
    odooProductId: number;
    fileName: string;
    fileUrl: string;
    fileType: 'photo' | 'pdf';
    label: string | null;
    mimeType: string | null;
    uploadedBy: string | null;
    uploadedAt: string;
  }

  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery<Attachment[]>({
    queryKey: ['/api/odoo/products', productId, 'attachments'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/products/${productId}/attachments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId,
  });

  const { uploadFile, isUploading } = useUpload();

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      await apiRequest('DELETE', `/api/odoo/products/${productId}/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/odoo/products', productId, 'attachments'] });
      toast({ title: 'Attachment removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove attachment', variant: 'destructive' });
    },
  });

  const handleFileUpload = async (file: File, type: 'photo' | 'pdf') => {
    setUploadingType(type);
    try {
      const result = await uploadFile(file);
      if (!result) return;
      const label = type === 'pdf' ? (pdfLabel.trim() || file.name) : undefined;
      await apiRequest('POST', `/api/odoo/products/${productId}/attachments`, {
        fileName: file.name,
        fileUrl: result.objectPath,
        fileType: type,
        label: label || null,
        mimeType: file.type || null,
        odooProductId: parseInt(productId!),
      });
      qc.invalidateQueries({ queryKey: ['/api/odoo/products', productId, 'attachments'] });
      toast({ title: type === 'photo' ? 'Photo uploaded' : 'PDF uploaded' });
      setPdfLabel('');
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploadingType(null);
    }
  };

  const photos = attachments.filter(a => a.fileType === 'photo');
  const pdfs = attachments.filter(a => a.fileType === 'pdf');

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
          
          {/* Previous/Next Navigation */}
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="icon"
              disabled={!navData?.prevId}
              onClick={() => navData?.prevId && setLocation(`/odoo-products/${navData.prevId}`)}
              title="Previous Product"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              disabled={!navData?.nextId}
              onClick={() => navData?.nextId && setLocation(`/odoo-products/${navData.nextId}`)}
              title="Next Product"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
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

      {/* Inventory + Cost highlight tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Quantity on Hand (qty_available from Odoo) */}
        <Card className="border border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              Quantity on Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-800">
              {formatNumber(inventory.available)}
            </div>
            <p className="text-xs text-green-600 mt-1">
              {product.uom} · Forecasted: {formatNumber(inventory.virtual)}
            </p>
          </CardContent>
        </Card>

        {/* On Sales Orders (outgoing_qty) */}
        <Card className="border border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              On Sales Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-800">
              {formatNumber(inventory.outgoing)}
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Reserved for active orders
            </p>
          </CardContent>
        </Card>

        {/* On Purchase Orders */}
        <Card className="border border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              On Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-800">
              {formatNumber(purchaseOrders.totalOnOrder)}
            </div>
            <p className="text-xs text-blue-600 mt-1">
              {purchaseOrders.orders.length} open order{purchaseOrders.orders.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Average Cost — admin + manager only */}
        {canSeeCost && (
          <Card className="border border-violet-200 bg-violet-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-violet-700 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Average Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              {landedPriceRevealed ? (
                <>
                  <div className="text-3xl font-bold text-violet-800">
                    {formatPrice(product.averageCost)}
                  </div>
                  <p className="text-xs text-violet-600 mt-1">
                    List: {formatPrice(product.listPrice)} • {margin.toFixed(1)}% margin
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLandedPriceRevealed(false)}
                    className="text-violet-500 hover:text-violet-700 mt-1 h-7 text-xs px-1"
                  >
                    <EyeOff className="w-3 h-3 mr-1" /> Hide
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLandedPriceRevealed(true)}
                  className="text-violet-600 hover:text-violet-800"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Show Cost
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Photos + Documents — side-by-side ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-violet-500" />
              Photos
              {photos.length > 0 && (
                <Badge variant="secondary" className="ml-1">{photos.length}</Badge>
              )}
            </CardTitle>
            {canUpload && (
              <div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'photo');
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploading && uploadingType === 'photo'}
                >
                  {isUploading && uploadingType === 'photo'
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                    : <><Upload className="w-4 h-4 mr-2" />Add Photo</>
                  }
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No photos yet</p>
              {canUpload && (
                <p className="text-xs mt-1">Click "Add Photo" to upload product images</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="relative group">
                  <button
                    className="w-full aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-violet-400 transition-colors block focus:outline-none"
                    onClick={() => setLightboxIdx(idx)}
                  >
                    <img
                      src={photo.fileUrl}
                      alt={photo.fileName}
                      className="w-full h-full object-cover"
                      onError={e => {
                        (e.target as HTMLImageElement).src = '';
                        (e.target as HTMLImageElement).classList.add('bg-gray-100');
                      }}
                    />
                  </button>
                  {canUpload && (
                    <button
                      className="absolute top-1 right-1 bg-white/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                      onClick={() => deleteAttachmentMutation.mutate(photo.id)}
                      title="Remove photo"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── PDF Attachments ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-red-500" />
              Documents & PDFs
              {pdfs.length > 0 && (
                <Badge variant="secondary" className="ml-1">{pdfs.length}</Badge>
              )}
            </CardTitle>
            {canUpload && (
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pdf-label" className="text-xs text-gray-500">Label (optional)</Label>
                  <Input
                    id="pdf-label"
                    placeholder="e.g. Spec Sheet"
                    value={pdfLabel}
                    onChange={e => setPdfLabel(e.target.value)}
                    className="h-8 w-40 text-sm"
                  />
                </div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'pdf');
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploading && uploadingType === 'pdf'}
                >
                  {isUploading && uploadingType === 'pdf'
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                    : <><Upload className="w-4 h-4 mr-2" />Add PDF</>
                  }
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {pdfs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No documents yet</p>
              {canUpload && (
                <p className="text-xs mt-1">Upload spec sheets, brochures, or install guides</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {pdfs.map(pdf => (
                <div
                  key={pdf.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {pdf.label || pdf.fileName}
                      </p>
                      {pdf.label && pdf.label !== pdf.fileName && (
                        <p className="text-xs text-gray-400 truncate">{pdf.fileName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={pdf.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50"
                    >
                      <Download className="w-4 h-4" />
                      Open
                    </a>
                    {canUpload && (
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        onClick={() => deleteAttachmentMutation.mutate(pdf.id)}
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>{/* end photos+docs grid */}

      {/* Lightbox */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-6 h-6" />
          </button>
          {lightboxIdx > 0 && (
            <button
              className="absolute left-4 text-white p-2 hover:bg-white/10 rounded-full"
              onClick={e => { e.stopPropagation(); setLightboxIdx(i => (i! - 1 + photos.length) % photos.length); }}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          <img
            src={photos[lightboxIdx].fileUrl}
            alt={photos[lightboxIdx].fileName}
            className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {lightboxIdx < photos.length - 1 && (
            <button
              className="absolute right-4 text-white p-2 hover:bg-white/10 rounded-full"
              onClick={e => { e.stopPropagation(); setLightboxIdx(i => (i! + 1) % photos.length); }}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
          <p className="absolute bottom-4 text-white/70 text-sm">
            {lightboxIdx + 1} / {photos.length}
          </p>
        </div>
      )}

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
                    .filter(tier => tier.key !== 'landedPrice')
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
                  {canSeeCost && landedPriceRevealed && (() => {
                    const landedTier = localPricing.tiers.find(t => t.key === 'landedPrice');
                    return (
                      <>
                        <TableRow>
                          <TableCell colSpan={4} className="py-1 px-0">
                            <div className="border-t-2 border-dashed border-amber-300" />
                          </TableCell>
                        </TableRow>
                        {landedTier && (
                          <TableRow className="bg-amber-50">
                            <TableCell className="font-medium uppercase text-amber-700">
                              Calc. Landed Price
                            </TableCell>
                            <TableCell className="text-right text-amber-600">
                              {landedTier.pricePerSqm > 0 ? formatPrice(landedTier.pricePerSqm) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-amber-600">
                              {landedTier.pricePerSheet > 0 ? formatPrice(landedTier.pricePerSheet) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-amber-700">
                              {landedTier.minOrderQtyPrice > 0 ? formatPrice(landedTier.minOrderQtyPrice) : '-'}
                            </TableCell>
                          </TableRow>
                        )}
                        {product.averageCost > 0 && (
                          <TableRow className="bg-orange-50">
                            <TableCell className="font-medium uppercase text-orange-700">
                              Odoo Cost Price
                            </TableCell>
                            <TableCell className="text-right text-orange-600">—</TableCell>
                            <TableCell className="text-right text-orange-600">
                              {formatPrice(product.averageCost)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-orange-700">
                              {formatPrice(product.averageCost * (localPricing.minQuantity || 1))}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })()}
                  {canSeeCost && (
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
              <ShoppingCart className="w-5 h-5 text-blue-600" />
              Open Purchase Orders
            </CardTitle>
            <CardDescription>
              {purchaseOrders.orders.length} order line{purchaseOrders.orders.length !== 1 ? 's' : ''} — {formatNumber(purchaseOrders.totalOnOrder)} units remaining
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {purchaseOrders.orders.map((po) => (
                <div key={po.id} className="p-3 rounded-lg border border-blue-100 bg-blue-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-blue-800">{po.order_name}</span>
                    <Badge
                      variant="secondary"
                      className={po.state === 'done' ? 'bg-green-100 text-green-700 text-xs' : 'bg-orange-100 text-orange-700 text-xs'}
                    >
                      {po.state === 'done' ? 'Done' : 'Confirmed'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-gray-500">Ordered</span>
                      <div className="font-semibold text-gray-800">{formatNumber(po.product_qty)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Received</span>
                      <div className="font-semibold text-green-700">{formatNumber(po.qty_received)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Remaining</span>
                      <div className="font-semibold text-orange-700">{formatNumber(po.qty_remaining)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Expected</span>
                      <div className="font-semibold text-gray-800">
                        {po.date_planned ? new Date(po.date_planned).toLocaleDateString() : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
