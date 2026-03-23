import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import OdooLayout from "@/components/OdooLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertTriangle,
  Mail,
  Calendar,
  User,
  Building2,
  ExternalLink,
  Linkedin,
  Globe,
  Trash2,
  UserX,
  CheckCircle,
  ArrowLeft,
  Phone,
  MapPin,
  Pencil,
  Save,
  X,
  UserPlus,
  Sparkles,
  Loader2,
  Check,
  Clock,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OutreachSnapshot {
  emailCount: number;
  lastEmailSubject: string | null;
  swatchBookCount: number;
  pressTestKitCount: number;
  callCount: number;
  quoteCount: number;
  capturedAt: string;
}

interface BounceInvestigation {
  bounce: {
    id: number;
    bouncedEmail: string;
    bounceSubject: string | null;
    bounceDate: string;
    bounceReason: string | null;
    bounceType: string | null;
    matchType: string | null;
    status: string;
    outreachHistorySnapshot: OutreachSnapshot | null;
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
  aiResearch: null;
}

type ActivePath = 'fix_typo' | 'person_left' | 'check_company' | null;

export default function BounceInvestigation() {
  const { bounceId } = useParams<{ bounceId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Three-path resolution state
  const [activePath, setActivePath] = useState<ActivePath>(null);
  const [typoResult, setTypoResult] = useState<{ suggestion: string | null; confidence: number; reasoning: string } | null>(null);
  const [typoLoading, setTypoLoading] = useState(false);
  const [typoCorrected, setTypoCorrected] = useState('');
  const [companyResult, setCompanyResult] = useState<{ verdict: string; explanation: string; evidence?: string[]; confidence?: number; dataNote?: string; websiteUrl?: string; linkedinSearchUrl: string; googleMapsUrl: string } | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [personTitle, setPersonTitle] = useState('');
  const [resolutionDone, setResolutionDone] = useState<{ snapshot: OutreachSnapshot | null } | null>(null);

  const { data, isLoading, error, refetch } = useQuery<BounceInvestigation>({
    queryKey: ['/api/bounce-investigation', bounceId],
    enabled: !!bounceId,
  });

  // Auto-run typo check when page loads and data is ready
  useEffect(() => {
    if (data && !typoResult && !typoLoading && bounceId) {
      setTypoLoading(true);
      apiRequest('POST', `/api/bounce-investigation/${bounceId}/check-typo`, {})
        .then(res => res.json())
        .then((result: { suggestion: string | null; confidence: number; reasoning: string }) => {
          setTypoResult(result);
          if (result.suggestion) setTypoCorrected(result.suggestion);
          else setTypoCorrected(data.bounce.bouncedEmail || '');
        })
        .catch(() => setTypoResult({ suggestion: null, confidence: 0, reasoning: 'Check failed' }))
        .finally(() => setTypoLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleCheckTypo = async () => {
    setActivePath('fix_typo');
    if (typoResult) return;
    setTypoLoading(true);
    try {
      const res = await apiRequest('POST', `/api/bounce-investigation/${bounceId}/check-typo`, {});
      const result = await res.json();
      setTypoResult(result);
      if (result.suggestion) setTypoCorrected(result.suggestion);
      else setTypoCorrected(data?.bounce.bouncedEmail || '');
    } catch {
      setTypoResult({ suggestion: null, confidence: 0, reasoning: 'Check failed' });
    } finally {
      setTypoLoading(false);
    }
  };

  const handleCheckCompany = async () => {
    setActivePath('check_company');
    if (companyResult) return;
    setCompanyLoading(true);
    try {
      const res = await apiRequest('POST', `/api/bounce-investigation/${bounceId}/check-company`, {});
      const result = await res.json();
      setCompanyResult(result);
    } catch {
      setCompanyResult({ verdict: 'uncertain', explanation: 'Check failed — use links below.', linkedinSearchUrl: '', googleMapsUrl: '' });
    } finally {
      setCompanyLoading(false);
    }
  };

  interface FixEmailResponse { success: boolean; odooUpdated: boolean; correctedEmail: string; outreachHistorySnapshot: OutreachSnapshot | null; }
  interface ReplaceContactResponse { success: boolean; outreachHistorySnapshot: OutreachSnapshot | null; }

  const parseSnapshot = (raw: OutreachSnapshot | string | null | undefined): OutreachSnapshot | null => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw) as OutreachSnapshot; } catch { return null; }
  };

  const fixEmailMutation = useMutation({
    mutationFn: async (): Promise<FixEmailResponse> => {
      const res = await apiRequest('POST', `/api/bounce-investigation/${bounceId}/fix-email`, { correctedEmail: typoCorrected });
      const json = await res.json();
      return { ...json, outreachHistorySnapshot: parseSnapshot(json.outreachHistorySnapshot) };
    },
    onSuccess: (result: FixEmailResponse) => {
      setResolutionDone({ snapshot: result.outreachHistorySnapshot });
      toast({ title: 'Email Fixed', description: `Updated to ${typoCorrected}${result.odooUpdated ? ' and synced to Odoo' : ''}` });
      queryClient.invalidateQueries({ queryKey: ['/api/bounce-investigation'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const replaceContactMutation = useMutation({
    mutationFn: async (): Promise<ReplaceContactResponse> => {
      const res = await apiRequest('POST', `/api/bounce-investigation/${bounceId}/replace-contact`, {
        name: personName, email: personEmail, phone: personPhone, title: personTitle,
      });
      const json = await res.json();
      return { ...json, outreachHistorySnapshot: parseSnapshot(json.outreachHistorySnapshot) };
    },
    onSuccess: (result: ReplaceContactResponse) => {
      setResolutionDone({ snapshot: result.outreachHistorySnapshot });
      toast({ title: 'Contact Added', description: `${personName} added to the company` });
      queryClient.invalidateQueries({ queryKey: ['/api/bounce-investigation'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const resolveMutation = useMutation({
    mutationFn: (resolution: 'bad_fit' | 'delete' | 'keep') =>
      apiRequest('POST', `/api/bounce-investigation/${bounceId}/resolve`, { resolution }),
    onSuccess: (_, resolution) => {
      toast({
        title: resolution === 'delete' ? 'Record Deleted' : resolution === 'bad_fit' ? 'Marked as Bad Fit' : 'Kept Active',
        description: 'The bounced email has been resolved.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bounce-investigation'] });
      setLocation('/');
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateRecordMutation = useMutation({
    mutationFn: async () => {
      if (!data?.record) throw new Error('No record');
      const endpoint = data.record.type === 'lead' ? `/api/leads/${data.record.id}` : `/api/customers/${data.record.id}`;
      const res = await apiRequest('PUT', endpoint, { name: editName, email: editEmail });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Record updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/bounce-investigation'] });
      setIsEditing(false);
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: () => {
      if (!data?.record) throw new Error('No record to delete');
      return apiRequest('DELETE', `/api/customers/${data.record.id}?reason=bounced_email`);
    },
    onSuccess: () => {
      toast({ title: 'Contact Deleted', description: 'Contact has been removed from the system and Odoo.' });
      queryClient.invalidateQueries({ queryKey: ['/api/bounce-investigation'] });
      setLocation('/');
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
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
              <Button variant="outline" className="mt-4" onClick={() => setLocation('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to SPOTLIGHT
              </Button>
            </CardContent>
          </Card>
        </div>
      </OdooLayout>
    );
  }

  const { bounce, record, domain } = data;
  const outreachSnap = bounce.outreachHistorySnapshot;

  const verdictColor = companyResult?.verdict === 'open' ? 'text-green-700 bg-green-50 border-green-200' :
    companyResult?.verdict === 'closed' ? 'text-red-700 bg-red-50 border-red-200' :
    'text-amber-700 bg-amber-50 border-amber-200';
  const verdictLabel = companyResult?.verdict === 'open' ? 'Still Open' : companyResult?.verdict === 'closed' ? 'Appears Closed' : 'Uncertain';

  return (
    <OdooLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setLocation('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to SPOTLIGHT
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Bounce Investigation</h1>
              <Badge className="bg-red-600 text-white text-xs font-black tracking-wide">PRIORITY</Badge>
            </div>
            <p className="text-gray-500 text-sm">Choose a resolution path and act — or research in depth first</p>
          </div>
        </div>

        {/* Bounce summary card */}
        <Card className="border-2 border-red-300 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-red-800">Bounced:</span>
                  <span className="font-mono text-red-900 font-medium">{bounce.bouncedEmail}</span>
                  <Badge variant="outline" className="capitalize text-xs">{bounce.matchType || 'unknown'}</Badge>
                  {bounce.bounceType && bounce.bounceType !== 'unknown' && (
                    <Badge variant="outline" className="text-xs capitalize">{bounce.bounceType.replace('_', ' ')}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-red-700">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(bounce.bounceDate).toLocaleDateString()}
                  </span>
                  {bounce.bounceSubject && (
                    <span className="flex items-center gap-1 truncate max-w-xs">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      "{bounce.bounceSubject}"
                    </span>
                  )}
                </div>
                {bounce.bounceReason && (
                  <p className="text-xs text-red-600 mt-1">{bounce.bounceReason}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Previous outreach snapshot */}
        {outreachSnap && (outreachSnap.emailCount > 0 || outreachSnap.swatchBookCount > 0 || outreachSnap.callCount > 0 || outreachSnap.pressTestKitCount > 0 || outreachSnap.quoteCount > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Previous Outreach History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {outreachSnap.emailCount > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-800">{outreachSnap.emailCount}</div>
                    <div className="text-xs text-slate-500">emails sent</div>
                    {outreachSnap.lastEmailSubject && (
                      <div className="text-xs text-slate-400 truncate mt-1">Last: {outreachSnap.lastEmailSubject}</div>
                    )}
                  </div>
                )}
                {outreachSnap.swatchBookCount > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-800">{outreachSnap.swatchBookCount}</div>
                    <div className="text-xs text-slate-500">swatch books</div>
                  </div>
                )}
                {outreachSnap.pressTestKitCount > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-800">{outreachSnap.pressTestKitCount}</div>
                    <div className="text-xs text-slate-500">press test kits</div>
                  </div>
                )}
                {outreachSnap.callCount > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-800">{outreachSnap.callCount}</div>
                    <div className="text-xs text-slate-500">calls logged</div>
                  </div>
                )}
                {outreachSnap.quoteCount > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-800">{outreachSnap.quoteCount}</div>
                    <div className="text-xs text-slate-500">quotes sent</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resolution flow - success state */}
        {resolutionDone && (
          <Card className="border-2 border-emerald-300 bg-emerald-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-emerald-800">Resolved! Ready to restart outreach.</span>
              </div>
              <Button onClick={() => setLocation('/')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Return to SPOTLIGHT
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Three resolution paths */}
        {!resolutionDone && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Resolution Paths</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Path 1: Fix Typo */}
              <Card className={`cursor-pointer transition-all border-2 ${activePath === 'fix_typo' ? 'border-blue-400 shadow-md' : 'border-slate-200 hover:border-blue-200'}`}>
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-sm flex items-center gap-2 cursor-pointer"
                    onClick={handleCheckTypo}
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Pencil className="h-4 w-4 text-blue-600" />
                    </div>
                    Fix Email Typo
                  </CardTitle>
                </CardHeader>
                {activePath === 'fix_typo' && (
                  <CardContent>
                    {typoLoading && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking for typos...
                      </div>
                    )}
                    {typoResult && !typoLoading && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                          <Sparkles className="h-3 w-3" /> AI Analysis
                        </div>
                        {typoResult.suggestion ? (
                          <div className="bg-blue-50 rounded p-2 text-sm">
                            <span className="font-semibold text-blue-800">Suggestion: </span>
                            <span className="font-mono text-blue-900">{typoResult.suggestion}</span>
                            <span className="text-blue-600 ml-1">({Math.round(typoResult.confidence * 100)}%)</span>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-600 italic">No typo detected. {typoResult.reasoning}</p>
                        )}
                        <div className="space-y-2">
                          <Label className="text-xs">Corrected email</Label>
                          <Input
                            type="email"
                            value={typoCorrected}
                            onChange={(e) => setTypoCorrected(e.target.value)}
                            placeholder="corrected@email.com"
                            className="text-sm h-8"
                          />
                        </div>
                        <Button
                          size="sm"
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          onClick={() => fixEmailMutation.mutate()}
                          disabled={fixEmailMutation.isPending || !typoCorrected.trim() || typoCorrected === bounce.bouncedEmail}
                        >
                          {fixEmailMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Fix & Restart Outreach
                        </Button>
                      </div>
                    )}
                    {!typoResult && !typoLoading && (
                      <Button size="sm" variant="outline" onClick={handleCheckTypo} className="w-full">
                        Run AI Check
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Path 2: Person Left */}
              <Card className={`cursor-pointer transition-all border-2 ${activePath === 'person_left' ? 'border-orange-400 shadow-md' : 'border-slate-200 hover:border-orange-200'}`}>
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-sm flex items-center gap-2 cursor-pointer"
                    onClick={() => setActivePath('person_left')}
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <UserPlus className="h-4 w-4 text-orange-600" />
                    </div>
                    Person Left Company
                  </CardTitle>
                </CardHeader>
                {activePath === 'person_left' && (
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600 mb-3">Add the replacement contact to this company.</p>
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Full name *"
                          value={personName}
                          onChange={(e) => setPersonName(e.target.value)}
                          className="text-sm h-8"
                        />
                        <Input
                          type="email"
                          placeholder="Email *"
                          value={personEmail}
                          onChange={(e) => setPersonEmail(e.target.value)}
                          className="text-sm h-8"
                        />
                        <Input
                          type="tel"
                          placeholder="Phone (optional)"
                          value={personPhone}
                          onChange={(e) => setPersonPhone(e.target.value)}
                          className="text-sm h-8"
                        />
                        <Input
                          placeholder="Job title (optional)"
                          value={personTitle}
                          onChange={(e) => setPersonTitle(e.target.value)}
                          className="text-sm h-8"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-orange-600 hover:bg-orange-700"
                        onClick={() => replaceContactMutation.mutate()}
                        disabled={replaceContactMutation.isPending || !personName.trim() || !personEmail.trim()}
                      >
                        {replaceContactMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Add Contact & Resolve
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Path 3: Check Company */}
              <Card className={`cursor-pointer transition-all border-2 ${activePath === 'check_company' ? 'border-purple-400 shadow-md' : 'border-slate-200 hover:border-purple-200'}`}>
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-sm flex items-center gap-2 cursor-pointer"
                    onClick={handleCheckCompany}
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4 w-4 text-purple-600" />
                    </div>
                    Check Company Status
                  </CardTitle>
                </CardHeader>
                {activePath === 'check_company' && (
                  <CardContent>
                    {companyLoading && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Researching company...
                      </div>
                    )}
                    {companyResult && !companyLoading && (
                      <div className="space-y-3">
                        <div className={`rounded-lg p-3 text-sm border ${verdictColor}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-bold">{verdictLabel}</div>
                            {companyResult.confidence !== undefined && (
                              <span className="text-xs opacity-70">{Math.round(companyResult.confidence * 100)}% confidence</span>
                            )}
                          </div>
                          <p className="text-xs">{companyResult.explanation}</p>
                          {companyResult.evidence && companyResult.evidence.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                              {companyResult.evidence.map((e, i) => (
                                <li key={i} className="text-xs opacity-80 flex items-start gap-1"><span className="mt-0.5">•</span><span>{e}</span></li>
                              ))}
                            </ul>
                          )}
                          {companyResult.dataNote && (
                            <p className="mt-2 text-xs italic opacity-60">{companyResult.dataNote}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {companyResult.websiteUrl && (
                            <a href={companyResult.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1.5 text-blue-600 hover:underline">
                              <ExternalLink className="h-3 w-3" /> Visit Website
                            </a>
                          )}
                          <a href={companyResult.linkedinSearchUrl} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1.5 text-blue-600 hover:underline">
                            <Linkedin className="h-3 w-3" /> Search LinkedIn
                          </a>
                          <a href={companyResult.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1.5 text-blue-600 hover:underline">
                            <MapPin className="h-3 w-3" /> Google Maps
                          </a>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-xs text-slate-500 mb-2">After reviewing, take action:</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 border-red-200 text-red-700 hover:bg-red-50 text-xs" onClick={() => setShowDeleteConfirm(true)}>
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => resolveMutation.mutate('bad_fit')}>
                              <UserX className="h-3 w-3 mr-1" /> DNC
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs" onClick={() => resolveMutation.mutate('keep')}>
                              <Check className="h-3 w-3 mr-1" /> Keep
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {!companyResult && !companyLoading && (
                      <Button size="sm" variant="outline" onClick={handleCheckCompany} className="w-full">
                        Run Company Check
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* Record details */}
        {record && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  {record.type === 'lead' ? <User className="h-4 w-4 text-purple-600" /> : <Building2 className="h-4 w-4 text-blue-600" />}
                  {record.type === 'lead' ? 'Lead' : 'Contact'} Details
                </CardTitle>
                {!isEditing && (
                  <Button variant="ghost" size="sm" onClick={() => { setEditName(record.name); setEditEmail(record.email); setIsEditing(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateRecordMutation.mutate()} disabled={updateRecordMutation.isPending}>
                      <Save className="h-4 w-4 mr-1" /> {updateRecordMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-semibold">{record.name}</p>
                  {record.title && <p className="text-sm text-slate-500">{record.title}</p>}
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400" /> {record.email}
                  </div>
                  {record.companyName && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Building2 className="h-4 w-4 text-slate-400" /> {record.companyName}
                    </div>
                  )}
                  {record.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" /> {record.phone}
                    </div>
                  )}
                  {(record.city || record.state) && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 text-slate-400" /> {[record.city, record.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {record.lastContactAt && (
                    <p className="text-xs text-slate-400">Last Contact: {new Date(record.lastContactAt).toLocaleDateString()}</p>
                  )}
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Contact
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Domain research card */}
        {domain && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-green-600" />
                Domain Research
              </CardTitle>
              <CardDescription>{domain.domain}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
                  <ExternalLink className="h-4 w-4" /> Visit Website
                </a>
                <a href={domain.linkedinSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
                  <Linkedin className="h-4 w-4" /> Search on LinkedIn
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Contact
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the record from the system and Odoo. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {data?.record && (
            <div className="py-2">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-semibold">{data.record.name}</p>
                <p className="text-sm text-gray-500">{data.record.email}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteContactMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteContactMutation.mutate()} disabled={deleteContactMutation.isPending}>
              {deleteContactMutation.isPending ? 'Deleting...' : 'Delete Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OdooLayout>
  );
}
