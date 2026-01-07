import { useState, useRef, useEffect } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
  uppercase: boolean;
  quantityLabel: "boxes" | "rolls";
  showSheets: boolean;
  notes: string;
  autoFill: boolean;
  lineSpacing: number;
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
  textScale: 100,
  uppercase: false,
  quantityLabel: "boxes",
  showSheets: true,
  notes: "",
  autoFill: true,
  lineSpacing: 1.5
};

const labelFormatConfig: Record<LabelFormat, { width: string; height: string; name: string }> = {
  "thermal4x3": { width: "4in", height: "3in", name: "4\" x 3\" Thermal" },
  "avery6up": { width: "4.25in", height: "5.5in", name: "Avery 4-up" }
};

const palletFormatConfig: Record<PalletLabelFormat, { width: string; height: string; name: string }> = {
  "thermal4x6": { width: "4in", height: "6in", name: "4\" x 6\" Thermal" },
  "thermal4x8": { width: "4in", height: "8in", name: "4\" x 8\" Thermal" }
};

// Translations for form labels (English/Spanish)
const translations = {
  en: {
    // Product Labels
    searchProducts: "Search Products",
    labelFormat: "Label Format",
    productName: "Product Name",
    sku: "SKU",
    variantSize: "Variant Size",
    description: "Description",
    price: "Price",
    barcode: "Barcode",
    websiteUrl: "Website URL (for QR code)",
    inkCompatibility: "Ink Compatibility",
    numberOfCopies: "Number of Copies",
    samplePackLabel: "Sample Pack Label",
    // Pallet Labels
    labelSize: "Label Size",
    productDetail: "Product Detail",
    itemCode: "Item Code / SKU",
    batchCode: "Batch Code",
    quantity: "Quantity",
    totalInSheets: "Total in Sheets",
    showOnLabel: "Show on label",
    notes: "Notes",
    textSize: "Text Size",
    lineSpacing: "Line Spacing",
    uppercase: "UPPERCASE",
    autoFillSpace: "Auto-fill space",
    boxes: "Boxes",
    rolls: "Rolls",
    livePreview: "Live Preview",
  },
  es: {
    // Product Labels
    searchProducts: "Buscar Productos",
    labelFormat: "Formato de Etiqueta",
    productName: "Nombre del Producto",
    sku: "SKU",
    variantSize: "Tamaño de Variante",
    description: "Descripción",
    price: "Precio",
    barcode: "Código de Barras",
    websiteUrl: "URL del Sitio Web (para código QR)",
    inkCompatibility: "Compatibilidad de Tinta",
    numberOfCopies: "Número de Copias",
    samplePackLabel: "Etiqueta de Paquete de Muestra",
    // Pallet Labels
    labelSize: "Tamaño de Etiqueta",
    productDetail: "Detalle del Producto",
    itemCode: "Código de Artículo / SKU",
    batchCode: "Código de Lote",
    quantity: "Cantidad",
    totalInSheets: "Total en Hojas",
    showOnLabel: "Mostrar en etiqueta",
    notes: "Notas",
    textSize: "Tamaño del Texto",
    lineSpacing: "Espaciado de Línea",
    uppercase: "MAYÚSCULAS",
    autoFillSpace: "Llenar espacio automáticamente",
    boxes: "Cajas",
    rolls: "Rollos",
    livePreview: "Vista Previa",
  }
};

type Language = 'en' | 'es';

export default function ProductLabels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"product" | "pallet">("product");
  const [labelData, setLabelData] = useState<ProductLabelData>(defaultLabel);
  const [palletData, setPalletData] = useState<PalletLabelData>(defaultPalletLabel);
  const [searchQuery, setSearchQuery] = useState("");
  const [itemCodeOpen, setItemCodeOpen] = useState(false);
  const [itemCodeSearch, setItemCodeSearch] = useState("");
  const [language, setLanguage] = useState<Language>('en');
  
  const t = translations[language];

  const { data: savedLabels = [] } = useQuery<ProductLabel[]>({
    queryKey: ["/api/product-labels"],
  });

  const { data: productCodes = [] } = useQuery<{ id: number; itemCode: string; productName: string; productType: string }[]>({
    queryKey: ["/api/quickquotes/products"],
    staleTime: 5 * 60 * 1000,
  });

  const filteredProductCodes = productCodes.filter(p => 
    p.itemCode?.toLowerCase().startsWith(itemCodeSearch.toLowerCase())
  ).slice(0, 20);

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
          <div className="flex items-center justify-between mb-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="product" className="flex items-center gap-2" data-testid="tab-product-labels">
                <Tag className="h-4 w-4" />
                Product Labels
              </TabsTrigger>
              <TabsTrigger value="pallet" className="flex items-center gap-2" data-testid="tab-pallet-labels">
                <Package className="h-4 w-4" />
                Pallet Labels
              </TabsTrigger>
            </TabsList>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="w-32" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                      <Label>{t.searchProducts}</Label>
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
                      <Label>{t.labelFormat}</Label>
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
                      <Label>{t.productName} *</Label>
                      <Input
                        value={labelData.productName}
                        onChange={(e) => setLabelData({ ...labelData, productName: e.target.value })}
                        placeholder="Enter product name..."
                        data-testid="input-product-name"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t.sku}</Label>
                        <Input
                          value={labelData.sku}
                          onChange={(e) => setLabelData({ ...labelData, sku: e.target.value })}
                          placeholder="SKU-12345"
                          data-testid="input-sku"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.variantSize}</Label>
                        <Input
                          value={labelData.variantSize}
                          onChange={(e) => setLabelData({ ...labelData, variantSize: e.target.value })}
                          placeholder="12x18, Large, etc."
                          data-testid="input-variant-size"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t.description}</Label>
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
                        <Label>{t.price}</Label>
                        <Input
                          value={labelData.price}
                          onChange={(e) => setLabelData({ ...labelData, price: e.target.value })}
                          placeholder="29.99"
                          data-testid="input-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.barcode}</Label>
                        <Input
                          value={labelData.barcode}
                          onChange={(e) => setLabelData({ ...labelData, barcode: e.target.value })}
                          placeholder="123456789012"
                          data-testid="input-barcode"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t.websiteUrl}</Label>
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
                      <Label>{t.inkCompatibility}</Label>
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
                      <Label>{t.numberOfCopies}</Label>
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
                  <h2 className="text-xl font-semibold tracking-tight">{t.livePreview}</h2>
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
                      <Label>{t.labelSize}</Label>
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
                      <Label>{t.productName} *</Label>
                      <Input
                        value={palletData.productName}
                        onChange={(e) => setPalletData({ ...palletData, productName: e.target.value })}
                        placeholder="Enter product name..."
                        data-testid="input-pallet-product-name"
                      />
                      <div className="flex items-center space-x-2 pt-1">
                        <Checkbox
                          id="uppercase"
                          checked={palletData.uppercase}
                          onCheckedChange={(checked) => setPalletData({ ...palletData, uppercase: !!checked })}
                          data-testid="checkbox-uppercase"
                        />
                        <Label htmlFor="uppercase" className="text-sm cursor-pointer">Print in ALL CAPS</Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t.productDetail}</Label>
                      <Input
                        value={palletData.productDetail}
                        onChange={(e) => setPalletData({ ...palletData, productDetail: e.target.value })}
                        placeholder="Size, color, weight, etc."
                        data-testid="input-pallet-product-detail"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t.itemCode}</Label>
                        <Popover open={itemCodeOpen} onOpenChange={setItemCodeOpen}>
                          <PopoverTrigger asChild>
                            <div className="relative">
                              <Input
                                value={palletData.itemCode}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPalletData({ ...palletData, itemCode: val });
                                  setItemCodeSearch(val);
                                  if (val.length > 0) setItemCodeOpen(true);
                                }}
                                onFocus={() => {
                                  if (palletData.itemCode.length > 0) {
                                    setItemCodeSearch(palletData.itemCode);
                                    setItemCodeOpen(true);
                                  }
                                }}
                                placeholder="Type to search..."
                                data-testid="input-pallet-item-code"
                              />
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                            <Command>
                              <CommandList>
                                <CommandEmpty>No matching codes found</CommandEmpty>
                                <CommandGroup>
                                  {filteredProductCodes.map((product) => (
                                    <CommandItem
                                      key={product.id}
                                      value={product.itemCode}
                                      onSelect={() => {
                                        setPalletData({ 
                                          ...palletData, 
                                          itemCode: product.itemCode,
                                          productName: palletData.productName || product.productName
                                        });
                                        setItemCodeOpen(false);
                                      }}
                                      data-testid={`item-code-option-${product.id}`}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-mono font-medium">{product.itemCode}</span>
                                        <span className="text-xs text-muted-foreground truncate">{product.productName}</span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>{t.batchCode}</Label>
                        <Input
                          value={palletData.batchCode}
                          onChange={(e) => setPalletData({ ...palletData, batchCode: e.target.value })}
                          placeholder="BATCH-001"
                          data-testid="input-pallet-batch-code"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <Label>{t.quantity}</Label>
                        <Select
                          value={palletData.quantityLabel}
                          onValueChange={(value) => setPalletData({ ...palletData, quantityLabel: value as "boxes" | "rolls" })}
                        >
                          <SelectTrigger className="w-32" data-testid="select-quantity-label">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="boxes">{t.boxes}</SelectItem>
                            <SelectItem value="rolls">{t.rolls}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        value={palletData.quantityInBoxes}
                        onChange={(e) => setPalletData({ ...palletData, quantityInBoxes: e.target.value })}
                        placeholder="24"
                        data-testid="input-pallet-qty-boxes"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>{t.totalInSheets}</Label>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="showSheets"
                            checked={palletData.showSheets}
                            onCheckedChange={(checked) => setPalletData({ ...palletData, showSheets: !!checked })}
                            data-testid="checkbox-show-sheets"
                          />
                          <Label htmlFor="showSheets" className="text-sm cursor-pointer">{t.showOnLabel}</Label>
                        </div>
                      </div>
                      <Input
                        value={palletData.totalSheets}
                        onChange={(e) => setPalletData({ ...palletData, totalSheets: e.target.value })}
                        placeholder="12,000"
                        disabled={!palletData.showSheets}
                        data-testid="input-pallet-total-sheets"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t.notes}</Label>
                      <textarea
                        className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        value={palletData.notes}
                        onChange={(e) => setPalletData({ ...palletData, notes: e.target.value })}
                        placeholder="Any additional notes to print on the label..."
                        data-testid="input-pallet-notes"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t.numberOfCopies}</Label>
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
                        <Label>{t.textSize}</Label>
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

                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id="autoFill"
                        checked={palletData.autoFill}
                        onCheckedChange={(checked) => setPalletData({ ...palletData, autoFill: checked === true })}
                        data-testid="checkbox-auto-fill"
                      />
                      <Label htmlFor="autoFill" className="text-sm cursor-pointer">
                        Auto-Fill (spread content to fill label)
                      </Label>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <Label>{t.lineSpacing}</Label>
                        <span className="text-sm font-medium bg-gray-100 px-2 py-0.5 rounded">{palletData.lineSpacing.toFixed(1)}x</span>
                      </div>
                      <Slider
                        value={[palletData.lineSpacing]}
                        onValueChange={(value) => setPalletData({ ...palletData, lineSpacing: value[0] })}
                        min={0.5}
                        max={3}
                        step={0.1}
                        data-testid="slider-line-spacing"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Compact</span>
                        <span>Spacious</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">{t.livePreview}</h2>
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
              {data.barcode && <Barcode value={data.barcode} width={isAvery ? 1.2 : 1.5} height={isAvery ? 30 : 40} fontSize={isAvery ? 8 : 10} margin={0} />}
            </div>
            {data.websiteUrl && (
              <div className="flex flex-col items-center">
                <div className="text-[6px] font-bold text-gray-600 mb-0.5">SCAN TO BUY</div>
                <QRCodeSVG value={data.websiteUrl} size={isAvery ? 48 : 60} level="M" />
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
            <Barcode value={data.barcode} width={isAvery ? 1.2 : 1.5} height={isAvery ? 35 : 45} fontSize={isAvery ? 9 : 11} margin={0} />
          ) : (
            <div className="text-xs text-gray-400">No barcode</div>
          )}
        </div>
        {data.websiteUrl && (
          <div className="flex flex-col items-center">
            <div className="text-[6px] font-bold text-gray-600 mb-0.5">SCAN TO BUY</div>
            <QRCodeSVG value={data.websiteUrl} size={isAvery ? 55 : 70} level="M" />
          </div>
        )}
      </div>
    </div>
  );
}

function getProductFont(productName: string): { fontFamily: string; fontWeight: number } {
  const name = productName.toLowerCase().trim();
  
  if (name.includes('graffiti')) {
    return { fontFamily: "'Lobster', cursive", fontWeight: 400 };
  }
  if (name.includes('solvit')) {
    return { fontFamily: "'Merienda', cursive", fontWeight: 700 };
  }
  if (name.includes('cliq')) {
    return { fontFamily: "'Century Gothic', 'Trebuchet MS', sans-serif", fontWeight: 700 };
  }
  if (name.includes('rang')) {
    return { fontFamily: "'Fredoka', sans-serif", fontWeight: 700 };
  }
  return { fontFamily: "'Archivo Narrow', 'Arial Narrow', sans-serif", fontWeight: 700 };
}

function PalletLabelPreview({ data }: { data: PalletLabelData }) {
  const config = palletFormatConfig[data.labelFormat];
  const is4x8 = data.labelFormat === "thermal4x8";
  const scale = (data.textScale || 100) / 100;
  const lineSpacing = data.lineSpacing ?? 1.5;
  const autoFill = data.autoFill ?? true;
  
  const baseSizes = is4x8 
    ? { product: 32, detail: 20, code: 18, info: 16, notes: 14 }
    : { product: 26, detail: 16, code: 16, info: 14, notes: 12 };
  
  const productFont = getProductFont(data.productName);
  const quantityLabel = data.quantityLabel === "rolls" ? "Rolls" : "Boxes";
  
  const lineHeight = lineSpacing;
  
  return (
    <div 
      className="bg-white p-4 flex flex-col justify-between"
      style={{ 
        width: config.width, 
        height: config.height, 
        boxSizing: 'border-box'
      }}
    >
      <div 
        className="text-center flex flex-col"
        style={{ 
          flex: autoFill ? 1 : undefined,
          justifyContent: autoFill ? 'space-evenly' : 'flex-start',
          gap: autoFill ? undefined : `${lineSpacing * 0.3}rem`
        }}
      >
        <div 
          style={{ 
            fontSize: `${baseSizes.product * scale}px`,
            fontFamily: productFont.fontFamily,
            fontWeight: productFont.fontWeight,
            textTransform: data.uppercase ? 'uppercase' : 'none',
            lineHeight: lineHeight,
            width: '100%',
            textAlign: 'center',
            wordBreak: 'break-word',
            hyphens: 'auto'
          }}
        >
          {data.productName || "PRODUCT NAME"}
        </div>
        
        {data.productDetail && (
          <div 
            className="font-semibold"
            style={{ fontSize: `${baseSizes.detail * scale}px`, lineHeight: lineHeight }}
          >
            {data.productDetail}
          </div>
        )}
        
        {data.itemCode && (
          <div 
            className="font-mono font-bold"
            style={{ fontSize: `${baseSizes.code * scale}px`, lineHeight: lineHeight }}
          >
            {data.itemCode}
          </div>
        )}
        
        {data.batchCode && (
          <div 
            className="font-medium"
            style={{ fontSize: `${baseSizes.info * scale}px`, lineHeight: lineHeight }}
          >
            Batch: {data.batchCode}
          </div>
        )}
        
        {data.quantityInBoxes && (
          <div 
            className="font-semibold"
            style={{ fontSize: `${baseSizes.info * scale}px`, lineHeight: lineHeight }}
          >
            {quantityLabel}: {data.quantityInBoxes}
          </div>
        )}
        
        {data.showSheets && data.totalSheets && (
          <div 
            className="font-semibold"
            style={{ fontSize: `${baseSizes.info * scale}px`, lineHeight: lineHeight }}
          >
            Sheets: {data.totalSheets}
          </div>
        )}
        
        {data.notes && (
          <div 
            className="pt-2 border-t border-gray-200 text-left whitespace-pre-wrap"
            style={{ fontSize: `${baseSizes.notes * scale}px`, lineHeight: lineHeight }}
          >
            {data.notes}
          </div>
        )}
      </div>
      
      <div className="flex justify-center pt-2">
        {data.itemCode ? (
          <QRCodeSVG 
            value={data.itemCode} 
            size={is4x8 ? 150 : 110} 
            level="M"
          />
        ) : (
          <div className={`border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 ${is4x8 ? 'w-[150px] h-[150px]' : 'w-[110px] h-[110px]'}`}>
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
