import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { Search, X, ExternalLink, CheckCircle2, AlertTriangle, Clock, Package, Beaker, ClipboardList, Eye } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────
function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string | null | undefined, company: string | null | undefined): string {
  const src = name || company || '?';
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#3B5BA5','#0E7B6C','#AD1972','#D9730B','#693FA5','#E03D3E','#64473A','#0C6E99'];
function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, company, size = 34 }: { name?: string | null; company?: string | null; size?: number }) {
  const label = initials(name, company);
  const src = name || company || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(src), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
      {label}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    green:  { bg: '#EAF3DE', text: '#27500A' },
    blue:   { bg: '#E4F0FF', text: '#1555A0' },
    purple: { bg: '#EEEDFE', text: '#3C3489' },
    amber:  { bg: '#FEF3CD', text: '#854F0B' },
    red:    { bg: '#FFE9E9', text: '#A32D2D' },
    gray:   { bg: '#F0F0EF', text: '#737373' },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px', background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function RecordLink({ recordType, recordId, children }: { recordType: string; recordId: string; children: React.ReactNode }) {
  const href = recordType === 'lead' ? `/leads/${recordId}` : `/odoo-contacts/${recordId}`;
  return <Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{children}</Link>;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-tertiary)' }}>
      <div style={{ marginBottom: '12px', opacity: 0.4 }}>{icon}</div>
      <p style={{ fontSize: '14px' }}>{text}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ height: '56px', background: 'var(--color-background-secondary)', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  );
}

// ─── Signal badges for Working On ───────────────────
function signalBadge(sig: string) {
  if (sig === 'quote_sent') return <Badge key={sig} label="Quote" color="purple" />;
  if (sig === 'price_list_sent') return <Badge key={sig} label="Price List" color="blue" />;
  if (sig === 'email_pricing') return <Badge key={sig} label="Email" color="blue" />;
  if (['po','approval','sales_win'].includes(sig)) return <Badge key={sig} label="Buying" color="green" />;
  if (['opportunity','commitment'].includes(sig)) return <Badge key={sig} label="Intent" color="amber" />;
  return <Badge key={sig} label={sig} color="gray" />;
}

// ─── Tab 1: Samples Sent ────────────────────────────
function SamplesSentTab() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/lists/samples-sent'] });

  if (isLoading) return <Skeleton />;
  if (!data.length) return <EmptyState icon={<Beaker size={40} />} text="No samples sent yet" />;

  return (
    <div>
      <div style={{ padding: '12px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
        {data.length} records
      </div>
      {data.map((row: any) => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' }}>
          <Avatar name={row.name} company={row.company} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <RecordLink recordType={row.recordType} recordId={row.recordId}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name || row.company || row.email}
              </div>
            </RecordLink>
            {row.company && row.name !== row.company && (
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{row.company}</div>
            )}
            {row.email && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{row.email}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Badge label={row.recordType === 'lead' ? 'Lead' : 'Customer'} color={row.recordType === 'lead' ? 'blue' : 'purple'} />
              <Badge label={row.source === 'mailer' ? 'Mailer' : 'Sample'} color="gray" />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {row.sentAt ? `${formatDate(row.sentAt)} · ${timeAgo(row.sentAt)}` : '—'}
            </div>
            {row.salesRepName && (
              <span style={{ fontSize: '10px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '4px', padding: '1px 5px', color: 'var(--color-text-tertiary)' }}>
                {row.salesRepName.split('@')[0]}
              </span>
            )}
          </div>
          <RecordLink recordType={row.recordType} recordId={row.recordId}>
            <ExternalLink size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          </RecordLink>
        </div>
      ))}
    </div>
  );
}

// ─── Tab 2: Press Kits ──────────────────────────────
function PressKitsTab() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/lists/press-kits-sent'] });

  if (isLoading) return <Skeleton />;
  if (!data.length) return <EmptyState icon={<Package size={40} />} text="No press kits sent yet" />;

  const overdue = data.filter((r: any) => r.urgency === 'overdue').length;

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
        <span>{data.length} press kits sent</span>
        {overdue > 0 && (
          <span style={{ color: '#A32D2D', fontWeight: 500 }}>· {overdue} need follow-up</span>
        )}
      </div>
      {data.map((row: any) => {
        const urgencyColor = row.urgency === 'overdue' ? '#A32D2D' : row.urgency === 'due' ? '#854F0B' : '#27500A';
        const urgencyBg = row.urgency === 'overdue' ? '#FFE9E9' : row.urgency === 'due' ? '#FEF3CD' : '#EAF3DE';
        return (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: row.urgency === 'overdue' ? '#FFF8F8' : 'var(--color-background-primary)' }}>
            <Avatar name={row.name} company={row.company} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <RecordLink recordType={row.recordType} recordId={row.recordId}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name || row.company || row.email}
                </div>
              </RecordLink>
              {row.company && row.name !== row.company && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{row.company}</div>}
              <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center' }}>
                {row.trackingNumber && (
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '3px', padding: '1px 5px', color: 'var(--color-text-secondary)' }}>
                    {row.trackingNumber}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: urgencyColor, background: urgencyBg, borderRadius: '6px', padding: '2px 8px' }}>
                {row.daysSinceSent !== null ? `${row.daysSinceSent}d` : '—'}
              </span>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{formatDate(row.sentAt)}</div>
              {row.urgency === 'overdue' && (
                <button style={{ fontSize: '11px', fontWeight: 600, color: '#fff', background: '#A32D2D', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>
                  Follow up now
                </button>
              )}
            </div>
            <RecordLink recordType={row.recordType} recordId={row.recordId}>
              <ExternalLink size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            </RecordLink>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab 3: Working On ──────────────────────────────
function WorkingOnTab() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/lists/working-on'] });

  if (isLoading) return <Skeleton />;
  if (!data.length) return <EmptyState icon={<ClipboardList size={40} />} text="No active commercial activity in the last 90 days" />;

  return (
    <div>
      <div style={{ padding: '12px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
        {data.length} customers with active signals (last 90 days)
      </div>
      {data.map((row: any) => (
        <div key={row.recordId} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' }}>
          <Avatar name={row.name} company={row.company} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <RecordLink recordType={row.recordType} recordId={row.recordId}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name}
              </div>
            </RecordLink>
            {row.email && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{row.email}</div>}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
              {(row.signals || []).map((s: string) => signalBadge(s))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            {row.pricingTier && <Badge label={row.pricingTier} color="purple" />}
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{timeAgo(row.lastActivity)}</div>
            {row.salesRepName && (
              <span style={{ fontSize: '10px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '4px', padding: '1px 5px', color: 'var(--color-text-tertiary)' }}>
                {row.salesRepName.split('@')[0]}
              </span>
            )}
          </div>
          <RecordLink recordType={row.recordType} recordId={row.recordId}>
            <ExternalLink size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          </RecordLink>
        </div>
      ))}
    </div>
  );
}

// ─── Tab 4: Watch List ──────────────────────────────
function WatchListTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/lists/watchlist'] });

  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addReason, setAddReason] = useState('');
  const [addPriority, setAddPriority] = useState('normal');
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});

  const addMutation = useMutation({
    mutationFn: (body: any) => apiRequest('POST', '/api/lists/watchlist', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists/watchlist'] });
      setSearch(''); setSearchResults([]); setAddReason(''); setAddPriority('normal');
      toast({ title: 'Added to watch list' });
    },
    onError: () => toast({ title: 'Failed to add', variant: 'destructive' }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest('PATCH', `/api/lists/watchlist/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lists/watchlist'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/lists/watchlist/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lists/watchlist'] }),
  });

  const doSearch = async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const [custRes, leadRes] = await Promise.all([
        fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=8`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/leads?search=${encodeURIComponent(q)}&limit=8`, { credentials: 'include' }).then(r => r.json()),
      ]);
      const custs = (Array.isArray(custRes) ? custRes : custRes.customers || []).slice(0, 8).map((c: any) => ({ ...c, _type: 'customer', _label: c.company || `${c.firstName} ${c.lastName}` }));
      const ls = (Array.isArray(leadRes) ? leadRes : leadRes.leads || []).slice(0, 8).map((l: any) => ({ ...l, _type: 'lead', _label: l.company || l.name || l.email }));
      setSearchResults([...custs, ...ls]);
    } finally {
      setSearching(false);
    }
  };

  const addEntry = (rec: any) => {
    addMutation.mutate({
      customerId: rec._type === 'customer' ? rec.id : undefined,
      leadId: rec._type === 'lead' ? rec.id : undefined,
      reason: addReason || undefined,
      priority: addPriority,
    });
  };

  const priorityColor = (p: string) => p === 'high' ? 'red' : p === 'low' ? 'gray' : 'amber';

  return (
    <div>
      {/* Add form */}
      <div style={{ padding: '16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Add to watch list</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); doSearch(e.target.value); }}
              placeholder="Search customer or lead…"
              style={{ width: '100%', padding: '8px 10px 8px 30px', fontSize: '13px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, marginTop: '2px', maxHeight: '240px', overflowY: 'auto' }}>
                {searchResults.map((r: any) => (
                  <div
                    key={`${r._type}-${r.id}`}
                    onClick={() => addEntry(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer', borderBottom: '0.5px solid var(--color-border-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Avatar name={r._label} company={r.company} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{r._label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{r.email} · {r._type}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            value={addReason}
            onChange={e => setAddReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{ flex: '2 1 200px', padding: '8px 12px', fontSize: '13px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
          />
          <select
            value={addPriority}
            onChange={e => setAddPriority(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '13px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
          >
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {isLoading && <Skeleton />}
      {!isLoading && !data.length && (
        <EmptyState icon={<Eye size={40} />} text="Add customers or leads you want to keep an eye on" />
      )}

      {data.map((entry: any) => {
        const localNotes = editingNotes[entry.id] ?? entry.notes ?? '';
        return (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' }}>
            <Avatar name={entry.name} company={entry.company} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{entry.name || entry.company || entry.email}</span>
                <Badge label={entry.priority || 'normal'} color={priorityColor(entry.priority)} />
              </div>
              {entry.company && entry.name !== entry.company && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{entry.company}</div>
              )}
              {entry.reason && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{entry.reason}</div>}
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                Added by {entry.addedByName || entry.addedBy} · {timeAgo(entry.createdAt)}
              </div>
              <textarea
                value={localNotes}
                onChange={e => setEditingNotes(prev => ({ ...prev, [entry.id]: e.target.value }))}
                onBlur={() => {
                  if (localNotes !== (entry.notes ?? '')) {
                    patchMutation.mutate({ id: entry.id, notes: localNotes });
                  }
                }}
                placeholder="Add notes…"
                rows={1}
                style={{ marginTop: '6px', width: '100%', padding: '5px 8px', fontSize: '12px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => patchMutation.mutate({ id: entry.id, isResolved: true })}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '5px 10px', borderRadius: '6px', border: '0.5px solid #97C459', background: '#EAF3DE', color: '#27500A', cursor: 'pointer' }}
              >
                <CheckCircle2 size={13} /> Resolve
              </button>
              <button
                onClick={() => deleteMutation.mutate(entry.id)}
                style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────
export default function ListsPage() {
  const [activeTab, setActiveTab] = useState<'samples' | 'kits' | 'working' | 'watchlist'>('samples');

  const { data: samplesData = [] } = useQuery<any[]>({ queryKey: ['/api/lists/samples-sent'] });
  const { data: kitsData = [] } = useQuery<any[]>({ queryKey: ['/api/lists/press-kits-sent'] });
  const { data: workingData = [] } = useQuery<any[]>({ queryKey: ['/api/lists/working-on'] });
  const { data: watchlistData = [] } = useQuery<any[]>({ queryKey: ['/api/lists/watchlist'] });

  const overdueKits = (kitsData as any[]).filter((r: any) => r.urgency === 'overdue').length;

  const tabs = [
    { key: 'samples', label: 'Samples Sent', count: samplesData.length, icon: <Beaker size={14} />, urgentCount: 0 },
    { key: 'kits',    label: 'Press Kits',   count: kitsData.length, icon: <Package size={14} />, urgentCount: overdueKits },
    { key: 'working', label: 'Working On',   count: workingData.length, icon: <ClipboardList size={14} />, urgentCount: 0 },
    { key: 'watchlist', label: 'Watch List', count: watchlistData.length, icon: <Eye size={14} />, urgentCount: 0 },
  ];

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>Lists</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
          Intelligence dashboard — customers and leads that need attention
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px',
                fontSize: '13px', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                background: 'transparent', border: 'none',
                borderBottom: isActive ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                cursor: 'pointer', marginBottom: '-0.5px',
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  fontSize: '11px', fontWeight: 600,
                  padding: '1px 6px', borderRadius: '20px',
                  background: tab.urgentCount > 0 ? '#FFE9E9' : 'var(--color-background-secondary)',
                  color: tab.urgentCount > 0 ? '#A32D2D' : 'var(--color-text-secondary)',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', minHeight: '300px' }}>
        {activeTab === 'samples'   && <SamplesSentTab />}
        {activeTab === 'kits'      && <PressKitsTab />}
        {activeTab === 'working'   && <WorkingOnTab />}
        {activeTab === 'watchlist' && <WatchListTab />}
      </div>
    </div>
  );
}
