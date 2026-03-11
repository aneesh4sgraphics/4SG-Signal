import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Moon, Clock, Building2 } from "lucide-react";

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const OUTCOME_LABELS: Record<string, string> = {
  called_no_answer: 'Called — no answer',
  called_spoke: 'Called — spoke',
  email_sent: 'Email sent',
  quote_updated: 'Quote updated',
  order_placed: 'Order placed',
  not_interested: 'Not interested',
};

export default function SpotlightOverview() {
  const { data, isLoading, error } = useQuery<{
    activeClaims: any[];
    recentSnoozes: any[];
  }>({
    queryKey: ['/api/spotlight/overview'],
    queryFn: async () => {
      const res = await fetch('/api/spotlight/overview', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch overview');
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading Spotlight Overview...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Access denied or error loading overview.</div>
      </div>
    );
  }

  const activeClaims = data?.activeClaims || [];
  const recentSnoozes = data?.recentSnoozes || [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-indigo-600" />
          Spotlight Overview
        </h1>
        <p className="text-slate-500 text-sm mt-1">Manager view — all active claims and recent snooze outcomes across the team.</p>
      </div>

      {/* Active Claims */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-500" />
            Active Claims ({activeClaims.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeClaims.length === 0 ? (
            <p className="text-slate-400 text-sm">No active claims right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4">Claimed By</th>
                    <th className="pb-2 pr-4">Claimed</th>
                    <th className="pb-2">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeClaims.map((claim: any) => {
                    const repName = [claim.userFirstName, claim.userLastName].filter(Boolean).join(' ') || claim.userEmail || claim.userId;
                    const customerName = claim.customerCompany || claim.customerEmail || claim.customerId;
                    const expiresIn = Math.round((new Date(claim.expiresAt).getTime() - Date.now()) / 3600000);
                    return (
                      <tr key={`${claim.customerId}-${claim.userId}`} className="py-2">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-medium text-slate-800">{customerName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-xs">{repName}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-slate-500">{formatRelativeTime(claim.claimedAt)}</td>
                        <td className="py-2">
                          <span className={`text-xs font-medium ${expiresIn < 2 ? 'text-red-600' : 'text-slate-500'}`}>
                            {expiresIn > 0 ? `in ${expiresIn}h` : 'expired'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Snooze Outcomes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Moon className="w-4 h-4 text-purple-500" />
            Recent Snooze Outcomes — Last 7 Days ({recentSnoozes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentSnoozes.length === 0 ? (
            <p className="text-slate-400 text-sm">No snooze actions in the last 7 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4">Rep</th>
                    <th className="pb-2 pr-4">Outcome</th>
                    <th className="pb-2 pr-4">Snoozed Until</th>
                    <th className="pb-2 pr-4">When</th>
                    <th className="pb-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentSnoozes.map((s: any) => {
                    const repName = [s.userFirstName, s.userLastName].filter(Boolean).join(' ') || s.userEmail || s.userId;
                    const customerName = s.customerCompany || s.customerEmail || s.customerId;
                    const isFarFuture = s.snoozeUntil && new Date(s.snoozeUntil).getFullYear() > 2050;
                    const snoozeLabel = isFarFuture ? 'Permanently removed' : s.snoozeUntil
                      ? new Date(s.snoozeUntil).toLocaleDateString()
                      : '—';
                    return (
                      <tr key={s.id} className="py-2">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-medium text-slate-800">{customerName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{repName}</td>
                        <td className="py-2 pr-4">
                          {s.outcomeTag ? (
                            <Badge
                              variant="outline"
                              className={`text-xs ${s.outcomeTag === 'order_placed' ? 'border-green-400 text-green-700' : s.outcomeTag === 'not_interested' ? 'border-red-300 text-red-600' : 'border-slate-300 text-slate-600'}`}
                            >
                              {OUTCOME_LABELS[s.outcomeTag] || s.outcomeTag}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs ${isFarFuture ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                            {snoozeLabel}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-400 text-xs">{formatRelativeTime(s.createdAt)}</td>
                        <td className="py-2 text-slate-500 text-xs max-w-[200px] truncate">{s.note || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
