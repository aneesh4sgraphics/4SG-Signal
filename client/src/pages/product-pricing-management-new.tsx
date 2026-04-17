import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Save, RefreshCw, ChevronDown, ChevronRight, Check } from 'lucide-react';

const TIERS = [
  { key: 'landedPrice',            label: 'Landed' },
  { key: 'exportPrice',            label: 'Export' },
  { key: 'masterDistributorPrice', label: 'Distributor' },
  { key: 'dealerPrice',            label: 'Dealer-VIP' },
  { key: 'dealer2Price',           label: 'Dealer' },
  { key: 'approvalNeededPrice',    label: 'Shopify Low' },
  { key: 'tierStage25Price',       label: 'Shopify 3' },
  { key: 'tierStage2Price',        label: 'Shopify 2' },
  { key: 'tierStage15Price',       label: 'Shopify 1' },
  { key: 'tierStage1Price',        label: 'Shopify Acct' },
  { key: 'retailPrice',            label: 'Retail' },
];

type TypeRow = {
  typeId: number;
  typeLabel: string;
  typeCode: string;
  categoryId: number | null;
  categoryLabel: string | null;
  sortOrder: number | null;
  isActive: boolean;
  pricing: Record<string, string | null> | null;
};

export default function ProductPricingManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editMap, setEditMap] = useState<Record<number, Record<string, string>>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading, refetch } = useQuery<TypeRow[]>({
    queryKey: ['/api/product-type-pricing'],
    queryFn: async () => {
      const res = await fetch('/api/product-type-pricing', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load pricing');
      return res.json();
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TypeRow[]>();
    for (const row of rows) {
      const cat = row.categoryLabel || 'Uncategorized';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    }
    return map;
  }, [rows]);

  const allCategories = useMemo(() => Array.from(grouped.keys()), [grouped]);

  const totalTypes = rows.length;
  const typesWithPricing = rows.filter(r => {
    if (!r.pricing) return false;
    return TIERS.some(t => {
      const v = r.pricing![t.key];
      return v && parseFloat(v) > 0;
    });
  }).length;

  const getEditValue = (typeId: number, field: string, row: TypeRow): string => {
    if (editMap[typeId]?.[field] !== undefined) return editMap[typeId][field];
    const saved = row.pricing?.[field];
    return saved ? parseFloat(saved).toFixed(4) : '';
  };

  const setEditValue = (typeId: number, field: string, value: string) => {
    setEditMap(prev => ({
      ...prev,
      [typeId]: { ...(prev[typeId] || {}), [field]: value },
    }));
  };

  const hasUnsavedChanges = (typeId: number, row: TypeRow): boolean => {
    const edits = editMap[typeId];
    if (!edits) return false;
    return Object.entries(edits).some(([field, val]) => {
      const saved = row.pricing?.[field];
      const savedNum = saved ? parseFloat(saved).toFixed(4) : '';
      return val !== savedNum && val !== '';
    });
  };

  const saveRow = async (typeId: number, row: TypeRow) => {
    const edits = editMap[typeId] || {};
    const payload: Record<string, string> = {};
    for (const t of TIERS) {
      const editVal = edits[t.key];
      const savedVal = row.pricing?.[t.key];
      const use = editVal !== undefined ? editVal : (savedVal || '');
      if (use) payload[t.key] = use;
    }

    setSavingIds(prev => new Set([...prev, typeId]));
    try {
      const res = await apiRequest('PUT', `/api/product-type-pricing/${typeId}`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Failed to save');
      }
      setEditMap(prev => { const copy = { ...prev }; delete copy[typeId]; return copy; });
      queryClient.invalidateQueries({ queryKey: ['/api/product-type-pricing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
      toast({ title: `✓ ${row.typeLabel} pricing saved`, description: 'All sizes updated automatically' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingIds(prev => { const copy = new Set(prev); copy.delete(typeId); return copy; });
    }
  };

  const isExpanded = (category: string) => {
    if (expandedCategories.size === 0) return true;
    return expandedCategories.has(category);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const base = prev.size === 0 ? new Set(allCategories) : new Set(prev);
      if (base.has(category)) base.delete(category);
      else base.add(category);
      return base;
    });
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        Loading product types...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>Product Pricing</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Enter $/m² per pricing tier. Prices propagate to all sizes of that product type automatically.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: '13px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw style={{ width: '14px', height: '14px' }} />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px', padding: '12px 18px', flex: 1 }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Product types</div>
          <div style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{totalTypes}</div>
        </div>
        <div style={{ background: '#EAF3DE', border: '0.5px solid #97C459', borderRadius: '10px', padding: '12px 18px', flex: 1 }}>
          <div style={{ fontSize: '11px', color: '#3B6D11', marginBottom: '4px' }}>Priced</div>
          <div style={{ fontSize: '22px', fontWeight: 500, color: '#27500A' }}>{typesWithPricing}</div>
        </div>
        <div style={{ background: typesWithPricing < totalTypes ? '#FAEEDA' : '#EAF3DE', border: `0.5px solid ${typesWithPricing < totalTypes ? '#EF9F27' : '#97C459'}`, borderRadius: '10px', padding: '12px 18px', flex: 1 }}>
          <div style={{ fontSize: '11px', color: typesWithPricing < totalTypes ? '#854F0B' : '#3B6D11', marginBottom: '4px' }}>Missing pricing</div>
          <div style={{ fontSize: '22px', fontWeight: 500, color: typesWithPricing < totalTypes ? '#633806' : '#27500A' }}>{totalTypes - typesWithPricing}</div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px repeat(11, 1fr) 80px', gap: '4px', padding: '8px 12px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px 8px 0 0', marginBottom: '1px' }}>
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Product type</div>
        {TIERS.map(t => (
          <div key={t.key} style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.label}
          </div>
        ))}
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Save</div>
      </div>

      {/* Rows grouped by category */}
      {Array.from(grouped.entries()).map(([category, typeRows]) => {
        const expanded = isExpanded(category);
        const catHasMissing = typeRows.some(r => !r.pricing || TIERS.every(t => !r.pricing![t.key] || parseFloat(r.pricing![t.key]!) === 0));

        return (
          <div key={category} style={{ marginBottom: '2px' }}>
            {/* Category header */}
            <div
              onClick={() => toggleCategory(category)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer', userSelect: 'none' }}
            >
              {expanded
                ? <ChevronDown style={{ width: '14px', height: '14px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                : <ChevronRight style={{ width: '14px', height: '14px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              }
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{category}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{typeRows.length} types</span>
              {catHasMissing && (
                <span style={{ fontSize: '10px', background: '#FAEEDA', color: '#854F0B', borderRadius: '4px', padding: '1px 6px', marginLeft: 'auto' }}>
                  missing pricing
                </span>
              )}
            </div>

            {/* Type rows */}
            {expanded && typeRows.map((row) => {
              const isSaving = savingIds.has(row.typeId);
              const isDirty = hasUnsavedChanges(row.typeId, row);
              const hasAnyPrice = row.pricing && TIERS.some(t => {
                const v = row.pricing![t.key];
                return v && parseFloat(v) > 0;
              });

              return (
                <div
                  key={row.typeId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '220px repeat(11, 1fr) 80px',
                    gap: '4px',
                    padding: '6px 12px',
                    background: isDirty ? '#FAFAF5' : 'var(--color-background-primary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderTop: 'none',
                    alignItems: 'center',
                  }}
                >
                  {/* Type name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: hasAnyPrice ? '#639922' : '#EF9F27', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.typeLabel}
                    </span>
                  </div>

                  {/* Price inputs — one per tier */}
                  {TIERS.map(tier => {
                    const val = getEditValue(row.typeId, tier.key, row);
                    const savedVal = row.pricing?.[tier.key];
                    const isEdited = editMap[row.typeId]?.[tier.key] !== undefined &&
                      editMap[row.typeId][tier.key] !== (savedVal ? parseFloat(savedVal).toFixed(4) : '');
                    return (
                      <div key={tier.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: '6px', fontSize: '11px', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={val}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '' || /^(\d+\.?\d*|\.\d*)$/.test(raw)) {
                                setEditValue(row.typeId, tier.key, raw);
                              }
                            }}
                            placeholder="—"
                            style={{
                              width: '72px',
                              padding: '4px 4px 4px 16px',
                              fontSize: '12px',
                              textAlign: 'right',
                              border: `0.5px solid ${isEdited ? '#7F77DD' : 'var(--color-border-secondary)'}`,
                              borderRadius: '6px',
                              background: isEdited ? '#F9F9FF' : 'var(--color-background-primary)',
                              color: 'var(--color-text-primary)',
                              outline: 'none',
                            }}
                            onFocus={e => e.target.select()}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Save button */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={() => saveRow(row.typeId, row)}
                      disabled={isSaving || !isDirty}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: isDirty ? '#1a1a1a' : 'var(--color-background-secondary)',
                        color: isDirty ? '#fff' : 'var(--color-text-tertiary)',
                        fontSize: '12px',
                        cursor: isDirty ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    >
                      {isSaving ? (
                        <RefreshCw style={{ width: '12px', height: '12px' }} />
                      ) : isDirty ? (
                        <Save style={{ width: '12px', height: '12px' }} />
                      ) : (
                        <Check style={{ width: '12px', height: '12px' }} />
                      )}
                      {isSaving ? 'Saving' : isDirty ? 'Save' : ''}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
          No product types found. Make sure products are mapped in the Product Mapping page first.
        </div>
      )}
    </div>
  );
}
