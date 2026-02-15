import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Target, TrendingUp, Package, Volume2, Sparkles, RefreshCw,
  Phone, Mail, ExternalLink, Building2, MapPin, Star,
  ArrowUpRight, Loader2, AlertCircle
} from "lucide-react";

const OPPORTUNITY_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  sample_no_order: { label: 'Samples Sent', icon: Package, color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200' },
  went_quiet: { label: 'Went Quiet', icon: Volume2, color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
  upsell_potential: { label: 'Upsell', icon: TrendingUp, color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
  new_fit: { label: 'Great Fit', icon: Target, color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
  reorder_due: { label: 'Reorder Due', icon: RefreshCw, color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
  machine_match: { label: 'Machine Match', icon: Sparkles, color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
};

function ScoreBadge({ score }: { score: number }) {
  let color = 'bg-gray-100 text-gray-700';
  if (score >= 70) color = 'bg-green-100 text-green-800 border-green-300';
  else if (score >= 50) color = 'bg-amber-100 text-amber-800 border-amber-300';
  else if (score >= 30) color = 'bg-blue-100 text-blue-800 border-blue-300';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      <Star className="w-3 h-3" />
      {score}
    </span>
  );
}

function OpportunityCard({ opp }: { opp: any }) {
  const config = OPPORTUNITY_TYPE_CONFIG[opp.opportunityType] || OPPORTUNITY_TYPE_CONFIG.new_fit;
  const Icon = config.icon;

  const detailLink = opp.customerId
    ? `/odoo-contacts/${opp.customerId}`
    : opp.leadId
    ? `/leads/${opp.leadId}`
    : null;

  return (
    <Card className={`border ${config.bgColor} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${config.bgColor}`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900">
                {opp.entityName || 'Unknown'}
              </div>
              {opp.entityCompany && (
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {opp.entityCompany}
                </div>
              )}
            </div>
          </div>
          <ScoreBadge score={opp.score} />
        </div>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className={`text-xs ${config.color} border-current`}>
            {config.label}
          </Badge>
          {opp.entityProvince && (
            <span className="text-xs text-gray-500 flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {opp.entityCity ? `${opp.entityCity}, ${opp.entityProvince}` : opp.entityProvince}
            </span>
          )}
        </div>

        {opp.signals && opp.signals.length > 0 && (
          <div className="space-y-1 mb-3">
            {opp.signals.slice(0, 3).map((signal: any, i: number) => (
              <div key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5 shrink-0">+{signal.points}</span>
                <span>{signal.detail}</span>
              </div>
            ))}
            {opp.signals.length > 3 && (
              <div className="text-xs text-gray-400">+{opp.signals.length - 3} more signals</div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          {opp.entityPhone && (
            <a href={`tel:${opp.entityPhone}`} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <Phone className="w-3 h-3" /> Call
            </a>
          )}
          {opp.entityEmail && (
            <a href={`mailto:${opp.entityEmail}`} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </a>
          )}
          {detailLink && (
            <Link href={detailLink} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto">
              <ExternalLink className="w-3 h-3" /> View Details
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OpportunitiesPage() {
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  const { data: opportunities = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/opportunities', activeTab],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.set('type', activeTab);
      params.set('limit', '100');
      const res = await fetch(`/api/opportunities?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/opportunities/summary'],
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/opportunities/recalculate');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Scores Updated", description: `Processed ${data.processed} contacts, found ${data.scored} opportunities` });
      queryClient.invalidateQueries({ queryKey: ['/api/opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/opportunities/summary'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to recalculate scores", variant: "destructive" });
    },
  });

  const detectSamplesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/opportunities/detect-samples');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Samples Detected", description: `Found ${data.detected} new sample shipments` });
      queryClient.invalidateQueries({ queryKey: ['/api/opportunities'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to detect samples", variant: "destructive" });
    },
  });

  const typeFilter = activeTab === 'all' ? null : activeTab;
  const filteredOpps = typeFilter
    ? opportunities.filter((o: any) => o.opportunityType === typeFilter)
    : opportunities;

  return (
    <div className="min-h-screen bg-[#FDFBF7] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Target className="w-6 h-6 text-amber-500" />
              Opportunities
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Prospects worth pursuing — scored and ranked by fit
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectSamplesMutation.mutate()}
              disabled={detectSamplesMutation.isPending}
            >
              {detectSamplesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Package className="w-4 h-4 mr-1" />}
              Detect Samples
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
            >
              {recalculateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Recalculate Scores
            </Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-600">{summary.totalActive}</div>
                <div className="text-xs text-gray-500">Active Opportunities</div>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{summary.topScorers}</div>
                <div className="text-xs text-gray-500">High Score (60+)</div>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{summary.avgScore}</div>
                <div className="text-xs text-gray-500">Avg Score</div>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {Object.values(summary.byType || {}).reduce((a: number, b: any) => a + Number(b), 0) > 0
                    ? Object.keys(summary.byType || {}).length
                    : 0}
                </div>
                <div className="text-xs text-gray-500">Opportunity Types</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white/80 border">
            <TabsTrigger value="all">All</TabsTrigger>
            {Object.entries(OPPORTUNITY_TYPE_CONFIG).map(([key, config]) => {
              const count = summary?.byType?.[key] || 0;
              return (
                <TabsTrigger key={key} value={key} className="flex items-center gap-1">
                  <config.icon className="w-3 h-3" />
                  {config.label}
                  {count > 0 && (
                    <span className="text-[10px] bg-gray-200 rounded-full px-1.5">{count}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Loading opportunities...</span>
              </div>
            ) : filteredOpps.length === 0 ? (
              <Card className="bg-white/80">
                <CardContent className="p-8 text-center">
                  <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-700 mb-1">No Opportunities Found</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Click "Recalculate Scores" to scan your contacts and detect opportunities.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => recalculateMutation.mutate()}
                    disabled={recalculateMutation.isPending}
                  >
                    {recalculateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                    Scan Now
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredOpps.map((opp: any) => (
                  <OpportunityCard key={opp.id} opp={opp} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
