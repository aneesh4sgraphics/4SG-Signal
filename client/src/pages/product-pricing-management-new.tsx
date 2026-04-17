import { useState, useMemo, useRef } from 'react';
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

function livePerSheet(rateStr: string, sqm: number): string {
  const r = parseFloat(rateStr);
  if (isNaN(r) || r <= 0 || sqm <= 0) return '—';
  return '$' + (r * sqm).toFixed(4);
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // editMap[productId][tierKey] = $/m² rate string the user typed
  const [editMap, setEditMap] = useState<Record<number, Record<string, string>>>({});
  // Per-family active tier tab
  const [activeTierMap, setActiveTierMap] = useState<Record<string, TierKey>>({});
  // Per-family bulk fill tier selection
  const [bulkTierMap, setBulkTierMap] = useState<Record<string, TierKey>>({});
  // Per-family bulk fill $/m² input
  const [bulkRateMap, setBulkRateMap] = useState<Record<string, string>>({});
  // Recently saved families (show ✓ Saved badge)
  const [savedFamilies, setSavedFamilies] = useState<Set<string>>(new Set());
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

  // ── Build sidebar category stats ────────────────────────────────────────────
  const categoryStats = useMemo(() => {
    return categoriesData.map(cat => {
      const catFamilies = families.filter(f => f.categoryId === cat.id);
      const totalProducts = catFamilies.reduce((s, f) => s + f.products.length, 0);
      const missingPricing = catFamilies.filter(f => !isFullyPriced(f)).length;
      return { ...cat, familyCount: catFamilies.length, productCount: totalProducts, missingPricing };
    }).filter(c => c.familyCount > 0);
  }, [categoriesData, families]);

  // ── Global stats ────────────────────────────────────────────────────────────
  const totalFamilies = families.length;
  const missingFamilies = families.filter(f => !isFullyPriced(f)).length;

  // ── Filtered families ────────────────────────────────────────────────────────
  const filteredFamilies = useMemo(() => {
    let list = families;
    if (selectedCategoryId !== null) {
      list = list.filter(f => f.categoryId === selectedCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      list = list.filter(f =>
        f.baseCode.includes(q) || f.products.some(p => p.itemCode.toUpperCase().includes(q))
      );
    }
    return list;
  }, [families, selectedCategoryId, searchQuery]);

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
  const getActiveTier = (baseCode: string): TierKey => activeTierMap[baseCode] ?? TIERS[0].key;
  const getBulkTier = (baseCode: string): TierKey => bulkTierMap[baseCode] ?? TIERS[0].key;
  const getBulkRate = (baseCode: string): string => bulkRateMap[baseCode] ?? '';

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

  // ── Bulk apply ────────────────────────────────────────────────────────────────
  const applyBulk = (family: Family, mode: 'all' | 'blanks') => {
    const tierKey = getBulkTier(family.baseCode);
    const rate = getBulkRate(family.baseCode);
    if (!rate) {
      toast({ title: 'Enter a $/m² rate in the bulk fill row first', variant: 'destructive' });
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
    // Switch active tab to the applied tier so user can see the result
    setActiveTierMap(prev => ({ ...prev, [family.baseCode]: tierKey }));
    toast({
      title: mode === 'all' ? 'Applied to all sizes' : 'Filled blank sizes',
      description: `${family.baseCode} — ${TIERS.find(t => t.key === tierKey)?.label} updated. Click Save to persist.`,
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
      setSavedFamilies(prev => new Set([...prev, family.baseCode]));
      setTimeout(() => {
        setSavedFamilies(prev => { const s = new Set(prev); s.delete(family.baseCode); return s; });
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
      if (!res.ok) throw new Error('Sync failed');
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
      toast({ title: 'Sync complete' });
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
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left sidebar */}
          <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--color-border-secondary)', display: 'flex', flexDirection: 'column', background: 'var(--color-background-secondary)', overflowY: 'auto' }}>
            <div style={{ padding: '14px 12px 10px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Browse families</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>{totalFamilies}</span> families
                {missingFamilies > 0 && (
                  <span> · <span style={{ color: '#dc2626', fontWeight: 600 }}>{missingFamilies} missing</span></span>
                )}
              </div>
            </div>

            {/* Show All */}
            <div
              onClick={() => setSelectedCategoryId(null)}
              style={{ padding: '8px 12px', cursor: 'pointer', borderLeft: selectedCategoryId === null ? '3px solid #3b82f6' : '3px solid transparent', background: selectedCategoryId === null ? '#EFF6FF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: selectedCategoryId === null ? '#1d4ed8' : 'var(--color-text-primary)' }}>Show All</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{totalFamilies}</span>
            </div>

            {/* Category list */}
            {categoriesLoading && <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Loading…</div>}
            {categoryStats.map(cat => {
              const active = selectedCategoryId === cat.id;
              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(active ? null : cat.id)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent', background: active ? '#EFF6FF' : 'transparent' }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: active ? '#1d4ed8' : 'var(--color-text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{cat.familyCount} families · {cat.productCount} products</div>
                  {cat.missingPricing > 0 && (
                    <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px' }}>{cat.missingPricing} families missing pricing</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Main area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Top bar */}
            <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
                <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '13px', height: '13px', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by product code e.g. GPOLY08, RANG..."
                  style={{ width: '100%', padding: '7px 10px 7px 30px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '13px', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', outline: 'none' }}
                />
              </div>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Clear
                </button>
              )}
              <button
                onClick={syncFromOdoo}
                disabled={syncing}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: '12px', cursor: syncing ? 'default' : 'pointer', color: 'var(--color-text-secondary)', opacity: syncing ? 0.6 : 1 }}>
                <RefreshCcw style={{ width: '12px', height: '12px' }} />
                {syncing ? 'Syncing…' : 'Sync from Odoo'}
              </button>
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                {pricingLoading ? 'Loading…' : `${filteredFamilies.length} famil${filteredFamilies.length === 1 ? 'y' : 'ies'} found`}
              </div>
            </div>

            {/* Family cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pricingLoading && (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>Loading products…</div>
              )}
              {!pricingLoading && filteredFamilies.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
                  {searchQuery ? 'No products match your search.' : selectedCategoryId ? 'No products in this category.' : 'No products found.'}
                </div>
              )}

              {filteredFamilies.map(family => {
                const bc = family.baseCode;
                const dirty = familyHasDirty(family);
                const saving = savingFamilies.has(bc);
                const justSaved = savedFamilies.has(bc);
                const allPriced = isFullyPriced(family);
                const activeTier = getActiveTier(bc);
                const bulkTier = getBulkTier(bc);
                const bulkRate = getBulkRate(bc);

                return (
                  <div key={bc} style={{ border: '1px solid var(--color-border-secondary)', borderRadius: '10px', overflow: 'hidden', background: 'var(--color-background-primary)' }}>

                    {/* Card header */}
                    <div style={{ background: 'var(--color-background-secondary)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>{bc}</span>
                          <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '20px', background: '#F3F4F6', color: '#6B7280', border: '0.5px solid #E5E7EB' }}>
                            {family.products.length} size{family.products.length !== 1 ? 's' : ''}
                          </span>
                          <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '20px', fontWeight: 500, background: allPriced ? '#ECFDF5' : '#FFFBEB', color: allPriced ? '#065F46' : '#92400E', border: `0.5px solid ${allPriced ? '#6EE7B7' : '#FCD34D'}` }}>
                            {allPriced ? 'All priced' : 'Needs pricing'}
                          </span>
                        </div>
                        <button
                          onClick={() => saveFamily(family)}
                          disabled={saving || !dirty}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', border: 'none', background: dirty ? '#1a1a1a' : 'var(--color-border-secondary)', color: dirty ? '#fff' : 'var(--color-text-tertiary)', fontSize: '12px', cursor: dirty ? 'pointer' : 'default', fontWeight: 500, opacity: saving ? 0.6 : 1 }}>
                          {saving ? <RefreshCw style={{ width: '11px', height: '11px' }} /> : <Save style={{ width: '11px', height: '11px' }} />}
                          {saving ? 'Saving…' : 'Save group'}
                        </button>
                      </div>
                      {(family.categoryName || family.typeName) && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                          {[family.categoryName, family.typeName].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>

                    {/* Bulk fill row */}
                    <div style={{ background: '#FFFBEB', borderBottom: '0.5px solid #FDE68A', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', flexShrink: 0 }}>BULK FILL</span>
                      <select
                        value={bulkTier}
                        onChange={e => setBulkTierMap(prev => ({ ...prev, [bc]: e.target.value as TierKey }))}
                        style={{ fontSize: '12px', padding: '4px 8px', border: '0.5px solid #FCD34D', borderRadius: '5px', background: '#fff', color: '#92400E', outline: 'none', cursor: 'pointer' }}>
                        {TIERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#92400E' }}>$</span>
                        <input
                          type="text" inputMode="decimal"
                          value={bulkRate}
                          onChange={e => { if (isDecimalInput(e.target.value)) setBulkRateMap(prev => ({ ...prev, [bc]: e.target.value })); }}
                          placeholder="$/m²"
                          style={{ width: '80px', padding: '4px 6px 4px 16px', border: '0.5px solid #FCD34D', borderRadius: '5px', fontSize: '12px', outline: 'none', background: '#fff' }}
                          onFocus={e => e.target.select()}
                        />
                      </div>
                      <button
                        onClick={() => applyBulk(family, 'all')}
                        style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '0.5px solid #FCD34D', background: '#FEF3C7', cursor: 'pointer', color: '#92400E', fontWeight: 500 }}>
                        Apply to all
                      </button>
                      <button
                        onClick={() => applyBulk(family, 'blanks')}
                        style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '0.5px solid #FCD34D', background: '#FEF3C7', cursor: 'pointer', color: '#92400E', fontWeight: 500 }}>
                        Fill blanks
                      </button>
                    </div>

                    {/* Tier tabs */}
                    <div style={{ borderBottom: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', overflowX: 'auto', display: 'flex', padding: '0 14px', gap: '0' }}>
                      {TIERS.map(tier => {
                        const isActive = activeTier === tier.key;
                        // Check if any product in this family has this tier priced
                        const hasSomePrice = family.products.some(p => {
                          const edited = editMap[p.id]?.[tier.key];
                          if (edited !== undefined && edited !== '') return true;
                          return getStoredPrice(p, tier.key) > 0;
                        });
                        return (
                          <button
                            key={tier.key}
                            onClick={() => setActiveTierMap(prev => ({ ...prev, [bc]: tier.key }))}
                            style={{ padding: '8px 12px', fontSize: '11px', fontWeight: isActive ? 600 : 400, cursor: 'pointer', border: 'none', background: 'transparent', color: isActive ? '#1d4ed8' : hasSomePrice ? 'var(--color-text-secondary)' : '#d1d5db', borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: '-1px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {tier.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* SKU table */}
                    <div style={{ background: 'var(--color-background-primary)' }}>
                      {/* Table header */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 100px 110px', gap: '8px', padding: '6px 14px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Size</div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', textAlign: 'right' }}>Sqm</div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', textAlign: 'right' }}>Min Qty</div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', textAlign: 'right' }}>
                          $/m² ({TIERS.find(t => t.key === activeTier)?.label})
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', textAlign: 'right' }}>Per Sheet</div>
                      </div>
                      {/* Table rows */}
                      {family.products.map(product => {
                        const rateStr = getRateForProduct(product, activeTier);
                        const isEdited = editMap[product.id]?.[activeTier] !== undefined;
                        const perSheet = livePerSheet(rateStr, product.totalSqm);

                        return (
                          <div key={product.id}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 100px 110px', gap: '8px', padding: '6px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', alignItems: 'center', background: isEdited ? '#F9F9FF' : 'var(--color-background-primary)' }}>
                            {/* Size */}
                            <div>
                              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{product.itemCode}</div>
                              {product.size && <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>{product.size}</div>}
                            </div>
                            {/* Sqm */}
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                              {product.totalSqm > 0 ? product.totalSqm.toFixed(2) : '—'}
                            </div>
                            {/* Min Qty */}
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                              {product.minQuantity || 1}
                            </div>
                            {/* $/m² input */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>$</span>
                                <input
                                  type="text" inputMode="decimal"
                                  value={rateStr}
                                  onChange={e => setRate(product.id, activeTier, e.target.value)}
                                  placeholder="—"
                                  style={{ width: '80px', padding: '4px 4px 4px 14px', fontSize: '12px', textAlign: 'right', border: `0.5px solid ${isEdited ? '#6366f1' : 'var(--color-border-secondary)'}`, borderRadius: '5px', background: isEdited ? '#EEF2FF' : 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }}
                                  onFocus={e => e.target.select()}
                                />
                              </div>
                            </div>
                            {/* Per Sheet */}
                            <div style={{ fontSize: '12px', color: perSheet === '—' ? 'var(--color-text-tertiary)' : '#059669', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {perSheet}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Card footer */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', padding: '8px 14px', background: dirty ? '#F5F5FF' : 'var(--color-background-secondary)', borderTop: '0.5px solid var(--color-border-secondary)' }}>
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
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: dirty ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', fontSize: '12px', cursor: dirty ? 'pointer' : 'default' }}>
                        <RotateCcw style={{ width: '11px', height: '11px' }} /> Reset
                      </button>
                      <button
                        onClick={() => saveFamily(family)}
                        disabled={saving || !dirty}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 14px', borderRadius: '6px', border: 'none', background: dirty ? '#1a1a1a' : 'var(--color-border-secondary)', color: dirty ? '#fff' : 'var(--color-text-tertiary)', fontSize: '12px', cursor: dirty ? 'pointer' : 'default', fontWeight: 500, opacity: saving ? 0.6 : 1 }}>
                        {saving ? <RefreshCw style={{ width: '11px', height: '11px' }} /> : <Save style={{ width: '11px', height: '11px' }} />}
                        {saving ? 'Saving…' : 'Save group'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
