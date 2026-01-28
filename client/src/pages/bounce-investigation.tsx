import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import OdooLayout from "@/components/OdooLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Mail, 
  Calendar, 
  User, 
  Building2, 
  ExternalLink, 
  Linkedin, 
  Globe, 
  Bot, 
  Trash2, 
  UserX, 
  CheckCircle,
  ArrowLeft,
  RefreshCw,
  Phone,
  MapPin
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BounceInvestigation {
  bounce: {
    id: number;
    bouncedEmail: string;
    bounceSubject: string | null;
    bounceDate: string;
    bounceReason: string | null;
    matchType: string | null;
    status: string;
  };
  record: {
    type: 'customer' | 'contact' | 'lead';
    id: string | number;
    name: string;
    email: string;
    phone?: string;
    companyName?: string;
    title?: string;
    city?: string;
    state?: string;
    lastContactAt?: string;
    stage?: string;
    source?: string;
  } | null;
  domain: {
    domain: string;
    screenshotUrl: string;
    linkedinSearchUrl: string;
  } | null;
  aiResearch: {
    summary: string;
    domainAnalysis: string;
    bounceAnalysis: string;
    recommendation: 'delete' | 'bad_fit' | 'keep' | 'investigate';
    confidence: number;
    reasons: string[];
  } | null;
}

export default function BounceInvestigation() {
  const { bounceId } = useParams<{ bounceId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<BounceInvestigation>({
    queryKey: ['/api/bounce-investigation', bounceId],
    enabled: !!bounceId,
  });

  const resolveMutation = useMutation({
    mutationFn: async (resolution: 'bad_fit' | 'delete' | 'keep') => {
      return apiRequest(`/api/bounce-investigation/${bounceId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution }),
      });
    },
    onSuccess: (_, resolution) => {
      toast({
        title: resolution === 'delete' ? 'Record Deleted' : resolution === 'bad_fit' ? 'Marked as Bad Fit' : 'Kept Active',
        description: 'The bounced email has been resolved.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bounce-investigation'] });
      setLocation('/spotlight');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const regenerateAIMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/bounce-investigation/${bounceId}/regenerate-ai`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      refetch();
      toast({
        title: 'AI Analysis Regenerated',
        description: 'Fresh insights have been generated.',
      });
    },
  });

  if (isLoading) {
    return (
      <OdooLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </OdooLayout>
    );
  }

  if (error || !data) {
    return (
      <OdooLayout>
        <div className="p-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                <span>Failed to load bounce investigation data</span>
              </div>
              <Button variant="outline" className="mt-4" onClick={() => setLocation('/spotlight')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to SPOTLIGHT
              </Button>
            </CardContent>
          </Card>
        </div>
      </OdooLayout>
    );
  }

  const { bounce, record, domain, aiResearch } = data;

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'delete': return 'bg-red-100 text-red-800 border-red-200';
      case 'bad_fit': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'keep': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <OdooLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation('/spotlight')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to SPOTLIGHT
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bounce Investigation</h1>
              <p className="text-gray-500">Research this contact before making a decision</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-white/80 backdrop-blur border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                Bounced Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="font-medium break-all">{bounce.bouncedEmail}</span>
              </div>
              {bounce.bounceSubject && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Original Subject</p>
                  <p className="text-sm">{bounce.bounceSubject}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>Bounced {new Date(bounce.bounceDate).toLocaleDateString()}</span>
              </div>
              {bounce.bounceReason && (
                <div className="bg-red-50 p-3 rounded-lg text-sm text-red-700">
                  {bounce.bounceReason}
                </div>
              )}
              <Badge variant="outline" className="capitalize">
                {bounce.matchType || 'Unknown'} Record
              </Badge>
            </CardContent>
          </Card>

          {record && (
            <Card className="bg-white/80 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  {record.type === 'lead' ? (
                    <User className="h-5 w-5 text-purple-600" />
                  ) : (
                    <Building2 className="h-5 w-5 text-blue-600" />
                  )}
                  {record.type === 'lead' ? 'Lead' : 'Contact'} Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-semibold text-lg">{record.name}</p>
                  {record.title && <p className="text-sm text-gray-500">{record.title}</p>}
                </div>
                {record.companyName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <span>{record.companyName}</span>
                  </div>
                )}
                {record.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{record.phone}</span>
                  </div>
                )}
                {(record.city || record.state) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{[record.city, record.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {record.stage && (
                  <Badge variant="outline" className="capitalize">{record.stage}</Badge>
                )}
                {record.source && (
                  <p className="text-xs text-gray-500">Source: {record.source}</p>
                )}
                {record.lastContactAt && (
                  <p className="text-xs text-gray-500">
                    Last Contact: {new Date(record.lastContactAt).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {domain && (
            <Card className="bg-white/80 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-green-600" />
                  Domain Research
                </CardTitle>
                <CardDescription>{domain.domain}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                  <a 
                    href={`https://${domain.domain}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:underline text-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Visit Website
                  </a>
                  <a 
                    href={domain.linkedinSearchUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:underline text-sm"
                  >
                    <Linkedin className="h-4 w-4" />
                    Search on LinkedIn
                  </a>
                </div>
                {domain.screenshotUrl && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">Website Preview</p>
                    <div className="border rounded-lg overflow-hidden bg-gray-100">
                      <img 
                        src={domain.screenshotUrl} 
                        alt={`Screenshot of ${domain.domain}`}
                        className="w-full h-auto"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="hidden p-4 text-center text-gray-500 text-sm">
                        Website preview unavailable
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {aiResearch && (
          <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-purple-600" />
                  AI Research Notes
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={getRecommendationColor(aiResearch.recommendation)}>
                    Recommendation: {aiResearch.recommendation.replace('_', ' ').toUpperCase()}
                    <span className="ml-1 opacity-75">({Math.round(aiResearch.confidence * 100)}%)</span>
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => regenerateAIMutation.mutate()}
                    disabled={regenerateAIMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${regenerateAIMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Summary</h4>
                <p className="text-gray-600">{aiResearch.summary}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/60 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Domain Analysis</h4>
                  <p className="text-sm text-gray-600">{aiResearch.domainAnalysis}</p>
                </div>
                <div className="bg-white/60 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Bounce Analysis</h4>
                  <p className="text-sm text-gray-600">{aiResearch.bounceAnalysis}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Key Findings</h4>
                <ul className="space-y-2">
                  {aiResearch.reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-purple-600 mt-1">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Take Action</CardTitle>
            <CardDescription>
              Based on your research, what would you like to do with this {record?.type || 'record'}?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => resolveMutation.mutate('bad_fit')}
                disabled={resolveMutation.isPending}
              >
                <UserX className="h-4 w-4 mr-2" />
                Mark as Bad Fit
              </Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => resolveMutation.mutate('delete')}
                disabled={resolveMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete This Record
              </Button>
              <Button
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => resolveMutation.mutate('keep')}
                disabled={resolveMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Keep Active
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Bad Fit will stop outreach but keep the record for reference. Delete will permanently remove the record.
            </p>
          </CardContent>
        </Card>
      </div>
    </OdooLayout>
  );
}
