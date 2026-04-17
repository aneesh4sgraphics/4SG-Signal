import { useState, useMemo, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save, RefreshCw, Search, Check, RotateCcw, RefreshCcw } from 'lucide-react';

// ── Pricing tier definitions (10 tiers shown in UI) ──────────────────────────
const TIERS = [
  { key: 'landedPrice',            label: 'Landed' },
  { key: 'exportPrice',            label: 'Export' },
  { key: 'masterDistributorPrice', label: 'Distributor' },
  { key: 'dealerPrice',            label: 'Dealer-VIP' },
  { key: 'dealer2Price',           label: 'Dealer' },
  { key: 'tierStage25Price',       label: 'Shopify 3' },
  { key: 'tierStage2Price',        label: 'Shopify 2' },
  { key: 'tierStage15Price',       label: 'Shopify 1' },
  { key: 'tierStage1Price',        label: 'Shopify Acct' },
  { key: 'retailPrice',            label: 'Retail' },
] as const;

type TierKey = typeof TIERS[number]['key'];
type TabId = 'pricing' | 'odoo';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawProduct {
  id: number;
  itemCode: string;
  productName: string;
  productType: string;
  size: string;
  totalSqm: number;
  minQuantity: number;
  rollSheet: string | null;
  catalogCategoryId: number | null;
  categoryName: string;
  landedPrice: number | string | null;
  exportPrice: number;
  masterDistributorPrice: number;
  dealerPrice: number;
  dealer2Price: number;
  approvalNeededPrice: number;
  tierStage25Price: number;
  tierStage2Price: number;
  tierStage15Price: number;
  tierStage1Price: number;
  retailPrice: number;
}

interface Family {
  baseCode: string;
  categoryId: number | null;
  categoryName: string;
  typeName: string;
  products: RawProduct[];
}

interface Category { id: number; name: string; }

interface OdooProduct {
  id: number;
  itemCode: string;
  productName: string;
  productType: string;
  size: string;
  totalSqm: string;
  rollSheet: string | null;
  minQuantity: number;
  productTypeId: number | null;
  catalogCategoryId: number | null;
  categoryId: number | null;
  categoryName: string | null;
  typeId: number | null;
  typeName: string | null;
  isMapped: boolean;
}

interface PricingCategory { id: number; name: string; }
interface PricingType { id: number; categoryId: number; name: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getBaseCode(itemCode: string): string {
  const idx = itemCode.lastIndexOf('-');
  if (idx <= 0) return itemCode;
  return itemCode.substring(0, idx);
}

function safePrice(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function getStoredPrice(product: RawProduct, key: TierKey): number {
  return safePrice(product[key]);
}

function getDisplayRate(product: RawProduct, key: TierKey): string {
  const price = getStoredPrice(product, key);
  const sqm = product.totalSqm;
  if (!price || !sqm || sqm <= 0) return '';
  return (price / sqm).toFixed(4);
}

function livePerUnit(rateStr: string, sqm: number, rollSheet: string | null, minQty: number): string {
  const r = parseFloat(rateStr);
  if (isNaN(r) || r <= 0 || sqm <= 0) return '';
  const packPrice = r * sqm;
  if (rollSheet === 'Roll') {
    return '$' + packPrice.toFixed(2) + '/roll';
  }
  if (rollSheet === 'Packet' || rollSheet === 'Carton') {
    const sheetPrice = minQty > 1 ? packPrice / minQty : packPrice;
    return '$' + sheetPrice.toFixed(2) + '/sheet';
  }
  return '$' + packPrice.toFixed(2) + '/sheet';
}

function isDecimalInput(v: string) {
  return v === '' || /^(\d+\.?\d*|\.\d*)$/.test(v);
}

function isFullyPriced(family: Family): boolean {
  return family.products.every(p =>
    TIERS.every(t => getStoredPrice(p, t.key) > 0)
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ProductPricingManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Global tab state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('pricing');

  // ── Pricing tab state ───────────────────────────────────────────────────────
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);
  const [formFamilyCode, setFormFamilyCode] = useState<string | null>(null);
  // editMap[productId][tierKey] = $/m² rate string the user typed
  const [editMap, setEditMap] = useState<Record<number, Record<string, string>>>({});
  // Per-tier (column) bulk fill $/m² rate
  const [bulkByTier, setBulkByTier] = useState<Record<string, string>>({});
  // Recently saved families (show ✓ Saved badge)
  const [savedAtMap, setSavedAtMap] = useState<Record<string, number>>({});
  const [savingFamilies, setSavingFamilies] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  // ── Odoo tab state ──────────────────────────────────────────────────────────
  const [odooFilter, setOdooFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [odooSearch, setOdooSearch] = useState('');
  const [mappingProduct, setMappingProduct] = useState<OdooProduct | null>(null);
  const [selCategory, setSelCategory] = useState('');
  const [selType, setSelType] = useState('');
  const [selSize, setSelSize] = useState('');
  const [selSqm, setSelSqm] = useState('0');
  const [selPackingType, setSelPackingType] = useState('');
  const [sheetsPerPack, setSheetsPerPack] = useState('1');

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: pricingRaw, isLoading: pricingLoading, refetch: refetchPricing } =
    useQuery<{ data: RawProduct[] }>({ queryKey: ['/api/product-pricing-database'] });

  const { data: categoriesData = [], isLoading: categoriesLoading } =
    useQuery<Category[]>({ queryKey: ['/api/product-categories'] });

  const { data: odooData, isLoading: odooLoading, refetch: refetchOdoo } =
    useQuery<{ products: OdooProduct[]; total: number; mapped: number; unmapped: number }>({
      queryKey: ['/api/product-pricing/odoo-products'],
      enabled: activeTab === 'odoo',
    });

  const { data: mappingCategoriesData = [] } = useQuery<PricingCategory[]>({
    queryKey: ['/api/product-categories'],
    enabled: !!mappingProduct,
  });
  const { data: typesData = [] } = useQuery<PricingType[]>({
    queryKey: ['/api/product-types'],
    enabled: !!mappingProduct,
  });

  // ── Build families ──────────────────────────────────────────────────────────
  const families = useMemo<Family[]>(() => {
    const products = pricingRaw?.data || [];
    const map = new Map<string, RawProduct[]>();
    for (const p of products) {
      const bc = getBaseCode(p.itemCode);
      const arr = map.get(bc) ?? [];
      arr.push(p);
      map.set(bc, arr);
    }
    return Array.from(map.entries()).map(([baseCode, prods]) => {
      const first = prods[0];
      return {
        baseCode,
        categoryId: first.catalogCategoryId ?? null,
        categoryName: first.categoryName || '',
        typeName: first.productType || '',
        products: prods,
      };
    }).sort((a, b) => a.baseCode.localeCompare(b.baseCode));
  }, [pricingRaw]);

  // ── Category stats for the selector ─────────────────────────────────────────
  const categoryStats = useMemo(() => {
    return categoriesData.map(cat => {
      const catFamilies = families.filter(f => f.categoryId === cat.id);
      const missingPricing = catFamilies.filter(f => !isFullyPriced(f)).length;
      return { ...cat, familyCount: catFamilies.length, missingPricing };
    }).filter(c => c.familyCount > 0);
  }, [categoriesData, families]);

  // ── Families within the selected category ────────────────────────────────────
  const familiesInCategory = useMemo(() => {
    if (!formCategoryId) return [];
    return families.filter(f => f.categoryId === formCategoryId);
  }, [families, formCategoryId]);

  // ── Currently selected family ─────────────────────────────────────────────────
  const selectedFamily = useMemo(() => {
    if (!formFamilyCode) return null;
    return families.find(f => f.baseCode === formFamilyCode) ?? null;
  }, [families, formFamilyCode]);

  // ── Odoo filtered ────────────────────────────────────────────────────────────
  const filteredOdooProducts = useMemo(() => {
    let list = odooData?.products || [];
    if (odooFilter === 'mapped') list = list.filter(p => p.isMapped);
    if (odooFilter === 'unmapped') list = list.filter(p => !p.isMapped);
    if (odooSearch) {
      const q = odooSearch.toLowerCase();
      list = list.filter(p =>
        p.itemCode.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [odooData, odooFilter, odooSearch]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getRateForProduct = (product: RawProduct, tierKey: TierKey): string => {
    const edited = editMap[product.id]?.[tierKey];
    if (edited !== undefined) return edited;
    return getDisplayRate(product, tierKey);
  };

  const setRate = (productId: number, tierKey: string, val: string) => {
    if (!isDecimalInput(val)) return;
    setEditMap(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), [tierKey]: val },
    }));
  };

  const familyHasDirty = (family: Family) =>
    family.products.some(p => Object.keys(editMap[p.id] || {}).length > 0);

  // ── Bulk apply for a specific tier column ────────────────────────────────────
  const applyBulkToTier = (family: Family, tierKey: TierKey, mode: 'all' | 'blanks') => {
    const rate = bulkByTier[tierKey] ?? '';
    if (!rate) {
      toast({ title: `Enter a $/m² rate in the ${TIERS.find(t => t.key === tierKey)?.label} column first`, variant: 'destructive' });
      return;
    }
    setEditMap(prev => {
      const next = { ...prev };
      for (const p of family.products) {
        if (mode === 'blanks') {
          const existing = editMap[p.id]?.[tierKey] ?? getDisplayRate(p, tierKey);
          if (existing) continue;
        }
        next[p.id] = { ...(next[p.id] || {}), [tierKey]: rate };
      }
      return next;
    });
  };

  // ── Reset family ──────────────────────────────────────────────────────────────
  const resetFamily = (family: Family) => {
    setEditMap(prev => {
      const next = { ...prev };
      for (const p of family.products) delete next[p.id];
      return next;
    });
  };

  // ── Save family ───────────────────────────────────────────────────────────────
  const saveFamily = async (family: Family) => {
    const dirtyProducts = family.products.filter(p => Object.keys(editMap[p.id] || {}).length > 0);
    if (!dirtyProducts.length) {
      toast({ title: 'No changes to save' });
      return;
    }
    setSavingFamilies(prev => new Set([...prev, family.baseCode]));
    try {
      const updates = dirtyProducts.map(p => {
        const edits = editMap[p.id] || {};
        const update: Record<string, string | number> = { id: p.id };
        for (const [tierKey, rateStr] of Object.entries(edits)) {
          if (rateStr === '') continue;
          const rate = parseFloat(rateStr);
          if (!isNaN(rate) && rate > 0 && p.totalSqm > 0) {
            update[tierKey] = (rate * p.totalSqm).toFixed(4);
          }
        }
        return update;
      }).filter(u => Object.keys(u).length > 1);

      if (!updates.length) {
        toast({ title: 'No valid prices to save (check sqm values)' });
        return;
      }

      const res = await apiRequest('PATCH', '/api/product-pricing-database/bulk-update-prices', { updates });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || 'Save failed');
      }

      // Clear dirty state for saved products
      setEditMap(prev => {
        const next = { ...prev };
        for (const p of family.products) delete next[p.id];
        return next;
      });

      // Show ✓ Saved for 3 seconds
      setSavedAtMap(prev => ({ ...prev, [family.baseCode]: Date.now() }));
      setTimeout(() => {
        setSavedAtMap(prev => { const next = { ...prev }; delete next[family.baseCode]; return next; });
      }, 3000);

      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
      toast({ title: `Saved ${dirtyProducts.length} product${dirtyProducts.length !== 1 ? 's' : ''}` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingFamilies(prev => { const s = new Set(prev); s.delete(family.baseCode); return s; });
    }
  };

  // ── Sync from Odoo ────────────────────────────────────────────────────────────
  const syncFromOdoo = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest('POST', '/api/admin/sync-prices-from-odoo', {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Sync failed');
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
      toast({ title: 'Sync complete', description: data.message });
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // ── Odoo mapping helpers ──────────────────────────────────────────────────────
  const filteredMappingTypes = useMemo(() =>
    typesData.filter(t => t.categoryId.toString() === selCategory),
    [typesData, selCategory]);

  const parseSizeFromCode = (code: string): string => {
    const explicit = code.match(/(\d+)x(\d+)/i);
    if (explicit) return `${explicit[1]}x${explicit[2]}`;
    const implicit = code.match(/(\d{2})(\d{2})([A-Z]?)$/);
    if (implicit) return `${implicit[1]}x${implicit[2]}`;
    return '';
  };

  const calculateSqm = (size: string, packingType: string, numSheets: number = 1): string => {
    const match = size.match(/(\d+\.?\d*)x(\d+\.?\d*)/i);
    if (!match) return '0';
    const d1 = parseFloat(match[1]), d2 = parseFloat(match[2]);
    const sq = packingType === 'Roll' ? d1 * d2 * 12 : d1 * d2;
    let sqm = sq * 0.00064516;
    if (['Sheets', 'Packet', 'Carton'].includes(packingType)) sqm *= numSheets;
    return sqm.toFixed(4);
  };

  const openMappingDialog = (product: OdooProduct) => {
    setMappingProduct(product);
    setSelCategory(product.categoryId?.toString() || '');
    setSelType(product.typeId?.toString() || '');
    setSelSize(product.size || '');
    setSelSqm(product.totalSqm || '0');
    setSelPackingType(product.rollSheet || '');
    setSheetsPerPack('1');
  };

  const saveMapping = useMutation({
    mutationFn: async () => {
      if (!mappingProduct || !selCategory || !selType) throw new Error('Select category and type');
      const minQty = ['Packet', 'Carton'].includes(selPackingType) ? parseInt(sheetsPerPack) || 1 : 1;
      const res = await apiRequest('PATCH', `/api/products/${mappingProduct.id}/mapping`, {
        catalogCategoryId: parseInt(selCategory),
        productTypeId: parseInt(selType),
        size: selSize || 'Standard',
        totalSqm: selSqm || '0',
        rollSheet: selPackingType,
        minQuantity: minQty,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Product mapped successfully' });
      setMappingProduct(null);
      refetchOdoo();
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
    },
    onError: (e: Error) => toast({ title: 'Mapping failed', description: e.message, variant: 'destructive' }),
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--color-border-secondary)', padding: '0 24px', background: 'var(--color-background-primary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex' }}>
          {([{ id: 'pricing', label: 'Product Pricing' }, { id: 'odoo', label: 'Odoo Products' }] as { id: TabId; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '14px 18px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none', background: 'transparent', color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', borderBottom: activeTab === tab.id ? '2px solid var(--color-text-primary)' : '2px solid transparent', marginBottom: '-1px' }}>
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => { refetchPricing(); if (activeTab === 'odoo') refetchOdoo(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          <RefreshCw style={{ width: '12px', height: '12px' }} /> Refresh
        </button>
      </div>

      {/* ── TAB 1: PRODUCT PRICING ────────────────────────────────────────────── */}
      {activeTab === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          {/* ── Form header: Category + Type selectors ── */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap' }}>
            {/* Category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-tertiary)' }}>Category</label>
              <select
                value={formCategoryId ?? ''}
                onChange={e => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setFormCategoryId(v);
                  setFormFamilyCode(null);
                }}
                style={{ padding: '9px 12px', border: '1px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '13px', background: 'var(--color-background-primary)', color: formCategoryId ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', outline: 'none', cursor: 'pointer', minWidth: '240px' }}>
                <option value="">— Select category —</option>
                {categoryStats.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.missingPricing > 0 ? ` (${c.missingPricing} missing)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '280px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-tertiary)' }}>Type</label>
              <select
                value={formFamilyCode ?? ''}
                onChange={e => setFormFamilyCode(e.target.value || null)}
                disabled={!formCategoryId || pricingLoading}
                style={{ padding: '9px 12px', border: '1px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '13px', background: 'var(--color-background-primary)', color: formFamilyCode ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', outline: 'none', cursor: formCategoryId ? 'pointer' : 'default', opacity: formCategoryId ? 1 : 0.45, minWidth: '280px' }}>
                <option value="">— Select type —</option>
                {familiesInCategory.map(f => (
                  <option key={f.baseCode} value={f.baseCode}>{f.typeName}</option>
                ))}
              </select>
            </div>

            {/* Right side: sync + info */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {selectedFamily && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                  {selectedFamily.products.length} size{selectedFamily.products.length !== 1 ? 's' : ''} · {isFullyPriced(selectedFamily) ? '✓ All priced' : 'Needs pricing'}
                </span>
              )}
              <button
                onClick={syncFromOdoo}
                disabled={syncing}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', fontSize: '12px', cursor: syncing ? 'default' : 'pointer', color: 'var(--color-text-secondary)', opacity: syncing ? 0.6 : 1 }}>
                <RefreshCcw style={{ width: '12px', height: '12px' }} />
                {syncing ? 'Syncing…' : 'Sync from Odoo'}
              </button>
            </div>
          </div>

          {/* ── Empty state ── */}
          {!selectedFamily && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
              {pricingLoading ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Loading products…</div>
              ) : (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    {!formCategoryId ? 'Select a category to get started' : 'Select a product type to view pricing'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                    {formCategoryId ? `${familiesInCategory.length} types available in this category` : `${families.length} product families across ${categoryStats.length} categories`}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Pricing table ── */}
          {selectedFamily && (() => {
            const family = selectedFamily;
            const bc = family.baseCode;
            const dirty = familyHasDirty(family);
            const saving = savingFamilies.has(bc);
            const justSaved = !!savedAtMap[bc];

            // Sticky column widths
            const COL_SIZE = 190;
            const COL_SQM = 72;
            const COL_TIER = 115;
            const stickyBase: CSSProperties = { position: 'sticky', background: 'inherit', zIndex: 2 };

            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Scrollable table */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${COL_SIZE + COL_SQM + TIERS.length * COL_TIER}px` }}>

                    {/* ── Column header row ── */}
                    <thead>
                      <tr style={{ background: 'var(--color-background-secondary)' }}>
                        <th style={{ ...stickyBase, left: 0, width: COL_SIZE, minWidth: COL_SIZE, padding: '8px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border-secondary)', borderRight: '1px solid var(--color-border-secondary)' }}>
                          Size
                        </th>
                        <th style={{ ...stickyBase, left: COL_SIZE, width: COL_SQM, minWidth: COL_SQM, padding: '8px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border-secondary)', borderRight: '2px solid var(--color-border-secondary)' }}>
                          SqM
                        </th>
                        {TIERS.map(tier => {
                          const hasSome = family.products.some(p => {
                            const ed = editMap[p.id]?.[tier.key];
                            return (ed !== undefined && ed !== '') || getStoredPrice(p, tier.key) > 0;
                          });
                          return (
                            <th key={tier.key} style={{ width: COL_TIER, minWidth: COL_TIER, padding: '8px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: hasSome ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border-secondary)', borderRight: '0.5px solid var(--color-border-tertiary)' }}>
                              {tier.label}
                            </th>
                          );
                        })}
                      </tr>

                      {/* ── Bulk fill row ── */}
                      <tr style={{ background: '#FFFBEB' }}>
                        <td style={{ ...stickyBase, left: 0, background: '#FFFBEB', padding: '6px 14px', fontSize: '10px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #FDE68A', borderRight: '1px solid #FDE68A' }}>
                          Bulk Fill
                        </td>
                        <td style={{ ...stickyBase, left: COL_SIZE, background: '#FFFBEB', borderBottom: '1px solid #FDE68A', borderRight: '2px solid #FDE68A' }} />
                        {TIERS.map(tier => (
                          <td key={tier.key} style={{ padding: '5px 6px', borderBottom: '1px solid #FDE68A', borderRight: '0.5px solid #FDE68A', verticalAlign: 'middle', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                              <input
                                type="text" inputMode="decimal"
                                value={bulkByTier[tier.key] ?? ''}
                                onChange={e => { if (isDecimalInput(e.target.value)) setBulkByTier(prev => ({ ...prev, [tier.key]: e.target.value })); }}
                                placeholder="$/m²"
                                onFocus={e => e.target.select()}
                                style={{ width: '88px', padding: '3px 6px', border: '0.5px solid #FCD34D', borderRadius: '4px', fontSize: '11px', outline: 'none', background: '#fff', color: '#92400E', textAlign: 'center' }}
                              />
                              <div style={{ display: 'flex', gap: '3px' }}>
                                <button onClick={() => applyBulkToTier(family, tier.key, 'all')}
                                  style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '3px', border: '0.5px solid #FCD34D', background: '#FEF3C7', cursor: 'pointer', color: '#92400E', fontWeight: 600 }}>
                                  All
                                </button>
                                <button onClick={() => applyBulkToTier(family, tier.key, 'blanks')}
                                  style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '3px', border: '0.5px solid #FCD34D', background: '#FEF3C7', cursor: 'pointer', color: '#92400E' }}>
                                  Blanks
                                </button>
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    </thead>

                    {/* ── Product rows ── */}
                    <tbody>
                      {family.products.map((product, idx) => {
                        const rowEdited = Object.keys(editMap[product.id] || {}).length > 0;
                        const rowBg = rowEdited ? '#F5F5FF' : idx % 2 === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                        return (
                          <tr key={product.id} style={{ background: rowBg }}>
                            {/* SIZE */}
                            <td style={{ ...stickyBase, left: 0, background: rowBg, padding: '8px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', borderRight: '1px solid var(--color-border-secondary)', verticalAlign: 'middle' }}>
                              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{product.itemCode}</div>
                              {product.size && <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{product.size}</div>}
                            </td>
                            {/* SQM */}
                            <td style={{ ...stickyBase, left: COL_SIZE, background: rowBg, padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-tertiary)', borderBottom: '0.5px solid var(--color-border-tertiary)', borderRight: '2px solid var(--color-border-secondary)', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                              {product.totalSqm > 0 ? product.totalSqm.toFixed(4) : '—'}
                            </td>
                            {/* Tier columns */}
                            {TIERS.map(tier => {
                              const rateStr = getRateForProduct(product, tier.key);
                              const isEdited = editMap[product.id]?.[tier.key] !== undefined;
                              const perUnit = livePerUnit(rateStr, product.totalSqm, product.rollSheet, product.minQuantity);
                              return (
                                <td key={tier.key} style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--color-border-tertiary)', borderRight: '0.5px solid var(--color-border-tertiary)', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                    {/* $/m² row: visible $ + input */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1 }}>$</span>
                                      <input
                                        type="text" inputMode="decimal"
                                        value={rateStr}
                                        onChange={e => setRate(product.id, tier.key, e.target.value)}
                                        placeholder="0.0000"
                                        onFocus={e => e.target.select()}
                                        style={{ width: '74px', padding: '4px 5px', fontSize: '12px', textAlign: 'right', border: `0.5px solid ${isEdited ? '#6366f1' : 'var(--color-border-secondary)'}`, borderRadius: '5px', background: isEdited ? '#EEF2FF' : '#fff', color: 'var(--color-text-primary)', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                                      />
                                    </div>
                                    {/* Per-unit row */}
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', minHeight: '14px' }}>
                                      {perUnit}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Footer ── */}
                <div style={{ flexShrink: 0, padding: '10px 24px', borderTop: '1px solid var(--color-border-secondary)', background: dirty ? '#F5F5FF' : 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                  {justSaved && (
                    <span style={{ fontSize: '12px', color: '#059669', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check style={{ width: '12px', height: '12px' }} /> Saved
                    </span>
                  )}
                  {dirty && !justSaved && (
                    <span style={{ fontSize: '11px', color: '#6366f1' }}>
                      {family.products.filter(p => Object.keys(editMap[p.id] || {}).length > 0).length} product(s) changed
                    </span>
                  )}
                  <button
                    onClick={() => resetFamily(family)}
                    disabled={!dirty}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: dirty ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', fontSize: '13px', cursor: dirty ? 'pointer' : 'default' }}>
                    <RotateCcw style={{ width: '12px', height: '12px' }} /> Reset
                  </button>
                  <button
                    onClick={() => saveFamily(family)}
                    disabled={saving || !dirty}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 18px', borderRadius: '7px', border: 'none', background: dirty ? '#1a1a1a' : 'var(--color-border-secondary)', color: dirty ? '#fff' : 'var(--color-text-tertiary)', fontSize: '13px', cursor: dirty ? 'pointer' : 'default', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                    {saving ? <RefreshCw style={{ width: '12px', height: '12px' }} /> : <Save style={{ width: '12px', height: '12px' }} />}
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── TAB 2: ODOO PRODUCTS ────────────────────────────────────────────── */}
      {activeTab === 'odoo' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Filter bar */}
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', maxWidth: '300px', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '13px', height: '13px', color: 'var(--color-text-tertiary)' }} />
              <input type="text" value={odooSearch} onChange={e => setOdooSearch(e.target.value)}
                placeholder="Search products…"
                style={{ width: '100%', padding: '7px 10px 7px 30px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '13px', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', outline: 'none' }} />
            </div>
            {(['all', 'mapped', 'unmapped'] as const).map(f => (
              <button key={f} onClick={() => setOdooFilter(f)}
                style={{ padding: '6px 14px', borderRadius: '20px', border: '0.5px solid', borderColor: odooFilter === f ? 'var(--color-text-primary)' : 'var(--color-border-secondary)', background: odooFilter === f ? 'var(--color-text-primary)' : 'transparent', color: odooFilter === f ? 'var(--color-background-primary)' : 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize' }}>
                {f === 'all' ? `All (${odooData?.total || 0})` : f === 'mapped' ? `Mapped (${odooData?.mapped || 0})` : `Unmapped (${odooData?.unmapped || 0})`}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{filteredOdooProducts.length} shown</div>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 140px 130px 80px 80px 80px', gap: '8px', padding: '7px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
            {['Item Code', 'Product Name', 'Category', 'Type', 'Size', 'SqM', ''].map((h, i) => (
              <div key={i} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {/* Product rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {odooLoading && <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Loading…</div>}
            {!odooLoading && filteredOdooProducts.length === 0 && (
              <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No products found.</div>
            )}
            {filteredOdooProducts.map(product => (
              <div key={product.id}
                style={{ display: 'grid', gridTemplateColumns: '150px 1fr 140px 130px 80px 80px 80px', gap: '8px', padding: '7px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', alignItems: 'center', background: 'var(--color-background-primary)' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.itemCode}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.productName}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.categoryName || '—'}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.typeName || '—'}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{product.size || '—'}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{parseFloat(product.totalSqm || '0') > 0 ? parseFloat(product.totalSqm).toFixed(2) : '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', fontWeight: 500, background: product.isMapped ? '#EAF3DE' : '#FDF3E7', color: product.isMapped ? '#3B6D11' : '#854F0B', border: `0.5px solid ${product.isMapped ? '#97C459' : '#EF9F27'}` }}>
                    {product.isMapped ? 'Mapped' : 'Unmapped'}
                  </span>
                  <button onClick={() => openMappingDialog(product)}
                    style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', cursor: 'pointer', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {product.isMapped ? 'Edit' : 'Map'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Mapping dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!mappingProduct} onOpenChange={() => setMappingProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Map Product</DialogTitle>
            <DialogDescription>Assign category, type, size and dimensions to this product</DialogDescription>
          </DialogHeader>
          {mappingProduct && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-mono text-sm font-medium">{mappingProduct.itemCode}</div>
                <div className="text-sm text-muted-foreground">{mappingProduct.productName}</div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={selCategory} onValueChange={v => { setSelCategory(v); setSelType(''); }}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {mappingCategoriesData.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select value={selType} onValueChange={setSelType} disabled={!selCategory}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {filteredMappingTypes.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Packing Type</Label>
                <Select value={selPackingType} onValueChange={v => {
                  setSelPackingType(v);
                  const parsed = parseSizeFromCode(mappingProduct.itemCode);
                  if (parsed) {
                    setSelSize(parsed);
                    setSelSqm(calculateSqm(parsed, v, parseInt(sheetsPerPack) || 1));
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select packing type" /></SelectTrigger>
                  <SelectContent>
                    {['Sheet', 'Roll', 'Packet', 'Carton'].map(pt => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {['Packet', 'Carton'].includes(selPackingType) && (
                <div className="space-y-2">
                  <Label>Sheets per Pack</Label>
                  <Input type="number" value={sheetsPerPack} onChange={e => {
                    setSheetsPerPack(e.target.value);
                    if (selSize) setSelSqm(calculateSqm(selSize, selPackingType, parseInt(e.target.value) || 1));
                  }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Size (e.g. 12x18)</Label>
                  <Input value={selSize} onChange={e => {
                    setSelSize(e.target.value);
                    if (selPackingType) setSelSqm(calculateSqm(e.target.value, selPackingType, parseInt(sheetsPerPack) || 1));
                  }} />
                </div>
                <div className="space-y-2">
                  <Label>Total m²</Label>
                  <Input value={selSqm} onChange={e => setSelSqm(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingProduct(null)}>Cancel</Button>
            <Button onClick={() => saveMapping.mutate()} disabled={saveMapping.isPending || !selCategory || !selType}>
              {saveMapping.isPending ? 'Saving…' : 'Save Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
