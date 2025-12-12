import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Save, FileText, RefreshCw, Loader2, Eye, Plus, Upload, X, Image, ChevronDown } from "lucide-react";
import type { PdfCategoryDetails } from "@shared/schema";

interface CategoryFormData {
  categoryKey: string;
  displayName: string;
  logoFile: string;
  featuresMain: string;
  featuresSub: string;
  compatibleWith: string;
  matchesPattern: string;
  sortOrder: number;
  isActive: boolean;
}

const DEFAULT_CATEGORIES: Partial<CategoryFormData>[] = [
  { 
    categoryKey: 'cliq', 
    displayName: 'CliQ Aqueous Medias', 
    featuresMain: 'Photo Quality / Archival Inks Compatible / High Color Gamut', 
    featuresSub: 'Instant Dry / Premium Finish', 
    compatibleWith: 'Compatible with All Aqueous Inkjet Printers',
    matchesPattern: 'Products containing "cliq"',
    sortOrder: 1 
  },
  { 
    categoryKey: 'dtf', 
    displayName: 'DTF Film', 
    featuresMain: 'Direct to Film Transfer / Vibrant Colors', 
    featuresSub: 'Excellent Wash Durability / Soft Hand Feel', 
    compatibleWith: 'Compatible with DTF Printers',
    matchesPattern: 'Products containing "dtf" or "coho"',
    sortOrder: 2 
  },
  { 
    categoryKey: 'graffitiblended', 
    displayName: 'Graffiti Blended Poly', 
    featuresMain: 'Scuff Free / Waterproof / Tear Resistant', 
    featuresSub: 'Blended Polyester Construction / High Durability', 
    compatibleWith: 'Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh',
    matchesPattern: 'Products containing "graffiti blended"',
    sortOrder: 3 
  },
  { 
    categoryKey: 'graffiti', 
    displayName: 'Graffiti Polyester Paper', 
    featuresMain: 'Scuff Free / Waterproof / Tear Resistant', 
    featuresSub: 'High Rigidity / Excellent Alcohol & Stain Resistance', 
    compatibleWith: 'Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh, Fuji Inkjet and others',
    matchesPattern: 'Products containing "graffiti polyester"',
    sortOrder: 4 
  },
  { 
    categoryKey: 'graffitisoft', 
    displayName: 'Graffiti SOFT Poly', 
    featuresMain: 'Scuff Free / Waterproof / Tear Resistant', 
    featuresSub: 'Soft Touch Finish / Flexible', 
    compatibleWith: 'Compatible with All Digital Toner Press',
    matchesPattern: 'Products containing "graffiti soft"',
    sortOrder: 5 
  },
  { 
    categoryKey: 'graffitistick', 
    displayName: 'Graffiti STICK', 
    featuresMain: 'Self-Adhesive / Waterproof / Tear Resistant', 
    featuresSub: 'Easy Application / Removable or Permanent Options', 
    compatibleWith: 'Compatible with All Digital Toner Press',
    matchesPattern: 'Products containing "graffiti stick"',
    sortOrder: 6 
  },
  { 
    categoryKey: 'offset', 
    displayName: 'Offset Printing Plates', 
    featuresMain: 'High Resolution / Consistent Quality', 
    featuresSub: 'Long Run Durability / Sharp Image Reproduction', 
    compatibleWith: 'Compatible with All Offset Printing Presses',
    matchesPattern: 'Products containing "offset"',
    sortOrder: 7 
  },
  { 
    categoryKey: 'rang', 
    displayName: 'Rang Print Canvas', 
    featuresMain: 'Premium Canvas / Archival Quality', 
    featuresSub: 'True Color Reproduction / Artist Grade', 
    compatibleWith: 'Compatible with All Wide Format Inkjet Printers',
    matchesPattern: 'Products containing "rang" or "canvas"',
    sortOrder: 8 
  },
  { 
    categoryKey: 'screenprinting', 
    displayName: 'Screen Printing Positives', 
    featuresMain: 'High Density Black / Sharp Edge Definition', 
    featuresSub: 'Excellent Registration / Dimensionally Stable', 
    compatibleWith: 'Compatible with All Inkjet Printers',
    matchesPattern: 'Products containing "screen printing"',
    sortOrder: 9 
  },
  { 
    categoryKey: 'solvit', 
    displayName: 'Solvit Sign & Display Media', 
    featuresMain: 'Sign & Display Media / Indoor/Outdoor Use', 
    featuresSub: 'UV Resistant / Durable', 
    compatibleWith: 'Compatible with All Eco-Solvent, Latex and UV Printers',
    matchesPattern: 'Products containing "solvit"',
    sortOrder: 10 
  }
];

function LivePreview({ formData, logoPreview }: { formData: CategoryFormData; logoPreview: string | null }) {
  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Live Preview - PDF Header</div>
      <div className="border border-gray-200 p-4 bg-gray-50 rounded">
        <div className="flex items-start gap-4">
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="h-12 object-contain" />
          ) : (
            <div className="h-12 w-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
              No Logo
            </div>
          )}
          <div className="flex-1">
            <div className="text-lg font-bold text-gray-900 mb-1">
              {formData.displayName || 'Product Category Name'}
            </div>
            {formData.featuresMain && (
              <div className="text-sm font-semibold text-gray-800">
                {formData.featuresMain}
              </div>
            )}
            {formData.featuresSub && (
              <div className="text-sm italic text-gray-600">
                {formData.featuresSub}
              </div>
            )}
            {formData.compatibleWith && (
              <div className="text-xs text-gray-500 mt-1">
                {formData.compatibleWith}
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-4 border-t pt-3">
          <div className="text-xs text-gray-500 mb-2">Sample Price Table</div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-100">
                <th className="border p-1 text-left">Size</th>
                <th className="border p-1 text-center">Item Code</th>
                <th className="border p-1 text-center">Min Qty</th>
                <th className="border p-1 text-right">Price/Unit</th>
                <th className="border p-1 text-right">Price/Pack</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="border p-1">12" x 18"</td>
                <td className="border p-1 text-center font-mono">GP-1218-5</td>
                <td className="border p-1 text-center">50</td>
                <td className="border p-1 text-right">$0.00</td>
                <td className="border p-1 text-right">$0.00</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border p-1">13" x 19"</td>
                <td className="border p-1 text-center font-mono">GP-1319-5</td>
                <td className="border p-1 text-center">50</td>
                <td className="border p-1 text-right">$0.00</td>
                <td className="border p-1 text-right">$0.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({ 
  category, 
  onSave, 
  isSaving 
}: { 
  category: CategoryFormData; 
  onSave: (data: CategoryFormData, logoFile?: File) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<CategoryFormData>(category);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setFormData(category);
    setHasChanges(false);
    if (category.logoFile) {
      setLogoPreview(`/attached_assets/${category.logoFile}`);
    } else {
      setLogoPreview(null);
    }
  }, [category]);

  const handleChange = (field: keyof CategoryFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select a PNG or JPG image file.",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Logo file must be under 2MB.",
          variant: "destructive",
        });
        return;
      }
      setSelectedLogoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      setHasChanges(true);
    }
  };

  const handleRemoveLogo = () => {
    setSelectedLogoFile(null);
    setLogoPreview(null);
    handleChange('logoFile', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    onSave(formData, selectedLogoFile || undefined);
    setHasChanges(false);
    setSelectedLogoFile(null);
  };

  return (
    <Card className="mb-4" data-testid={`category-card-${category.categoryKey}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            {formData.displayName || formData.categoryKey}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              data-testid={`button-preview-${formData.categoryKey}`}
            >
              <Eye className="h-4 w-4 mr-1" />
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              Key: {formData.categoryKey}
            </span>
            {hasChanges && (
              <span className="text-xs text-orange-500 font-medium">Unsaved changes</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showPreview && (
          <LivePreview formData={formData} logoPreview={logoPreview} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`displayName-${formData.categoryKey}`}>Display Name</Label>
            <Input
              id={`displayName-${formData.categoryKey}`}
              value={formData.displayName}
              onChange={(e) => handleChange('displayName', e.target.value)}
              placeholder="e.g., Graffiti POLYESTER PAPER"
              data-testid={`input-displayName-${formData.categoryKey}`}
            />
          </div>
          <div>
            <Label htmlFor={`sortOrder-${formData.categoryKey}`}>Sort Order</Label>
            <Input
              id={`sortOrder-${formData.categoryKey}`}
              type="number"
              value={formData.sortOrder}
              onChange={(e) => handleChange('sortOrder', parseInt(e.target.value) || 0)}
              data-testid={`input-sortOrder-${formData.categoryKey}`}
            />
          </div>
        </div>

        <div>
          <Label>Logo Image (PNG)</Label>
          <div className="flex items-center gap-3 mt-1">
            {logoPreview ? (
              <div className="relative">
                <img src={logoPreview} alt="Logo preview" className="h-12 object-contain border rounded p-1" />
                <button
                  onClick={handleRemoveLogo}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                  data-testid={`button-remove-logo-${formData.categoryKey}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="h-12 w-24 bg-gray-100 border border-dashed border-gray-300 rounded flex items-center justify-center">
                <Image className="h-5 w-5 text-gray-400" />
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoSelect}
              className="hidden"
              data-testid={`input-logo-${formData.categoryKey}`}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-testid={`button-upload-logo-${formData.categoryKey}`}
            >
              <Upload className="h-4 w-4 mr-1" />
              {logoPreview ? 'Change' : 'Upload'} Logo
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">PNG or JPG, max 2MB. Recommended: 200x50px</p>
        </div>

        <div>
          <Label htmlFor={`featuresMain-${formData.categoryKey}`}>
            Main Features (Bold in PDF)
          </Label>
          <Input
            id={`featuresMain-${formData.categoryKey}`}
            value={formData.featuresMain}
            onChange={(e) => handleChange('featuresMain', e.target.value)}
            placeholder="e.g., Scuff Free / Waterproof / Tear Resistant"
            data-testid={`input-featuresMain-${formData.categoryKey}`}
          />
          <p className="text-xs text-gray-500 mt-1">Separate features with " / "</p>
        </div>

        <div>
          <Label htmlFor={`featuresSub-${formData.categoryKey}`}>
            Sub-Features (Italic in PDF)
          </Label>
          <Input
            id={`featuresSub-${formData.categoryKey}`}
            value={formData.featuresSub}
            onChange={(e) => handleChange('featuresSub', e.target.value)}
            placeholder="e.g., High Rigidity / Excellent Alcohol & Stain Resistance"
            data-testid={`input-featuresSub-${formData.categoryKey}`}
          />
        </div>

        <div>
          <Label htmlFor={`compatibleWith-${formData.categoryKey}`}>
            Compatibility Text
          </Label>
          <Textarea
            id={`compatibleWith-${formData.categoryKey}`}
            value={formData.compatibleWith}
            onChange={(e) => handleChange('compatibleWith', e.target.value)}
            placeholder="e.g., Compatible with All Digital Toner Press - HP Indigo, Xerox..."
            rows={2}
            data-testid={`input-compatibleWith-${formData.categoryKey}`}
          />
        </div>

        <div>
          <Label htmlFor={`matchesPattern-${formData.categoryKey}`}>
            Pattern Match Description
          </Label>
          <Input
            id={`matchesPattern-${formData.categoryKey}`}
            value={formData.matchesPattern}
            onChange={(e) => handleChange('matchesPattern', e.target.value)}
            placeholder="e.g., Products containing 'graffiti'"
            data-testid={`input-matchesPattern-${formData.categoryKey}`}
          />
          <p className="text-xs text-gray-500 mt-1">For reference: describes which products match this category</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !hasChanges}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid={`button-save-${formData.categoryKey}`}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PdfCategoryAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<CategoryFormData[]>([]);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>("all");

  const { data: dbCategories, isLoading, refetch } = useQuery<PdfCategoryDetails[]>({
    queryKey: ['/api/pdf-category-details'],
  });

  useEffect(() => {
    if (dbCategories && dbCategories.length > 0) {
      const merged = DEFAULT_CATEGORIES.map(defaultCat => {
        const dbCat = dbCategories.find(d => d.categoryKey === defaultCat.categoryKey);
        if (dbCat) {
          return {
            categoryKey: dbCat.categoryKey,
            displayName: dbCat.displayName || '',
            logoFile: dbCat.logoFile || '',
            featuresMain: dbCat.featuresMain || '',
            featuresSub: dbCat.featuresSub || '',
            compatibleWith: dbCat.compatibleWith || '',
            matchesPattern: dbCat.matchesPattern || '',
            sortOrder: dbCat.sortOrder || 0,
            isActive: dbCat.isActive ?? true,
          };
        }
        return {
          categoryKey: defaultCat.categoryKey || '',
          displayName: defaultCat.displayName || '',
          logoFile: '',
          featuresMain: defaultCat.featuresMain || '',
          featuresSub: defaultCat.featuresSub || '',
          compatibleWith: defaultCat.compatibleWith || '',
          matchesPattern: defaultCat.matchesPattern || '',
          sortOrder: defaultCat.sortOrder || 0,
          isActive: true,
        };
      });
      setCategories(merged);
    } else {
      setCategories(DEFAULT_CATEGORIES.map(cat => ({
        categoryKey: cat.categoryKey || '',
        displayName: cat.displayName || '',
        logoFile: '',
        featuresMain: cat.featuresMain || '',
        featuresSub: cat.featuresSub || '',
        compatibleWith: cat.compatibleWith || '',
        matchesPattern: cat.matchesPattern || '',
        sortOrder: cat.sortOrder || 0,
        isActive: true,
      })));
    }
  }, [dbCategories]);

  const uploadLogoMutation = useMutation({
    mutationFn: async ({ categoryKey, file }: { categoryKey: string; file: File }) => {
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('categoryKey', categoryKey);
      
      const response = await fetch('/api/pdf-category-logo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload logo');
      }
      
      return response.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ data, logoFile }: { data: CategoryFormData; logoFile?: File }) => {
      if (logoFile) {
        const logoResult = await uploadLogoMutation.mutateAsync({ 
          categoryKey: data.categoryKey, 
          file: logoFile 
        });
        data.logoFile = logoResult.filename;
      }
      return await apiRequest('POST', '/api/pdf-category-details', data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-category-details'] });
      toast({
        title: "Category saved",
        description: `${variables.data.displayName} has been updated successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving category",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const seedAllMutation = useMutation({
    mutationFn: async () => {
      for (const cat of DEFAULT_CATEGORIES) {
        const fullCat: CategoryFormData = {
          categoryKey: cat.categoryKey || '',
          displayName: cat.displayName || '',
          logoFile: '',
          featuresMain: cat.featuresMain || '',
          featuresSub: cat.featuresSub || '',
          compatibleWith: cat.compatibleWith || '',
          matchesPattern: cat.matchesPattern || '',
          sortOrder: cat.sortOrder || 0,
          isActive: true,
        };
        await apiRequest('POST', '/api/pdf-category-details', fullCat);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-category-details'] });
      toast({
        title: "Categories seeded",
        description: "All default categories have been added to the database.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error seeding categories",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = (data: CategoryFormData, logoFile?: File) => {
    saveMutation.mutate({ data, logoFile });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <span className="ml-2">Loading category details...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-purple-600" />
            Price List PDF Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Configure headers and features displayed on Price List PDFs for each product category.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {(!dbCategories || dbCategories.length === 0) && (
            <Button 
              onClick={() => seedAllMutation.mutate()}
              disabled={seedAllMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-seed-defaults"
            >
              {seedAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Seed Default Categories
            </Button>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Eye className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">How it works</h3>
            <p className="text-sm text-blue-700 mt-1">
              These settings control the header section displayed at the top of each product category 
              in your Price List PDFs. Click "Show Preview" on any category to see a live preview 
              with sample pricing ($0.00). Changes take effect immediately on new PDF downloads.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <Label htmlFor="category-selector" className="text-sm font-medium mb-2 block">
          Select Product Category
        </Label>
        <Select value={selectedCategoryKey} onValueChange={setSelectedCategoryKey}>
          <SelectTrigger className="w-full md:w-80" data-testid="select-category">
            <SelectValue placeholder="Select a category to edit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.categoryKey} value={cat.categoryKey}>
                {cat.displayName || cat.categoryKey}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {categories
          .filter((category) => selectedCategoryKey === "all" || category.categoryKey === selectedCategoryKey)
          .map((category) => (
          <CategoryEditor
            key={category.categoryKey}
            category={category}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
