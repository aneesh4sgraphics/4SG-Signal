import { useState } from "react";
import { Printer, RotateCcw, Tag, Save, Trash2, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";
import type { ProductLabel } from "@shared/schema";

type LabelFormat = "thermal4x3" | "avery6up";
type PalletLabelFormat = "thermal4x6" | "thermal4x8";

interface ProductLabelData {
  productName: string;
  sku: string;
  description: string;
  price: string;
  barcode: string;
  labelFormat: LabelFormat;
  copies: number;
  isSamplePack: boolean;
  websiteUrl: string;
  printTypes: string[];
  variantSize: string;
}

interface PalletLabelData {
  productName: string;
  productDetail: string;
  itemCode: string;
  batchCode: string;
  quantityInBoxes: string;
  totalSheets: string;
  labelFormat: PalletLabelFormat;
  copies: number;
  textScale: number;
}

const PRINT_TYPES = [
  "Dry Toner",
  "HP Indigo",
  "Inkjet UV",
  "EcoSol",
  "UV - Wide Format",
  "Latex Inks",
  "Aqueous Inks",
  "Offset"
];

const defaultLabel: ProductLabelData = {
  productName: "",
  sku: "",
  description: "",
  price: "",
  barcode: "",
  labelFormat: "thermal4x3",
  copies: 1,
  isSamplePack: false,
  websiteUrl: "",
  printTypes: [],
  variantSize: ""
};

const defaultPalletLabel: PalletLabelData = {
  productName: "",
  productDetail: "",
  itemCode: "",
  batchCode: "",
  quantityInBoxes: "",
  totalSheets: "",
  labelFormat: "thermal4x6",
  copies: 1,
  textScale: 100
};

const labelFormatConfig: Record<LabelFormat, { width: string; height: string; name: string }> = {
  "thermal4x3": { width: "4in", height: "3in", name: "4\" x 3\" Thermal" },
  "avery6up": { width: "4.25in", height: "5.5in", name: "Avery 4-up" }
};

const palletFormatConfig: Record<PalletLabelFormat, { width: string; height: string; name: string }> = {
  "thermal4x6": { width: "4in", height: "6in", name: "4\" x 6\" Thermal" },
  "thermal4x8": { width: "4in", height: "8in", name: "4\" x 8\" Thermal" }
};

export default function ProductLabels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"product" | "pallet">("product");
  const [labelData, setLabelData] = useState<ProductLabelData>(defaultLabel);
  const [palletData, setPalletData] = useState<PalletLabelData>(defaultPalletLabel);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: savedLabels = [] } = useQuery<ProductLabel[]>({
    queryKey: ["/api/product-labels"],
  });

  const { data: notionProducts = [], isError: notionError } = useQuery<any[]>({
    queryKey: ["/api/notion-products/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const response = await apiRequest("GET", `/api/notion-products/search?q=${encodeURIComponent(searchQuery)}`);
      return response.json();
    },
    enabled: !!searchQuery.trim(),
  });

  const saveLabelMutation = useMutation({
    mutationFn: async (data: Partial<ProductLabelData>) => {
      const response = await apiRequest("POST", "/api/product-labels", {
        productName: data.productName,
        sku: data.sku,
        description: data.description,
        price: data.price,
        barcode: data.barcode,
        websiteUrl: data.websiteUrl,
        isSamplePack: data.isSamplePack,
        printTypes: data.printTypes,
        labelFormat: data.labelFormat,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-labels"] });
      toast({ title: "Label saved successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to save label", variant: "destructive" });
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/product-labels/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-labels"] });
      toast({ title: "Label deleted!" });
    },
    onError: () => {
      toast({ title: "Failed to delete label", variant: "destructive" });
    },
  });

  const handleSave = async () => {
    if (!labelData.productName) {
      toast({ title: "Product name is required", variant: "destructive" });
      return false;
    }
    try {
      await saveLabelMutation.mutateAsync(labelData);
      return true;
    } catch {
      return false;
    }
  };

  const handlePrint = async () => {
    if (activeTab === "product") {
      const saved = await handleSave();
      if (!saved) {
        toast({ title: "Save failed. Print canceled.", variant: "destructive" });
        return;
      }
    }
    window.print();
  };

  const handlePrintOnly = () => {
    window.print();
  };

  const loadFromSaved = (label: ProductLabel) => {
    setLabelData({
      productName: label.productName,
      sku: label.sku || "",
      description: label.description || "",
      price: label.price || "",
      barcode: label.barcode || "",
      websiteUrl: label.websiteUrl || "",
      isSamplePack: label.isSamplePack,
      printTypes: label.printTypes || [],
      labelFormat: (label.labelFormat as LabelFormat) || "thermal4x3",
      copies: 1,
      variantSize: ""
    });
  };

  const loadFromNotionProduct = (product: any) => {
    setLabelData({
      ...labelData,
      productName: product.productName,
      sku: product.sku || "",
      description: product.description || "",
      price: product.price || "",
      barcode: product.barcode || "",
      websiteUrl: product.websiteUrl || "",
      printTypes: product.printTypes || [],
      variantSize: product.variantSize || ""
    });
  };

  const togglePrintType = (type: string) => {
    setLabelData(prev => ({
      ...prev,
      printTypes: prev.printTypes.includes(type)
        ? prev.printTypes.filter(t => t !== type)
        : [...prev.printTypes, type]
    }));
  };

  return (
    <>
      <div className="hidden print:block print:w-full print:h-full">
        {activeTab === "product" ? (
          <PrintLayout data={labelData} />
        ) : (
          <PalletPrintLayout data={palletData} />
        )}
      </div>

      <div className="print:hidden space-y-6">
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t shadow-lg p-4 z-50 flex items-center justify-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => activeTab === "product" ? setLabelData(defaultLabel) : setPalletData(defaultPalletLabel)}
            data-testid="button-reset"
            size="lg"
            className="glass-btn"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          {activeTab === "product" && (
            <Button 
              variant="secondary"
              onClick={handleSave}
              disabled={saveLabelMutation.isPending || !labelData.productName}
              data-testid="button-save"
              size="lg"
              className="glass-btn"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          )}
          <Button 
            onClick={handlePrint}
            disabled={activeTab === "product" ? !labelData.productName : !palletData.productName}
            data-testid="button-print"
            size="lg"
            className="glass-btn-primary"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Labels
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "product" | "pallet")} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="product" className="flex items-center gap-2" data-testid="tab-product-labels">
              <Tag className="h-4 w-4" />
              Product Labels
            </TabsTrigger>
            <TabsTrigger value="pallet" className="flex items-center gap-2" data-testid="tab-pallet-labels">
              <Package className="h-4 w-4" />
              Pallet Labels
            </TabsTrigger>
          </TabsList>

          <TabsContent value="product" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-24">
              <div className="lg:col-span-5 space-y-6">
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Tag className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold">Label Details</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Search Products</Label>
                      <Input
                        placeholder="Search by name, SKU..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        data-testid="input-search"
                      />
                      {searchQuery && notionProducts.length > 0 && (
                        <div className="border rounded-lg max-h-40 overflow-auto">
                          {notionProducts.slice(0, 5).map((product, i) => (
                            <div
                              key={i}
                              className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                              onClick={() => {
                                loadFromNotionProduct(product);
                                setSearchQuery("");
                              }}
                            >
                              <div className="font-medium text-sm">{product.productName}</div>
                              {product.sku && <div className="text-xs text-gray-500">SKU: {product.sku}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                      {searchQuery && searchQuery.length >= 2 && notionProducts.length === 0 && !notionError && (
                        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                          <p className="text-sm text-amber-800 font-medium">No products found</p>
                          <p className="text-xs text-amber-600 mt-1">
                            Make sure your Notion product database is shared with the Replit integration. 
                            In Notion, open your database → click "..." → Connections → Add Replit.
                          </p>
                        </div>
                      )}
                      {notionError && (
                        <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                          <p className="text-sm text-red-800 font-medium">Unable to connect to Notion</p>
                          <p className="text-xs text-red-600 mt-1">
                            Please check that the Notion integration is properly connected.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Label Format</Label>
                      <Select
                        value={labelData.labelFormat}
                        onValueChange={(value) => setLabelData({ ...labelData, labelFormat: value as LabelFormat })}
                      >
                        <SelectTrigger data-testid="select-format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="thermal4x3">4" x 3" Thermal</SelectItem>
                          <SelectItem value="avery6up">Avery 4-up (Letter)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Product Name *</Label>
                      <Input
                        value={labelData.productName}
                        onChange={(e) => setLabelData({ ...labelData, productName: e.target.value })}
                        placeholder="Enter product name..."
                        data-testid="input-product-name"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>SKU</Label>
                        <Input
                          value={labelData.sku}
                          onChange={(e) => setLabelData({ ...labelData, sku: e.target.value })}
                          placeholder="SKU-12345"
                          data-testid="input-sku"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Variant Size</Label>
                        <Input
                          value={labelData.variantSize}
                          onChange={(e) => setLabelData({ ...labelData, variantSize: e.target.value })}
                          placeholder="12x18, Large, etc."
                          data-testid="input-variant-size"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={labelData.description}
                        onChange={(e) => setLabelData({ ...labelData, description: e.target.value })}
                        placeholder="Brief product description..."
                        className="resize-none h-20"
                        data-testid="textarea-description"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Price</Label>
                        <Input
                          value={labelData.price}
                          onChange={(e) => setLabelData({ ...labelData, price: e.target.value })}
                          placeholder="29.99"
                          data-testid="input-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Barcode</Label>
                        <Input
                          value={labelData.barcode}
                          onChange={(e) => setLabelData({ ...labelData, barcode: e.target.value })}
                          placeholder="123456789012"
                          data-testid="input-barcode"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Website URL (for QR code)</Label>
                      <Input
                        value={labelData.websiteUrl}
                        onChange={(e) => setLabelData({ ...labelData, websiteUrl: e.target.value })}
                        placeholder="https://example.com/product"
                        data-testid="input-website-url"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="samplePack"
                        checked={labelData.isSamplePack}
                        onCheckedChange={(checked) => setLabelData({ ...labelData, isSamplePack: !!checked })}
                        data-testid="checkbox-sample-pack"
                      />
                      <Label htmlFor="samplePack" className="cursor-pointer">Sample Pack Label</Label>
                    </div>

                    <div className="space-y-2">
                      <Label>Ink Compatibility</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {PRINT_TYPES.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={type}
                              checked={labelData.printTypes.includes(type)}
                              onCheckedChange={() => togglePrintType(type)}
                              data-testid={`checkbox-print-type-${type.replace(/\s+/g, '-').toLowerCase()}`}
                            />
                            <Label htmlFor={type} className="text-xs cursor-pointer">{type}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Number of Copies</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={labelData.copies}
                        onChange={(e) => setLabelData({ ...labelData, copies: parseInt(e.target.value) || 1 })}
                        data-testid="input-copies"
                      />
                    </div>
                  </div>
                </div>

                {savedLabels.length > 0 && (
                  <div className="glass-card p-6">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-gray-500" />
                      Saved Templates
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-auto">
                      {savedLabels.map((label) => (
                        <div
                          key={label.id}
                          className="flex items-center justify-between p-2 rounded-lg border bg-gray-50 hover:bg-white hover:shadow-sm transition-all group"
                        >
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => loadFromSaved(label)}
                          >
                            <div className="font-medium text-sm">{label.productName}</div>
                            {label.sku && <div className="text-xs text-gray-500">SKU: {label.sku}</div>}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600"
                            onClick={() => deleteLabelMutation.mutate(label.id)}
                            data-testid={`button-delete-${label.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Live Preview</h2>
                  <span className="text-sm text-muted-foreground bg-white px-3 py-1 rounded-full border shadow-sm">
                    {labelFormatConfig[labelData.labelFormat].name}
                  </span>
                </div>
                
                <div className="bg-gray-200/50 p-4 rounded-xl border-2 border-dashed border-gray-300 flex items-start justify-center min-h-[400px] overflow-auto">
                  <div className="bg-white shadow-2xl" style={{ transform: labelData.labelFormat === 'avery6up' ? 'scale(0.5)' : 'scale(0.9)', transformOrigin: 'top center' }}>
                    {labelData.labelFormat === 'avery6up' ? (
                      <AverySheetPreview data={labelData} />
                    ) : (
                      <ProductLabelPreview data={labelData} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pallet" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-24">
              <div className="lg:col-span-5 space-y-6">
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="h-5 w-5 text-orange-600" />
                    <h3 className="text-lg font-semibold">Pallet Label Details</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Label Size</Label>
                      <Select
                        value={palletData.labelFormat}
                        onValueChange={(value) => setPalletData({ ...palletData, labelFormat: value as PalletLabelFormat })}
                      >
                        <SelectTrigger data-testid="select-pallet-format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="thermal4x6">4" x 6" Thermal</SelectItem>
                          <SelectItem value="thermal4x8">4" x 8" Thermal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Product Name *</Label>
                      <Input
                        value={palletData.productName}
                        onChange={(e) => setPalletData({ ...palletData, productName: e.target.value })}
                        placeholder="Enter product name..."
                        data-testid="input-pallet-product-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Product Detail</Label>
                      <Input
                        value={palletData.productDetail}
                        onChange={(e) => setPalletData({ ...palletData, productDetail: e.target.value })}
                        placeholder="Size, color, weight, etc."
                        data-testid="input-pallet-product-detail"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Item Code / SKU</Label>
                        <Input
                          value={palletData.itemCode}
                          onChange={(e) => setPalletData({ ...palletData, itemCode: e.target.value })}
                          placeholder="SKU-12345"
                          data-testid="input-pallet-item-code"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Batch Code</Label>
                        <Input
                          value={palletData.batchCode}
                          onChange={(e) => setPalletData({ ...palletData, batchCode: e.target.value })}
                          placeholder="BATCH-001"
                          data-testid="input-pallet-batch-code"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Quantity in Boxes</Label>
                        <Input
                          value={palletData.quantityInBoxes}
                          onChange={(e) => setPalletData({ ...palletData, quantityInBoxes: e.target.value })}
                          placeholder="24"
                          data-testid="input-pallet-qty-boxes"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Total in Sheets</Label>
                        <Input
                          value={palletData.totalSheets}
                          onChange={(e) => setPalletData({ ...palletData, totalSheets: e.target.value })}
                          placeholder="12,000"
                          data-testid="input-pallet-total-sheets"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Number of Copies</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={palletData.copies}
                        onChange={(e) => setPalletData({ ...palletData, copies: parseInt(e.target.value) || 1 })}
                        data-testid="input-pallet-copies"
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <Label>Text Size</Label>
                        <span className="text-sm font-medium bg-gray-100 px-2 py-0.5 rounded">{palletData.textScale}%</span>
                      </div>
                      <Slider
                        value={[palletData.textScale]}
                        onValueChange={(value) => setPalletData({ ...palletData, textScale: value[0] })}
                        min={50}
                        max={150}
                        step={5}
                        data-testid="slider-text-scale"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Smaller</span>
                        <span>Larger</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Live Preview</h2>
                  <span className="text-sm text-muted-foreground bg-white px-3 py-1 rounded-full border shadow-sm">
                    {palletFormatConfig[palletData.labelFormat].name}
                  </span>
                </div>
                
                <div className="bg-gray-200/50 p-4 rounded-xl border-2 border-dashed border-gray-300 flex items-start justify-center min-h-[500px] overflow-auto">
                  <div className="bg-white shadow-2xl" style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                    <PalletLabelPreview data={palletData} />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function ProductLabelPreview({ data }: { data: ProductLabelData }) {
  const config = labelFormatConfig[data.labelFormat];
  const isAvery = data.labelFormat === "avery6up";
  
  if (data.isSamplePack) {
    return (
      <div 
        className="bg-white border-2 border-black flex flex-col justify-between"
        style={{ width: config.width, height: config.height, boxSizing: 'border-box' }}
      >
        <div className="p-2 flex-1 flex flex-col justify-between">
          <div>
            <div className={`font-bold uppercase ${isAvery ? 'text-sm' : 'text-base'}`} style={{ lineHeight: '1.2' }}>
              {data.productName || "PRODUCT NAME"}
            </div>
            {data.sku && <div className={`text-gray-600 ${isAvery ? 'text-[8px]' : 'text-xs'}`}>SKU: {data.sku}</div>}
            {data.variantSize && <div className={`text-gray-600 ${isAvery ? 'text-[8px]' : 'text-xs'}`}>Size: {data.variantSize}</div>}
            {data.description && (
              <div className={`text-gray-500 mt-1 line-clamp-2 ${isAvery ? 'text-[8px]' : 'text-xs'}`}>{data.description}</div>
            )}
            {data.printTypes.length > 0 && (
              <div className={`text-gray-600 mt-1 ${isAvery ? 'text-[7px]' : 'text-[8px]'}`}>
                <span className="font-bold">Ink Compatibility:</span> {data.printTypes.join(", ")}
              </div>
            )}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="flex flex-col">
              {data.price && <div className={`font-bold ${isAvery ? 'text-base' : 'text-lg'}`}>${data.price}</div>}
              {data.price && <div className="text-[6px] text-gray-500">Discount not included</div>}
              {data.barcode && <Barcode value={data.barcode} width={isAvery ? 0.8 : 1} height={isAvery ? 18 : 22} fontSize={isAvery ? 6 : 7} margin={0} />}
            </div>
            {data.websiteUrl && (
              <div className="flex flex-col items-center">
                <div className="text-[6px] font-bold text-gray-600 mb-0.5">SCAN TO BUY</div>
                <QRCodeSVG value={data.websiteUrl} size={isAvery ? 28 : 35} />
              </div>
            )}
          </div>
        </div>
        <div className="bg-black text-white flex items-center justify-center" style={{ height: '0.25in', width: '100%' }}>
          <div className="font-black text-xs tracking-wide">SAMPLE PACK</div>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="bg-white border-2 border-black p-2 flex flex-col justify-between"
      style={{ width: config.width, height: config.height, boxSizing: 'border-box' }}
    >
      <div>
        <div className={`font-bold uppercase ${isAvery ? 'text-sm' : 'text-base'}`} style={{ lineHeight: '1.2' }}>
          {data.productName || "PRODUCT NAME"}
        </div>
        {data.sku && <div className={`text-gray-600 ${isAvery ? 'text-[8px]' : 'text-xs'}`}>SKU: {data.sku}</div>}
        {data.variantSize && <div className={`text-gray-600 ${isAvery ? 'text-[8px]' : 'text-xs'}`}>Size: {data.variantSize}</div>}
        {data.description && (
          <div className={`text-gray-500 mt-1 line-clamp-2 ${isAvery ? 'text-[8px]' : 'text-xs'}`}>{data.description}</div>
        )}
        {data.printTypes.length > 0 && (
          <div className={`text-gray-600 mt-1 ${isAvery ? 'text-[7px]' : 'text-[8px]'}`}>
            <span className="font-bold">Ink Compatibility:</span> {data.printTypes.join(", ")}
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          {data.price && <div className={`font-bold ${isAvery ? 'text-base' : 'text-lg'}`}>${data.price}</div>}
          {data.price && <div className="text-[6px] text-gray-500">Discount not included</div>}
          {data.barcode ? (
            <Barcode value={data.barcode} width={isAvery ? 0.8 : 1} height={isAvery ? 20 : 25} fontSize={isAvery ? 6 : 8} margin={0} />
          ) : (
            <div className="text-xs text-gray-400">No barcode</div>
          )}
        </div>
        {data.websiteUrl && (
          <div className="flex flex-col items-center">
            <div className="text-[6px] font-bold text-gray-600 mb-0.5">SCAN TO BUY</div>
            <QRCodeSVG value={data.websiteUrl} size={isAvery ? 32 : 40} />
          </div>
        )}
      </div>
    </div>
  );
}

function PalletLabelPreview({ data }: { data: PalletLabelData }) {
  const config = palletFormatConfig[data.labelFormat];
  const is4x8 = data.labelFormat === "thermal4x8";
  const scale = (data.textScale || 100) / 100;
  
  const baseSizes = is4x8 
    ? { line1: 36, line2: 24, line3: 20, line4: 16, line5: 18 }
    : { line1: 30, line2: 20, line3: 18, line4: 14, line5: 16 };
  
  return (
    <div 
      className="bg-white p-4 flex flex-col justify-between"
      style={{ width: config.width, height: config.height, boxSizing: 'border-box' }}
    >
      <div className="space-y-2 text-center">
        <div 
          className="font-black uppercase leading-tight"
          style={{ fontSize: `${baseSizes.line1 * scale}px` }}
        >
          {data.productName || "PRODUCT NAME"}
        </div>
        
        <div 
          className="font-semibold truncate"
          style={{ fontSize: `${baseSizes.line2 * scale}px` }}
        >
          {data.productDetail || " "}
        </div>
        
        <div 
          className="font-mono font-bold"
          style={{ fontSize: `${baseSizes.line3 * scale}px` }}
        >
          {data.itemCode || "ITEM-CODE"}
        </div>
        
        {data.batchCode && (
          <div 
            className="font-medium"
            style={{ fontSize: `${baseSizes.line4 * scale}px` }}
          >
            Batch: {data.batchCode}
          </div>
        )}
        
        <div 
          className="flex justify-center gap-6"
          style={{ fontSize: `${baseSizes.line5 * scale}px` }}
        >
          <span><span className="font-semibold">Boxes:</span> {data.quantityInBoxes || "—"}</span>
          <span><span className="font-semibold">Sheets:</span> {data.totalSheets || "—"}</span>
        </div>
      </div>
      
      <div className="flex justify-center pt-2">
        {data.itemCode ? (
          <QRCodeSVG 
            value={data.itemCode} 
            size={is4x8 ? 140 : 100} 
            level="M"
          />
        ) : (
          <div className={`border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 ${is4x8 ? 'w-[140px] h-[140px]' : 'w-[100px] h-[100px]'}`}>
            QR Code
          </div>
        )}
      </div>
    </div>
  );
}

function AverySheetPreview({ data }: { data: ProductLabelData }) {
  return (
    <div className="bg-white border border-gray-300" style={{ width: '8.5in', height: '11in', boxSizing: 'border-box' }}>
      <div className="grid grid-cols-2 h-full" style={{ gridTemplateRows: 'repeat(2, 1fr)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            <ProductLabelPreview data={data} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintLayout({ data }: { data: ProductLabelData }) {
  const isAvery = data.labelFormat === 'avery6up';
  const pageSize = isAvery ? '8.5in 11in' : '4in 3in';
  
  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${pageSize};
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
      {isAvery ? (
        Array.from({ length: Math.ceil(data.copies / 4) }).map((_, i) => (
          <div key={i} className="page-break-after">
            <AverySheetPreview data={data} />
          </div>
        ))
      ) : (
        Array.from({ length: data.copies }).map((_, i) => (
          <div key={i} className="page-break-after">
            <ProductLabelPreview data={data} />
          </div>
        ))
      )}
    </>
  );
}

function PalletPrintLayout({ data }: { data: PalletLabelData }) {
  const config = palletFormatConfig[data.labelFormat];
  
  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${config.width} ${config.height};
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
      {Array.from({ length: data.copies }).map((_, i) => (
        <div key={i} className="page-break-after">
          <PalletLabelPreview data={data} />
        </div>
      ))}
    </>
  );
}
