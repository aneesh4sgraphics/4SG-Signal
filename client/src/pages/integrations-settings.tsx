import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Mail, Calendar, Database, CheckCircle2, XCircle, RefreshCw, 
  ExternalLink, Settings, AlertCircle, ArrowLeft, Plug, Sun
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

  const { data: status, isLoading, refetch, isFetching } = useQuery<ConnectionStatus>({
    queryKey: ['/api/integrations/status'],
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

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

  const integrations = [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Send emails to customers directly from the app',
      icon: Mail,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      features: [
        'Send emails from Email Studio',
        'Drip email campaigns',
        'Email tracking (opens & clicks)',
        'Appears in your Sent folder',
      ],
      howToConnect: 'Use the Replit Integrations panel in the left sidebar to connect your Gmail account.',
      isReplitIntegration: true,
    },
    {
      id: 'calendar',
      name: 'Google Calendar',
      description: 'Schedule follow-ups and sync customer meetings',
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      features: [
        'Schedule follow-up reminders',
        'Sync customer meetings',
        'View upcoming appointments',
      ],
      howToConnect: 'Use the Replit Integrations panel in the left sidebar to connect your Google Calendar.',
      isReplitIntegration: true,
    },
    {
      id: 'odoo',
      name: 'Odoo ERP',
      description: 'Sync customers, products, and pricing with Odoo',
      icon: Database,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      features: [
        'Import products from Odoo',
        'Sync customer data',
        'Push price updates',
        'View orders and history',
      ],
      howToConnect: 'Add your Odoo credentials (URL, Database, Username, API Key) in the Environment Secrets.',
      isReplitIntegration: false,
      settingsLink: '/odoo-settings',
    },
  ];

  const connectedCount = status 
    ? [status.gmail.connected, status.calendar.connected, status.odoo.connected].filter(Boolean).length 
    : 0;

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

      <Card className="mb-6" data-testid="card-summary">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isLoading ? (
                <div className="h-10 w-10 rounded-full bg-gray-100 animate-pulse" />
              ) : connectedCount === 3 ? (
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
                  {isLoading ? 'Checking connections...' : `${connectedCount} of 3 services connected`}
                </div>
                <div className="text-sm text-muted-foreground">
                  {connectedCount === 3 
                    ? 'All integrations are active' 
                    : 'Connect more services to unlock features'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {!isLoading && status && (
                <>
                  <Badge variant={status.gmail.connected ? "default" : "secondary"} className="gap-1">
                    <Mail className="h-3 w-3" />
                    Gmail
                  </Badge>
                  <Badge variant={status.calendar.connected ? "default" : "secondary"} className="gap-1">
                    <Calendar className="h-3 w-3" />
                    Calendar
                  </Badge>
                  <Badge variant={status.odoo.connected ? "default" : "secondary"} className="gap-1">
                    <Database className="h-3 w-3" />
                    Odoo
                  </Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          const isConnected = status?.[integration.id as keyof ConnectionStatus]?.connected ?? false;
          const error = status?.[integration.id as keyof ConnectionStatus]?.error ?? null;

          return (
            <Card 
              key={integration.id} 
              className={cn(
                "transition-all",
                isConnected && "border-green-200 bg-green-50/30"
              )}
              data-testid={`card-integration-${integration.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-3 rounded-lg", integration.bgColor)}>
                      <Icon className={cn("h-6 w-6", integration.color)} />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {integration.name}
                        {isLoading ? (
                          <Badge variant="secondary" className="animate-pulse">Checking...</Badge>
                        ) : isConnected ? (
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
                      <CardDescription>{integration.description}</CardDescription>
                    </div>
                  </div>
                  {integration.settingsLink && (
                    <Link href={integration.settingsLink}>
                      <Button variant="outline" size="sm" data-testid={`btn-settings-${integration.id}`}>
                        <Settings className="h-4 w-4 mr-1" />
                        Settings
                      </Button>
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {error && !isConnected && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                    <strong>Error:</strong> {error}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Features</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {integration.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <CheckCircle2 className={cn(
                            "h-3.5 w-3.5 flex-shrink-0",
                            isConnected ? "text-green-600" : "text-gray-400"
                          )} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">How to Connect</h4>
                    <div className={cn(
                      "text-sm p-3 rounded-lg",
                      integration.isReplitIntegration ? "bg-blue-50 border border-blue-200" : "bg-purple-50 border border-purple-200"
                    )}>
                      {integration.isReplitIntegration ? (
                        <div className="space-y-2">
                          <p className="text-blue-800">{integration.howToConnect}</p>
                          <div className="flex items-center gap-2 text-blue-600 text-xs">
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Look for the <strong>Integrations</strong> tab in the Replit sidebar</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-purple-800">{integration.howToConnect}</p>
                          {integration.settingsLink && (
                            <Link href={integration.settingsLink}>
                              <Button size="sm" variant="outline" className="mt-2" data-testid={`btn-connect-${integration.id}`}>
                                <Settings className="h-3.5 w-3.5 mr-1" />
                                Go to {integration.name} Settings
                              </Button>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
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

      <Separator className="my-8" />

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Need Help Connecting?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-3">
          <div>
            <strong>For Gmail & Google Calendar:</strong>
            <ol className="list-decimal ml-5 mt-1 space-y-1">
              <li>Open the Replit sidebar on the left</li>
              <li>Click on the <strong>Integrations</strong> tab (puzzle piece icon)</li>
              <li>Find "Gmail" or "Google Calendar" and click <strong>Connect</strong></li>
              <li>Sign in with your Google account and authorize access</li>
              <li>Return here and click <strong>Refresh Status</strong></li>
            </ol>
          </div>
          <div>
            <strong>For Odoo:</strong>
            <ol className="list-decimal ml-5 mt-1 space-y-1">
              <li>Go to <Link href="/odoo-settings" className="text-blue-600 underline" data-testid="link-odoo-settings-help">Odoo Settings</Link></li>
              <li>Make sure your Odoo URL, Database, Username, and API Key are set in Environment Secrets</li>
              <li>Test the connection using the Test Connection button</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
