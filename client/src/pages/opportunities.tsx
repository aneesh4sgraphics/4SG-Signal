import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Target, TrendingUp, Package, Volume2, Sparkles, RefreshCw,
  Phone, Mail, ExternalLink, Building2, MapPin, Star,
  Loader2, AlertCircle, HelpCircle, DollarSign, LayoutGrid,
  Kanban, Zap, Clock, ChevronRight, ArrowDownLeft, ArrowUpRight,
  ShoppingCart, FileText, X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Config ────────────────────────────────────────────────────────────────

const OPPORTUNITY_TYPE_CONFIG: Record<string, {
  label: string; icon: any; color: string; bgColor: string; pipelineStage: string;
}> = {
  quote_pending:   { label: 'Quote Pending',  icon: DollarSign, color: 'text-violet-700', bgColor: 'bg-violet-50 border-violet-200', pipelineStage: 'quote_sent' },
  sample_no_order: { label: 'Samples Sent',   icon: Package,    color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200', pipelineStage: 'sample_sent' },
  went_quiet:      { label: 'Went Quiet',     icon: Volume2,    color: 'text-red-700',    bgColor: 'bg-red-50 border-red-200',       pipelineStage: 'prospect' },
  upsell_potential:{ label: 'Upsell',         icon: TrendingUp, color: 'text-green-700',  bgColor: 'bg-green-50 border-green-200',   pipelineStage: 'negotiating' },
  new_fit:         { label: 'Great Fit',       icon: Target,     color: 'text-blue-700',  bgColor: 'bg-blue-50 border-blue-200',     pipelineStage: 'prospect' },
  reorder_due:     { label: 'Reorder Due',    icon: RefreshCw,  color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', pipelineStage: 'negotiating' },
  machine_match:   { label: 'Machine Match',  icon: Sparkles,   color: 'text-amber-700',  bgColor: 'bg-amber-50 border-amber-200',   pipelineStage: 'prospect' },
};

const PIPELINE_STAGES = [
  {
    id: 'prospect',
    label: 'Prospect',
    description: 'Identified, not yet contacted',
    color: '#888780',
    bg: '#F1EFE8',
    border: '#D3D1C7',
  },
  {
    id: 'sample_sent',
    label: 'Sample sent',
    description: 'Physical samples delivered',
    color: '#854F0B',
    bg: '#FAEEDA',
    border: '#FAC775',
  },
  {
    id: 'quote_sent',
    label: 'Quote sent',
    description: 'Awaiting response',
    color: '#185FA5',
    bg: '#E6F1FB',
    border: '#85B7EB',
  },
  {
    id: 'negotiating',
    label: 'Negotiating',
    description: 'Active back-and-forth',
    color: '#3C3489',
    bg: '#EEEDFE',
    border: '#AFA9EC',
  },
  {
    id: 'won',
    label: 'Won this month',
    description: 'Converted to order',
    color: '#27500A',
    bg: '#EAF3DE',
    border: '#97C459',
  },
] as const;

// ─── Sub-components ────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-100 text-green-800 border-green-300'
    : score >= 50 ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-blue-100 text-blue-800 border-blue-300';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
      <Star className="w-2.5 h-2.5" />{score}
    </span>
  );
}

function formatRevenue(val: number | null | undefined): string {
  if (!val || val <= 0) return '';
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K/yr`;
  return `$${val}/yr`;
}

// ─── Opportunity detail sheet ───────────────────────────────────────────────

function OppDetailSheet({ opp, onClose }: { opp: any | null; onClose: () => void }) {
  const config = opp ? (OPPORTUNITY_TYPE_CONFIG[opp.opportunityType] || OPPORTUNITY_TYPE_CONFIG.new_fit) : null;
  const Icon = config?.icon;

  const { data: emails = [], isLoading: emailsLoading } = useQuery<any[]>({
    queryKey: ['/api/customer-activity/emails', opp?.entityEmail],
    queryFn: async () => {
      if (!opp?.entityEmail) return [];
      const res = await fetch(`/api/customer-activity/emails?contactEmail=${encodeURIComponent(opp.entityEmail)}&limit=6`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!opp?.entityEmail,
    staleTime: 2 * 60 * 1000,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery<any[]>({
    queryKey: ['/api/crm/customer-sent-quotes', opp?.entityEmail, opp?.entityCompany],
    queryFn: async () => {
      if (!opp?.entityEmail && !opp?.entityCompany) return [];
      const params = new URLSearchParams();
      if (opp?.entityEmail) params.set('email', opp.entityEmail);
      if (opp?.entityCompany) params.set('company', opp.entityCompany);
      const res = await fetch(`/api/crm/customer-sent-quotes?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(opp?.entityEmail || opp?.entityCompany),
    staleTime: 2 * 60 * 1000,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/odoo/customer', opp?.customerId, 'orders'],
    queryFn: async () => {
      if (!opp?.customerId) return [];
      const res = await fetch(`/api/odoo/customer/${opp.customerId}/orders`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!opp?.customerId,
    staleTime: 5 * 60 * 1000,
  });

  const detailLink = opp?.customerId
    ? `/odoo-contacts/${opp.customerId}`
    : opp?.leadId ? `/leads/${opp.leadId}` : null;

  return (
    <Sheet open={!!opp} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col overflow-hidden">
        {opp && config && (
          <>
            {/* Header */}
            <SheetHeader className={`px-5 pt-5 pb-4 border-b ${config.bgColor}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-2 rounded-lg ${config.bgColor} flex-shrink-0 mt-0.5`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-bold text-gray-900 leading-tight truncate">
                      {opp.entityCompany || opp.entityName || 'Unknown'}
                    </SheetTitle>
                    {opp.entityCompany && opp.entityName && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{opp.entityName}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${config.color} border-current px-1.5 py-0`}>
                        {config.label}
                      </Badge>
                      <ScoreBadge score={opp.score} />
                      {opp.opportunityAgeDays > 0 && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />{opp.opportunityAgeDays}d
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact info row */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {opp.entityEmail && (
                  <a href={`mailto:${opp.entityEmail}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="w-3 h-3" />{opp.entityEmail}
                  </a>
                )}
                {opp.entityPhone && (
                  <a href={`tel:${opp.entityPhone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Phone className="w-3 h-3" />{opp.entityPhone}
                  </a>
                )}
                {opp.entityCity && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{opp.entityCity}{opp.entityProvince ? `, ${opp.entityProvince}` : ''}
                  </span>
                )}
              </div>

              {/* Next best action */}
              {opp.nextBestAction && (
                <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                  <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-800 font-medium leading-tight">{opp.nextBestAction}</span>
                </div>
              )}

              {/* Expected revenue */}
              {opp.expectedRevenue > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-sm font-bold text-green-700">
                    {formatRevenue(opp.expectedRevenue)} estimated annual value
                  </span>
                </div>
              )}
            </SheetHeader>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

              {/* ── Emails ── */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Mail className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Recent Emails</span>
                  {emails.length > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{emails.length}</span>
                  )}
                </div>
                {emailsLoading ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
                    <Loader2 className="w-3 h-3 animate-spin" />Loading emails...
                  </div>
                ) : emails.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 italic">No emails found{!opp.entityEmail ? ' — no email on record' : ''}</p>
                ) : (
                  <div className="space-y-2">
                    {emails.slice(0, 6).map((email: any, i: number) => {
                      const isInbound = email.direction === 'inbound';
                      const date = email.sentAt ? new Date(email.sentAt) : null;
                      return (
                        <div key={email.id || i} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className={`mt-0.5 flex-shrink-0 rounded-full p-1 ${isInbound ? 'bg-blue-100' : 'bg-gray-200'}`}>
                            {isInbound
                              ? <ArrowDownLeft className="w-2.5 h-2.5 text-blue-600" />
                              : <ArrowUpRight className="w-2.5 h-2.5 text-gray-500" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-semibold text-gray-800 truncate">
                                {email.subject || '(no subject)'}
                              </span>
                              {date && (
                                <span className="text-[10px] text-gray-400 flex-shrink-0">
                                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                            {email.snippet && (
                              <p className="text-[10px] text-gray-500 truncate mt-0.5">{email.snippet}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Quotes ── */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <FileText className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">QuickQuote History</span>
                  {quotes.length > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{quotes.length}</span>
                  )}
                </div>
                {quotesLoading ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
                    <Loader2 className="w-3 h-3 animate-spin" />Loading quotes...
                  </div>
                ) : quotes.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 italic">No quotes found</p>
                ) : (
                  <div className="space-y-2">
                    {quotes.slice(0, 6).map((q: any, i: number) => {
                      const amount = parseFloat(q.totalAmount || '0');
                      const date = q.createdAt ? new Date(q.createdAt) : null;
                      const outcomeColor = q.outcome === 'won' ? 'text-green-600 bg-green-50'
                        : q.outcome === 'lost' ? 'text-red-500 bg-red-50'
                        : 'text-amber-600 bg-amber-50';
                      return (
                        <div key={q.id || i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-gray-800">#{q.quoteNumber}</span>
                              {q.source !== 'quickquote' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                                  {q.source === 'shopify_draft' ? 'Shopify' : q.source === 'shopify_abandoned_cart' ? 'Cart' : q.source}
                                </span>
                              )}
                            </div>
                            {date && (
                              <span className="text-[10px] text-gray-400">
                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[11px] font-bold text-blue-700">
                              ${amount >= 1000 ? `${(amount / 1000).toFixed(1)}K` : amount.toFixed(2)}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${outcomeColor}`}>
                              {q.outcome || 'pending'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Sales Orders ── */}
              {opp.customerId && (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <ShoppingCart className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Sales Orders</span>
                    {orders.length > 0 && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{orders.length}</span>
                    )}
                  </div>
                  {ordersLoading ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
                      <Loader2 className="w-3 h-3 animate-spin" />Loading orders...
                    </div>
                  ) : orders.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 italic">No orders found in Odoo</p>
                  ) : (
                    <div className="space-y-2">
                      {orders.slice(0, 5).map((order: any, i: number) => {
                        const amount = order.amount_total || order.amountTotal || 0;
                        const date = order.date_order || order.dateOrder;
                        const parsedDate = date ? new Date(date) : null;
                        const stateColor = order.state === 'sale' ? 'bg-green-100 text-green-700'
                          : order.state === 'cancel' ? 'bg-red-100 text-red-600'
                          : order.state === 'done' ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600';
                        return (
                          <div key={order.id || i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[11px] font-semibold text-gray-800">{order.name}</span>
                              {parsedDate && (
                                <div className="text-[10px] text-gray-400">
                                  {parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {amount > 0 && (
                                <span className="text-[11px] font-bold text-gray-800">
                                  ${amount >= 1000 ? `${(amount / 1000).toFixed(1)}K` : amount.toFixed(2)}
                                </span>
                              )}
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${stateColor}`}>
                                {order.state === 'sale' ? 'confirmed' : order.state || 'draft'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer: view full profile */}
            {detailLink && (
              <div className="px-5 py-3 border-t bg-white flex-shrink-0">
                <Link href={detailLink}>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    View Full Profile
                  </Button>
                </Link>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Pipeline card (compact, for Kanban column) ────────────────────────────

function PipelineCard({ opp, onSelect }: { opp: any; onSelect: (opp: any) => void }) {
  const config = OPPORTUNITY_TYPE_CONFIG[opp.opportunityType] || OPPORTUNITY_TYPE_CONFIG.new_fit;
  const Icon = config.icon;
  const detailLink = opp.customerId
    ? `/odoo-contacts/${opp.customerId}`
    : opp.leadId ? `/leads/${opp.leadId}` : null;

  return (
    <div
      className={`bg-white rounded-lg border ${config.bgColor} p-3 mb-2 hover:shadow-md transition-shadow cursor-pointer`}
      style={{ borderLeftWidth: 3 }}
      onClick={() => onSelect(opp)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`w-3 h-3 flex-shrink-0 ${config.color}`} />
          <span className="text-xs font-semibold text-gray-900 truncate">
            {opp.entityCompany || opp.entityName || 'Unknown'}
          </span>
        </div>
        <ScoreBadge score={opp.score} />
      </div>

      {/* Location */}
      {opp.entityProvince && (
        <div className="flex items-center gap-1 mb-1.5">
          <MapPin className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
          <span className="text-[10px] text-gray-500 truncate">
            {opp.entityCity ? `${opp.entityCity}, ${opp.entityProvince}` : opp.entityProvince}
          </span>
        </div>
      )}

      {/* Next best action */}
      {opp.nextBestAction && (
        <div className="flex items-start gap-1 mb-2 bg-gray-50 rounded px-2 py-1">
          <Zap className="w-2.5 h-2.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <span className="text-[10px] text-gray-600 leading-tight">{opp.nextBestAction}</span>
        </div>
      )}

      {/* Revenue + age */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {opp.expectedRevenue > 0 && (
            <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
              {formatRevenue(opp.expectedRevenue)}
            </span>
          )}
          {opp.opportunityAgeDays > 14 && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{opp.opportunityAgeDays}d
            </span>
          )}
        </div>
        {detailLink && (
          <Link href={detailLink}>
            <ChevronRight className="w-3 h-3 text-gray-300 hover:text-gray-600" />
          </Link>
        )}
      </div>

      {/* Contact actions */}
      <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
        {opp.entityPhone && (
          <a href={`tel:${opp.entityPhone}`} className={`text-[10px] ${config.color} hover:underline flex items-center gap-0.5`}>
            <Phone className="w-2.5 h-2.5" /> Call
          </a>
        )}
        {opp.entityEmail && (
          <a href={`mailto:${opp.entityEmail}`} className={`text-[10px] ${config.color} hover:underline flex items-center gap-0.5`}>
            <Mail className="w-2.5 h-2.5" /> Email
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Full list card (existing style, kept exactly) ─────────────────────────

function OpportunityCard({ opp, onSelect }: { opp: any; onSelect: (opp: any) => void }) {
  const config = OPPORTUNITY_TYPE_CONFIG[opp.opportunityType] || OPPORTUNITY_TYPE_CONFIG.new_fit;
  const Icon = config.icon;
  const detailLink = opp.customerId
    ? `/odoo-contacts/${opp.customerId}`
    : opp.leadId ? `/leads/${opp.leadId}` : null;

  return (
    <Card
      className={`border ${config.bgColor} hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => onSelect(opp)}
    >
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
                  <Building2 className="w-3 h-3" />{opp.entityCompany}
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

        {/* Next best action — new field */}
        {opp.nextBestAction && (
          <div className="flex items-start gap-1.5 mb-2 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
            <Zap className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-amber-800">{opp.nextBestAction}</span>
          </div>
        )}

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

        {/* Expected revenue — new field */}
        {opp.expectedRevenue > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <DollarSign className="w-3 h-3 text-green-600" />
            <span className="text-xs font-semibold text-green-700">
              Est. {formatRevenue(opp.expectedRevenue)} annual value
            </span>
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

// ─── Quote card (for Quote Sent column) ───────────────────────────────────

function QuoteCard({ quote, onSelect }: { quote: any; onSelect: (opp: any) => void }) {
  const daysSince = Math.floor((Date.now() - new Date(quote.createdAt).getTime()) / 86400000);
  const amount = parseFloat(quote.totalAmount || '0');
  const detailLink = quote.customerId ? `/odoo-contacts/${quote.customerId}` : null;
  const sourceLabel = quote.source === 'shopify_draft' ? 'Shopify' : quote.source === 'shopify_abandoned_cart' ? 'Abandoned Cart' : 'QuickQuote';

  const quoteAsOpp = {
    entityName: quote.customerName,
    entityCompany: quote.customerName,
    entityEmail: quote.customerEmail,
    customerId: quote.customerId,
    opportunityType: 'quote_pending',
    score: null,
    nextBestAction: null,
    expectedRevenue: parseFloat(quote.totalAmount || '0') || 0,
    opportunityAgeDays: daysSince,
    _isQuote: true,
  };

  return (
    <div
      className="bg-white rounded-lg border border-blue-200 p-3 mb-2 hover:shadow-md transition-shadow cursor-pointer"
      style={{ borderLeftWidth: 3, borderLeftColor: '#185FA5' }}
      onClick={() => onSelect(quoteAsOpp)}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-xs font-semibold text-gray-900 truncate leading-tight">{quote.customerName}</span>
        {quote.priority === 'high' && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold flex-shrink-0">HOT</span>
        )}
      </div>
      {quote.customerEmail && (
        <div className="text-[10px] text-gray-400 truncate mb-1.5">{quote.customerEmail}</div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {amount > 0 && (
            <span className="text-[11px] font-bold text-blue-700">
              ${amount >= 1000 ? `${(amount / 1000).toFixed(1)}K` : amount.toFixed(2)}
            </span>
          )}
          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">{sourceLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />{daysSince}d ago
          </span>
          {detailLink && (
            <Link href={detailLink}><ChevronRight className="w-3 h-3 text-gray-300 hover:text-gray-600" /></Link>
          )}
        </div>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-1">
        {quote.customerEmail ? (
          <a href={`mailto:${quote.customerEmail}`} className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
            <Mail className="w-2.5 h-2.5" /> Follow up
          </a>
        ) : <span />}
        {quote.ownerEmail && (
          <span className="text-[9px] text-gray-400 truncate max-w-[80px]" title={quote.ownerEmail}>
            {quote.ownerEmail.split('@')[0]}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline board ────────────────────────────────────────────────────────

function PipelineBoard({ opps, quotes, onSelect }: { opps: any[]; quotes: any[]; onSelect: (opp: any) => void }) {
  const oppsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.id] = opps.filter(opp => {
      const cfg = OPPORTUNITY_TYPE_CONFIG[opp.opportunityType];
      return cfg?.pipelineStage === stage.id;
    });
    return acc;
  }, {} as Record<string, any[]>);

  // Quote totals for the quote_sent column
  const quotesTotal = quotes.reduce((sum, q) => sum + parseFloat(q.totalAmount || '0'), 0);

  const totalByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    const stageOpps = oppsByStage[stage.id] || [];
    acc[stage.id] = stageOpps.reduce((sum: number, o: any) => sum + (o.expectedRevenue || 0), 0);
    if (stage.id === 'quote_sent') acc[stage.id] += quotesTotal;
    return acc;
  }, {} as Record<string, number>);

  const grandTotal = Object.values(totalByStage).reduce((a, b) => a + b, 0);

  return (
    <div>
      {grandTotal > 0 && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-700">
            Total pipeline value:
          </span>
          <span className="text-sm font-bold text-green-700">
            {grandTotal >= 1000
              ? `$${(grandTotal / 1000).toFixed(0)}K estimated annual revenue`
              : `$${grandTotal.toLocaleString()} estimated annual revenue`}
          </span>
          <span className="text-xs text-gray-400 ml-1">(based on avg order × frequency)</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {PIPELINE_STAGES.map(stage => {
          const stageOpps = oppsByStage[stage.id] || [];
          const stageQuotes = stage.id === 'quote_sent' ? quotes : [];
          const stageTotal = totalByStage[stage.id] || 0;
          const count = stageOpps.length + stageQuotes.length;
          const isEmpty = count === 0;

          return (
            <div key={stage.id} className="flex flex-col min-h-40">
              <div
                className="rounded-t-lg px-3 py-2.5 mb-0"
                style={{ background: stage.bg, borderBottom: `2px solid ${stage.border}` }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold" style={{ color: stage.color }}>
                    {stage.label}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: stage.border, color: stage.color }}
                  >
                    {count}
                  </span>
                </div>
                {stageTotal > 0 && (
                  <div className="text-[10px] font-semibold" style={{ color: stage.color }}>
                    {stage.id === 'quote_sent'
                      ? `$${stageTotal >= 1000 ? `${(stageTotal / 1000).toFixed(0)}K` : stageTotal.toFixed(0)} quoted`
                      : stageTotal >= 1000
                        ? `$${(stageTotal / 1000).toFixed(0)}K est.`
                        : `$${stageTotal} est.`}
                  </div>
                )}
                {stageTotal === 0 && (
                  <div className="text-[10px]" style={{ color: stage.color, opacity: 0.6 }}>
                    {stage.description}
                  </div>
                )}
              </div>

              <div
                className="flex-1 rounded-b-lg p-2 overflow-y-auto"
                style={{ background: `${stage.bg}80`, border: `1px solid ${stage.border}`, borderTop: 'none', minHeight: 120 }}
              >
                {isEmpty ? (
                  <div className="flex items-center justify-center h-16">
                    <span className="text-[10px]" style={{ color: stage.color, opacity: 0.5 }}>
                      No opportunities
                    </span>
                  </div>
                ) : (
                  <>
                    {stageQuotes.map((q: any) => <QuoteCard key={`q-${q.id}`} quote={q} onSelect={onSelect} />)}
                    {stageOpps
                      .sort((a: any, b: any) => b.score - a.score)
                      .map((opp: any) => <PipelineCard key={opp.id} opp={opp} onSelect={onSelect} />)}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [activeType, setActiveType] = useState('all');
  const [selectedOpp, setSelectedOpp] = useState<any | null>(null);
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: allOpps = [], isLoading, isError: oppsError } = useQuery<any[]>({
    queryKey: ['/api/opportunities', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/opportunities?limit=500', { credentials: 'include' });
      if (res.status === 401) throw new Error('Session expired');
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/opportunities/summary'],
  });

  const { data: pipelineQuotes = [] } = useQuery<any[]>({
    queryKey: ['/api/quotes/pipeline'],
    queryFn: async () => {
      const res = await fetch('/api/quotes/pipeline', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
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

  const filteredOpps = activeType === 'all'
    ? allOpps
    : allOpps.filter(o => o.opportunityType === activeType);

  const countByType = allOpps.reduce((acc: Record<string, number>, opp: any) => {
    acc[opp.opportunityType] = (acc[opp.opportunityType] || 0) + 1;
    return acc;
  }, {});

  const totalPipelineValue = allOpps.reduce((sum, o) => sum + (o.expectedRevenue || 0), 0);

  return (
    <div className="min-h-screen bg-[#FDFBF7] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Target className="w-6 h-6 text-amber-500" />
              Opportunities
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAdmin ? 'All reps' : 'My opportunities'} — {allOpps.length} active
              {totalPipelineValue > 0 && (
                <span className="ml-2 font-semibold text-green-700">
                  · ${totalPipelineValue >= 1000
                    ? `${(totalPipelineValue / 1000).toFixed(0)}K`
                    : totalPipelineValue.toLocaleString()} estimated annual pipeline
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setView('pipeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'pipeline'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                Pipeline
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'list'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                List
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => detectSamplesMutation.mutate()}
              disabled={detectSamplesMutation.isPending}
            >
              {detectSamplesMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                : <Package className="w-4 h-4 mr-1" />}
              Detect Samples
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
            >
              {recalculateMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                : <RefreshCw className="w-4 h-4 mr-1" />}
              Recalculate
            </Button>
          </div>
        </div>

        {/* Summary stat cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{summary.totalActive}</div>
              <div className="text-xs text-gray-500">Active opportunities</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{summary.topScorers}</div>
              <div className="text-xs text-gray-500">High score (60+)</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      <div className={`text-2xl font-bold ${
                        summary.avgScore >= 61 ? 'text-green-600'
                        : summary.avgScore >= 31 ? 'text-amber-600'
                        : 'text-red-500'
                      }`}>{summary.avgScore}</div>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs text-gray-500">Avg score</span>
                        <HelpCircle className="w-3 h-3 text-gray-400" />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] p-3">
                    <p className="text-xs font-semibold mb-2">Score guide</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <span className="text-xs"><strong>61–100</strong> — Act now</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        <span className="text-xs"><strong>31–60</strong> — Nurture</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-xs"><strong>0–30</strong> — Monitor</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Pipeline breakdown panel */}
        {summary && totalPipelineValue > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-gray-800">
                  {isAdmin ? 'Pipeline by rep' : 'My pipeline'}
                </span>
                <span className="text-xs text-gray-400">· est. annual revenue</span>
              </div>
              <span className="text-sm font-bold text-purple-700">
                {totalPipelineValue >= 1000
                  ? `$${(totalPipelineValue / 1000).toFixed(0)}K total`
                  : `$${totalPipelineValue.toLocaleString()} total`}
              </span>
            </div>

            {/* Rep tabs — admin only */}
            {isAdmin && summary?.byRep && summary.byRep.length > 0 ? (
              <div className="flex divide-x divide-gray-100">
                {summary.byRep.map((rep: any, idx: number) => {
                  const pct = totalPipelineValue > 0
                    ? Math.round((rep.revenue / totalPipelineValue) * 100)
                    : 0;
                  const colors = [
                    { bar: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-50' },
                    { bar: 'bg-blue-500',   text: 'text-blue-700',   light: 'bg-blue-50'   },
                    { bar: 'bg-teal-500',   text: 'text-teal-700',   light: 'bg-teal-50'   },
                  ];
                  const c = colors[idx % colors.length];
                  return (
                    <div key={rep.repId} className={`flex-1 px-5 py-4 ${c.light}`}>
                      <div className={`text-xs font-semibold ${c.text} mb-1`}>
                        {rep.repName?.split(' ')[0] || 'Rep'}
                      </div>
                      <div className={`text-xl font-bold ${c.text} mb-0.5`}>
                        {rep.revenue >= 1000
                          ? `$${(rep.revenue / 1000).toFixed(0)}K`
                          : rep.revenue > 0 ? `$${rep.revenue}` : '—'}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] text-gray-500">{rep.count} opps</span>
                        {pct > 0 && (
                          <span className={`text-[11px] font-medium ${c.text}`}>{pct}%</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-white rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-4">
                <div className="text-xl font-bold text-purple-700 mb-0.5">
                  {totalPipelineValue >= 1000
                    ? `$${(totalPipelineValue / 1000).toFixed(0)}K`
                    : `$${totalPipelineValue.toLocaleString()}`}
                </div>
                <div className="text-xs text-gray-500">estimated annual revenue in your pipeline</div>
              </div>
            )}
          </div>
        )}

        {/* Loading / error states */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading opportunities...</span>
          </div>
        )}

        {!isLoading && oppsError && (
          <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-700 mb-1">Could Not Load Opportunities</h3>
            <p className="text-sm text-gray-500 mb-4">Your session may have expired. Try refreshing the page.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Refresh Page</Button>
          </div>
        )}

        {!isLoading && !oppsError && allOpps.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-700 mb-1">No Opportunities Found</h3>
            <p className="text-sm text-gray-500 mb-4">Click "Recalculate" to scan your contacts.</p>
            <Button variant="outline" onClick={() => recalculateMutation.mutate()} disabled={recalculateMutation.isPending}>
              {recalculateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Scan Now
            </Button>
          </div>
        )}

        {/* ── PIPELINE VIEW ── */}
        {!isLoading && !oppsError && allOpps.length > 0 && view === 'pipeline' && (
          <PipelineBoard opps={allOpps} quotes={pipelineQuotes} onSelect={setSelectedOpp} />
        )}

        {/* ── LIST VIEW ── */}
        {!isLoading && !oppsError && allOpps.length > 0 && view === 'list' && (
          <div>
            {/* Type filter tabs */}
            <div className="flex items-center gap-1 flex-wrap mb-4">
              <button
                onClick={() => setActiveType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeType === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                All ({allOpps.length})
              </button>
              {Object.entries(OPPORTUNITY_TYPE_CONFIG).map(([key, config]) => {
                const count = countByType[key] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveType(key)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeType === key
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <config.icon className="w-3 h-3" />
                    {config.label}
                    <span className={`px-1 rounded-full text-[10px] ${activeType === key ? 'bg-white/20' : 'bg-gray-100'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredOpps.map((opp: any) => (
                <OpportunityCard key={opp.id} opp={opp} onSelect={setSelectedOpp} />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Detail sheet — opens on card click */}
      <OppDetailSheet opp={selectedOpp} onClose={() => setSelectedOpp(null)} />
    </div>
  );
}
