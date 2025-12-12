import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Save, FileText, RefreshCw, Loader2, Eye, Plus } from "lucide-react";
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
    categoryKey: 'graffiti', 
    displayName: 'Graffiti POLYESTER PAPER', 
    featuresMain: 'Scuff Free / Waterproof / Tear Resistant', 
    featuresSub: 'High Rigidity / Excellent Alcohol & Stain Resistance', 
    compatibleWith: 'Compatible with All Digital Toner Press - HP Indigo, Xerox, Konica Minolta, Ricoh, Fuji Inkjet and others',
    matchesPattern: 'Products containing "graffiti" (not "graffitistick")',
    sortOrder: 1 
  },
  { 
    categoryKey: 'graffitistick', 
    displayName: 'GraffitiSTICK', 
    featuresMain: 'Self-Adhesive / Waterproof / Tear Resistant', 
    featuresSub: 'Easy Application / Removable or Permanent Options', 
    compatibleWith: 'Compatible with All Digital Toner Press',
    matchesPattern: 'Products containing "graffitistick" or "slickstick"',
    sortOrder: 2 
  },
  { 
    categoryKey: 'cliq', 
    displayName: 'CLIQ Photo Paper', 
    featuresMain: 'Photo Quality / Archival Inks Compatible / High Color Gamut', 
    featuresSub: 'Instant Dry / Premium Finish', 
    compatibleWith: 'Compatible with All Digital Toner Press',
    matchesPattern: 'Products containing "cliq"',
    sortOrder: 3 
  },
  { 
    categoryKey: 'solvit', 
    displayName: 'SolviT Sign & Display Media', 
    featuresMain: 'Sign & Display Media / Indoor/Outdoor Use', 
    featuresSub: 'UV Resistant / Durable', 
    compatibleWith: 'Compatible with All Eco-Solvent, Latex and UV Printers',
    matchesPattern: 'Products containing "solvit"',
    sortOrder: 4 
  },
  { 
    categoryKey: 'rang', 
    displayName: 'Rang Print Canvas', 
    featuresMain: 'Premium Canvas / Archival Quality', 
    featuresSub: 'True Color Reproduction / Artist Grade', 
    compatibleWith: 'Compatible with All Wide Format Inkjet Printers',
    matchesPattern: 'Products containing "rang" or "canvas"',
    sortOrder: 5 
  }
];

function CategoryEditor({ 
  category, 
  onSave, 
  isSaving 
}: { 
  category: CategoryFormData; 
  onSave: (data: CategoryFormData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<CategoryFormData>(category);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setFormData(category);
    setHasChanges(false);
  }, [category]);

  const handleChange = (field: keyof CategoryFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(formData);
    setHasChanges(false);
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

  const saveMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      return await apiRequest('POST', '/api/pdf-category-details', data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-category-details'] });
      toast({
        title: "Category saved",
        description: `${variables.displayName} has been updated successfully.`,
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

  const handleSave = (data: CategoryFormData) => {
    saveMutation.mutate(data);
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
              in your Price List PDFs. The main features appear in bold, sub-features in italic, 
              and compatibility text below. Changes take effect immediately on new PDF downloads.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((category) => (
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
