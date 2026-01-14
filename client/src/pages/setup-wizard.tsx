import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { 
  ArrowLeft, CheckCircle2, Circle, AlertTriangle, ChevronRight, 
  Settings, Layers, Tag, Clock, Bell, MessageSquare, ShoppingBag,
  ArrowRight, RefreshCw, ExternalLink, ChevronDown
} from "lucide-react";

type SetupStep = {
  id: string;
  name: string;
  description: string;
  isComplete: boolean;
  current: number;
  target: number;
  percentComplete: number;
  whatBreaks: string;
  configTab: string;
};

type SetupStatus = {
  steps: SetupStep[];
  completedSteps: number;
  totalSteps: number;
  overallPercent: number;
  isFullyConfigured: boolean;
};

type SkuAnalysis = {
  totalSkus: number;
  fromVariantMappings: number;
  fromUnmappedOrders: number;
  skuPrefixes: Array<{
    prefix: string;
    count: number;
    sampleSkus: string[];
    sampleTitles: string[];
    suggestedRule: string;
    alreadyMapped: boolean;
  }>;
  existingCategories: Array<{ id: number; code: string; label: string }>;
  existingMappingsCount: number;
  instructions: string;
};

const stepIcons: Record<string, typeof Settings> = {
  'machine-types': Settings,
  'category-groups': Layers,
  'categories': Tag,
  'sku-mappings': ShoppingBag,
  'timers': Clock,
  'nudges': Bell,
  'scripts': MessageSquare,
};

export default function SetupWizard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [showSkuAnalysis, setShowSkuAnalysis] = useState(false);

  const { data: setupStatus, isLoading, refetch } = useQuery<SetupStatus>({
    queryKey: ["/api/admin/setup-status"],
  });

  const analyzeSkusMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/import-sku-mappings-from-shopify");
    },
    onSuccess: (data: SkuAnalysis) => {
      setShowSkuAnalysis(true);
      toast({
        title: "SKU Analysis Complete",
        description: `Found ${data.totalSkus} SKUs with ${data.skuPrefixes.length} unique prefixes.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Could not analyze Shopify SKUs",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = setupStatus || { steps: [], completedSteps: 0, totalSteps: 7, overallPercent: 0, isFullyConfigured: false };

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/config">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Setup Wizard</h1>
          <p className="text-muted-foreground">Configure your CRM step by step</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Overall Progress</CardTitle>
              <CardDescription>
                {status.completedSteps} of {status.totalSteps} steps complete
              </CardDescription>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold">{status.overallPercent}%</span>
              {status.isFullyConfigured && (
                <Badge className="ml-2 bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={status.overallPercent} className="h-3" />
        </CardContent>
      </Card>

      {!status.isFullyConfigured && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Setup Incomplete</AlertTitle>
          <AlertDescription className="text-amber-700">
            Complete all steps below to ensure your CRM works correctly. Skipped steps will cause features to malfunction.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {status.steps.map((step, index) => {
          const StepIcon = stepIcons[step.id] || Settings;
          const isExpanded = expandedStep === step.id;
          
          return (
            <Card 
              key={step.id}
              className={`transition-all ${step.isComplete ? 'border-green-200 bg-green-50/30' : 'border-amber-200'}`}
            >
              <Collapsible open={isExpanded} onOpenChange={() => setExpandedStep(isExpanded ? null : step.id)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                        step.isComplete ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {step.isComplete ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <span className="font-semibold">{index + 1}</span>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <StepIcon className="h-4 w-4 text-muted-foreground" />
                          <CardTitle className="text-base">{step.name}</CardTitle>
                        </div>
                        <CardDescription className="mt-1">{step.description}</CardDescription>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {step.current} / {step.target}
                          </div>
                          <Progress value={step.percentComplete} className="h-2 w-24" />
                        </div>
                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4">
                    <div className="ml-14 space-y-4">
                      {!step.isComplete && (
                        <Alert variant="destructive" className="bg-red-50 border-red-200">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>What breaks if you skip this:</AlertTitle>
                          <AlertDescription>{step.whatBreaks}</AlertDescription>
                        </Alert>
                      )}
                      
                      {step.id === 'sku-mappings' && (
                        <div className="space-y-3">
                          <Button
                            variant="outline"
                            onClick={() => analyzeSkusMutation.mutate()}
                            disabled={analyzeSkusMutation.isPending}
                          >
                            {analyzeSkusMutation.isPending ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <ShoppingBag className="h-4 w-4 mr-2" />
                            )}
                            Analyze Shopify SKUs
                          </Button>
                          
                          {showSkuAnalysis && analyzeSkusMutation.data && (
                            <SkuAnalysisPanel data={analyzeSkusMutation.data as SkuAnalysis} />
                          )}
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <Link href={`/admin-config?tab=${step.configTab}`}>
                          <Button>
                            Configure Now
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </Link>
                        <Button variant="ghost" onClick={() => refetch()}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh Status
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {status.isFullyConfigured && (
        <Card className="mt-6 border-green-200 bg-green-50">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <div>
                <h3 className="text-lg font-semibold text-green-800">Setup Complete!</h3>
                <p className="text-green-700">
                  Your CRM is fully configured. All features will work correctly.
                </p>
              </div>
              <div className="ml-auto">
                <Link href="/admin/config">
                  <Button variant="outline">
                    Go to Admin Config
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SkuAnalysisPanel({ data }: { data: SkuAnalysis }) {
  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Detected SKU Patterns</CardTitle>
        <CardDescription>
          Found {data.totalSkus} SKUs ({data.fromVariantMappings} from mappings, {data.fromUnmappedOrders} from orders)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.skuPrefixes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No common SKU patterns detected.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.skuPrefixes.map((prefix) => (
              <div 
                key={prefix.prefix}
                className={`flex items-center justify-between p-2 rounded ${
                  prefix.alreadyMapped ? 'bg-green-100' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
                      {prefix.suggestedRule}
                    </code>
                    <span className="text-sm text-muted-foreground">
                      ({prefix.count} items)
                    </span>
                    {prefix.alreadyMapped && (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Mapped
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                    Examples: {prefix.sampleSkus.slice(0, 3).join(', ')}
                  </p>
                </div>
                {!prefix.alreadyMapped && (
                  <Link href={`/admin-config?tab=sku-mapping&pattern=${encodeURIComponent(prefix.suggestedRule)}`}>
                    <Button size="sm" variant="outline">
                      Create Mapping
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">{data.instructions}</p>
      </CardContent>
    </Card>
  );
}
