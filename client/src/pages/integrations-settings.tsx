import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Mail, Calendar, Database, CheckCircle2, XCircle, RefreshCw, 
  ExternalLink, Settings, AlertCircle, ArrowLeft, Plug, Sun, LogOut, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ConnectionStatus {
  odoo: { connected: boolean; error: string | null };
  gmail: { connected: boolean; error: string | null };
  calendar: { connected: boolean; error: string | null };
}

export default function IntegrationsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);

  const { data: status, refetch, isFetching, isLoading } = useQuery<ConnectionStatus>({
    queryKey: ['/api/integrations/status'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Handle return from Gmail OAuth — show toast and strip query params from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailConnected = params.get('gmail_connected');
    const gmailError = params.get('gmail_error');

    // Nothing to process — bail early to avoid unnecessary query invalidation
    if (!gmailConnected && !gmailError) return;

    const email = params.get('email');

    if (gmailConnected === 'true') {
      toast({
        title: 'Gmail connected',
        description: email ? `Connected as ${email}` : 'Your Gmail account is now linked.',
      });
      qc.invalidateQueries({ queryKey: ['/api/integrations/status'] });
      window.history.replaceState({}, '', '/integrations');
    } else if (gmailError) {
      const messages: Record<string, string> = {
        missing_params: 'OAuth response was incomplete. Please try again.',
        invalid_state: 'Security check failed. Please try again.',
        access_denied: 'You declined the Gmail permission request.',
        session_lost: 'Session was lost during Google login. Please try connecting again — this sometimes happens on first attempt.',
      };
      toast({
        title: 'Gmail connection failed',
        description: messages[gmailError] || gmailError,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/integrations');
    }
  }, [qc]);

  const { data: userPrefs } = useQuery<{ spotlightDigestEnabled: boolean }>({
    queryKey: ['/api/users/me/spotlight-digest'],
    staleTime: 60 * 1000,
  });

  const digestMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('PATCH', '/api/users/me/spotlight-digest', { enabled });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/users/me/spotlight-digest'] });
      toast({ title: 'Spotlight digest preference saved.' });
    },
    onError: () => {
      toast({ title: 'Failed to update digest preference.', variant: 'destructive' });
    },
  });

  const handleConnectGmail = async () => {
    setGmailConnecting(true);
    try {
      const res = await apiRequest('GET', '/api/gmail-oauth/connect');
      if (!res.ok) {
        const err = await res.json();
        toast({ title: 'Could not start Gmail connection', description: err.error || 'Please try again.', variant: 'destructive' });
        return;
      }
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch {
      toast({ title: 'Could not start Gmail connection', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setGmailConnecting(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setGmailDisconnecting(true);
    try {
      const res = await apiRequest('DELETE', '/api/gmail-oauth/disconnect');
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ['/api/integrations/status'] });
      toast({ title: 'Gmail disconnected.' });
    } catch {
      toast({ title: 'Failed to disconnect Gmail.', variant: 'destructive' });
    } finally {
      setGmailDisconnecting(false);
    }
  };

  const connectedCount = status 
    ? [status.gmail.connected, status.calendar.connected, status.odoo.connected].filter(Boolean).length 
    : 0;

  const gmailConnected = status?.gmail.connected ?? false;
  const calendarConnected = status?.calendar.connected ?? false;
  const odooConnected = status?.odoo.connected ?? false;

  if (isLoading && !status) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6" />
            Integrations
          </h1>
          <p className="text-muted-foreground">
            Connect external services to unlock all features
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="btn-refresh-status"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Refresh Status
        </Button>
      </div>

      {/* Summary card */}
      <Card className="mb-6" data-testid="card-summary">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connectedCount === 3 ? (
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
              )}
              <div>
                <div className="font-medium">
                  {`${connectedCount} of 3 services connected`}
                  {isFetching && <Loader2 className="inline h-3.5 w-3.5 ml-2 animate-spin text-muted-foreground" />}
                </div>
                <div className="text-sm text-muted-foreground">
                  {connectedCount === 3 
                    ? 'All integrations are active' 
                    : 'Connect more services to unlock features'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant={gmailConnected ? "default" : "secondary"} className="gap-1">
                <Mail className="h-3 w-3" />
                Gmail
              </Badge>
              <Badge variant={calendarConnected ? "default" : "secondary"} className="gap-1">
                <Calendar className="h-3 w-3" />
                Calendar
              </Badge>
              <Badge variant={odooConnected ? "default" : "secondary"} className="gap-1">
                <Database className="h-3 w-3" />
                Odoo
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">

        {/* ── Gmail ── */}
        <Card
          className={cn(gmailConnected && "border-green-200 bg-green-50/30")}
          data-testid="card-integration-gmail"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-red-50">
                  <Mail className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Gmail
                    {gmailConnected ? (
                      <Badge className="bg-green-600 hover:bg-green-700 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Send emails to customers directly from the app</CardDescription>
                </div>
              </div>

              {gmailConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectGmail}
                  disabled={gmailDisconnecting}
                  data-testid="btn-disconnect-gmail"
                >
                  {gmailDisconnecting
                    ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    : <LogOut className="h-4 w-4 mr-1" />}
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleConnectGmail}
                  disabled={gmailConnecting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  data-testid="btn-connect-gmail"
                >
                  {gmailConnecting
                    ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    : <Mail className="h-4 w-4 mr-1" />}
                  Connect Gmail
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {status?.gmail.error && !gmailConnected && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                <strong>Error:</strong> {status.gmail.error}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {['Send emails from Email Studio', 'Drip email campaigns', 'Email tracking (opens & clicks)', 'Appears in your Sent folder'].map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className={cn("h-3.5 w-3.5 flex-shrink-0", gmailConnected ? "text-green-600" : "text-gray-400")} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {gmailConnected ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    <div className="flex items-center gap-2 font-medium mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Gmail is connected
                    </div>
                    <p className="text-xs text-green-700">Emails will be sent from your connected Gmail account and will appear in your Sent folder.</p>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                    <h4 className="font-medium text-red-800 mb-2">How to connect</h4>
                    <ol className="text-red-700 text-xs space-y-1 list-decimal ml-4">
                      <li>Click the <strong>Connect Gmail</strong> button above</li>
                      <li>Sign in with your Google account</li>
                      <li>Authorize the requested permissions</li>
                      <li>You'll be redirected back automatically</li>
                    </ol>
                    <Button
                      size="sm"
                      onClick={handleConnectGmail}
                      disabled={gmailConnecting}
                      className="mt-3 bg-red-600 hover:bg-red-700 text-white w-full"
                      data-testid="btn-connect-gmail-inline"
                    >
                      {gmailConnecting
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Connecting...</>
                        : <><Mail className="h-4 w-4 mr-1" /> Connect Gmail Now</>}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Google Calendar ── */}
        <Card
          className={cn(calendarConnected && "border-green-200 bg-green-50/30")}
          data-testid="card-integration-calendar"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-blue-50">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Google Calendar
                    {calendarConnected ? (
                      <Badge className="bg-green-600 hover:bg-green-700 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Schedule follow-ups and sync customer meetings</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {status?.calendar.error && !calendarConnected && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                <strong>Error:</strong> {status.calendar.error}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {['Schedule follow-up reminders', 'Sync customer meetings', 'View upcoming appointments'].map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className={cn("h-3.5 w-3.5 flex-shrink-0", calendarConnected ? "text-green-600" : "text-gray-400")} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {calendarConnected ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    <div className="flex items-center gap-2 font-medium mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Google Calendar is connected
                    </div>
                    <p className="text-xs text-green-700">Follow-ups and meetings will sync with your Google Calendar.</p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <h4 className="font-medium text-amber-800 mb-2">How to reconnect</h4>
                    <p className="text-amber-700 text-xs mb-2">
                      Google Calendar connects through the Replit workspace. To reconnect:
                    </p>
                    <ol className="text-amber-700 text-xs space-y-1 list-decimal ml-4 mb-3">
                      <li>Open the Replit workspace for this project</li>
                      <li>Click the <strong>Integrations</strong> tab in the left sidebar (puzzle piece icon &#9668;)</li>
                      <li>Find <strong>Google Calendar</strong> and click <strong>Reconnect</strong></li>
                      <li>Sign in with your Google account</li>
                      <li>Return here and click <strong>Refresh Status</strong></li>
                    </ol>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refetch()}
                      disabled={isFetching}
                      className="w-full border-amber-400 text-amber-800 hover:bg-amber-100"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />
                      Check Again After Reconnecting
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Odoo ── */}
        <Card
          className={cn(odooConnected && "border-green-200 bg-green-50/30")}
          data-testid="card-integration-odoo"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-purple-50">
                  <Database className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Odoo ERP
                    {odooConnected ? (
                      <Badge className="bg-green-600 hover:bg-green-700 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Sync customers, products, and pricing with Odoo</CardDescription>
                </div>
              </div>
              <Link href="/odoo-settings">
                <Button variant="outline" size="sm" data-testid="btn-settings-odoo">
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
              </Link>
            </div>
          </CardHeader>

          <CardContent>
            {status?.odoo.error && !odooConnected && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                <strong>Error:</strong> {status.odoo.error}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {['Import products from Odoo', 'Sync customer data', 'Push price updates', 'View orders and history'].map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className={cn("h-3.5 w-3.5 flex-shrink-0", odooConnected ? "text-green-600" : "text-gray-400")} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {odooConnected ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    <div className="flex items-center gap-2 font-medium mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Odoo is connected
                    </div>
                    <p className="text-xs text-green-700">Customer and product data syncs automatically with Odoo ERP.</p>
                  </div>
                ) : (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                    <h4 className="font-medium text-purple-800 mb-2">How to connect</h4>
                    <ol className="text-purple-700 text-xs space-y-1 list-decimal ml-4 mb-3">
                      <li>Add your Odoo URL, Database, Username, and API Key in Environment Secrets</li>
                      <li>Go to Odoo Settings and click <strong>Test Connection</strong></li>
                    </ol>
                    <Link href="/odoo-settings">
                      <Button size="sm" variant="outline" className="w-full border-purple-400 text-purple-800 hover:bg-purple-100" data-testid="btn-connect-odoo">
                        <Settings className="h-3.5 w-3.5 mr-1" />
                        Go to Odoo Settings
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-8" />

      {/* Spotlight Morning Digest */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" />
            Morning Spotlight Digest
          </CardTitle>
          <CardDescription>
            Receive a daily morning email with your top Spotlight customers — sent at 8 AM on weekdays.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Switch
              id="digest-toggle"
              checked={userPrefs?.spotlightDigestEnabled ?? true}
              onCheckedChange={(v) => digestMutation.mutate(v)}
              disabled={digestMutation.isPending}
            />
            <Label htmlFor="digest-toggle" className="text-sm text-slate-700 cursor-pointer">
              {userPrefs?.spotlightDigestEnabled ?? true
                ? 'Digest enabled — you will receive a morning email with top customers'
                : 'Digest disabled — you will not receive morning Spotlight emails'}
            </Label>
          </div>
          <p className="text-xs text-slate-400 mt-3">Requires Gmail to be connected. You can re-enable this at any time.</p>
        </CardContent>
      </Card>
    </div>
  );
}
