import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Save, RefreshCw, ChevronDown, ChevronRight, Search, Check, ChevronsUpDown,
  Package, Tag
} from 'lucide-react';

// ── Pricing tier definitions ─────────────────────────────────────────────────
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
] as const;

type TierKey = typeof TIERS[number]['key'];
type TabId = 'pricing' | 'odoo';

function getProductTierPrice(product: Product, key: TierKey): string | null {
  return product[key] ?? null;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  itemCode: string;
  productName: string;
  productType: string;
  size: string;
  totalSqm: string;
  rollSheet: string | null;
  landedPrice: string | null;
  exportPrice: string | null;
  masterDistributorPrice: string | null;
  dealerPrice: string | null;
  dealer2Price: string | null;
  approvalNeededPrice: string | null;
  tierStage25Price: string | null;
  tierStage2Price: string | null;
  tierStage15Price: string | null;
  tierStage1Price: string | null;
  retailPrice: string | null;
}

interface Family {
  baseCode: string;
  categoryId: number | null;
  categoryName: string;
  products: Product[];
}

interface BrowseCategory {
  id: number | null;
  name: string;
  families: { baseCode: string; productCount: number; pricedCount: number }[];
}

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function deriveRate(price: string | null, sqm: string): string {
  const p = parseFloat(price || '');
  const s = parseFloat(sqm || '0');
  if (!p || !s || s <= 0) return '';
  return (p / s).toFixed(4);
}

function isDecimalInput(v: string) {
  return v === '' || /^(\d+\.?\d*|\.\d*)$/.test(v);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProductPricingManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('pricing');

  // ── Tab 1 state ────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [searchPrefix, setSearchPrefix] = useState('');
  const [selectedBaseCode, setSelectedBaseCode] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  // editMap[itemCode][tierKey] = rate string
  const [editMap, setEditMap] = useState<Record<string, Record<string, string>>>({});
  // bulkMap[baseCode][tierKey] = rate string (for bulk-apply row)
  const [bulkMap, setBulkMap] = useState<Record<string, Record<string, string>>>({});
  const [savingFamilies, setSavingFamilies] = useState<Set<string>>(new Set());
  const familyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchTimer = useRef<NodeJS.Timeout>();

  // ── Tab 2 state ────────────────────────────────────────────────────────────
  const [odooFilter, setOdooFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [odooSearch, setOdooSearch] = useState('');
  const [mappingProduct, setMappingProduct] = useState<OdooProduct | null>(null);
  const [selCategory, setSelCategory] = useState('');
  const [selType, setSelType] = useState('');
  const [selSize, setSelSize] = useState('');
  const [selSqm, setSelSqm] = useState('0');
  const [selPackingType, setSelPackingType] = useState('');
  const [sheetsPerPack, setSheetsPerPack] = useState('1');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: browseData = [], isLoading: browseLoading, refetch: refetchBrowse } =
    useQuery<BrowseCategory[]>({ queryKey: ['/api/product-pricing/browse'] });

  const { data: families = [], isLoading: familiesLoading, refetch: refetchFamilies } =
    useQuery<Family[]>({
      queryKey: ['/api/product-pricing/search', searchPrefix],
      queryFn: async () => {
        const res = await fetch(`/api/product-pricing/search?prefix=${encodeURIComponent(searchPrefix)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load products');
        return res.json();
      },
    });

  const { data: odooData, isLoading: odooLoading, refetch: refetchOdoo } =
    useQuery<{ products: OdooProduct[]; total: number; mapped: number; unmapped: number }>({
      queryKey: ['/api/product-pricing/odoo-products'],
      enabled: activeTab === 'odoo',
    });

  const { data: categoriesData = [] } = useQuery<PricingCategory[]>({
    queryKey: ['/api/product-categories'],
    enabled: !!mappingProduct,
  });
  const { data: typesData = [] } = useQuery<PricingType[]>({
    queryKey: ['/api/product-types'],
    enabled: !!mappingProduct,
  });

  // ── Browse stats ───────────────────────────────────────────────────────────
  const totalFamilies = useMemo(() => browseData.reduce((n, c) => n + c.families.length, 0), [browseData]);
  const pricedFamilies = useMemo(() =>
    browseData.reduce((n, c) => n + c.families.filter(f => f.pricedCount > 0).length, 0),
    [browseData]);

  // ── Filtered families (main grid) ─────────────────────────────────────────
  const visibleFamilies = useMemo(() => {
    if (!selectedBaseCode) return families;
    return families.filter(f => f.baseCode === selectedBaseCode);
  }, [families, selectedBaseCode]);

  // ── Search debounce ────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchPrefix(searchInput.trim().toUpperCase());
      setSelectedBaseCode(null);
    }, 300);
  }, [searchInput]);

  // ── Category expand/collapse ───────────────────────────────────────────────
  const toggleCat = (name: string) =>
    setExpandedCats(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });

  // ── Family expand/collapse ─────────────────────────────────────────────────
  const toggleFamily = (bc: string) =>
    setExpandedFamilies(prev => { const s = new Set(prev); s.has(bc) ? s.delete(bc) : s.add(bc); return s; });

  const isFamilyExpanded = useCallback((bc: string) => expandedFamilies.has(bc), [expandedFamilies]);

  // ── Navigate to family from browse ────────────────────────────────────────
  const navigateToFamily = (baseCode: string) => {
    setSelectedBaseCode(baseCode);
    setSearchInput(baseCode);
    setSearchPrefix(baseCode);
    setExpandedFamilies(prev => new Set([...prev, baseCode]));
    setTimeout(() => {
      familyRefs.current[baseCode]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  };

  // ── Rate helpers ───────────────────────────────────────────────────────────
  const getRate = (product: Product, tierKey: TierKey): string => {
    const edit = editMap[product.itemCode]?.[tierKey];
    if (edit !== undefined) return edit;
    return deriveRate(getProductTierPrice(product, tierKey), product.totalSqm);
  };

  const setRate = (itemCode: string, tierKey: string, val: string) => {
    if (!isDecimalInput(val)) return;
    setEditMap(prev => ({
      ...prev,
      [itemCode]: { ...(prev[itemCode] || {}), [tierKey]: val },
    }));
  };

  const getBulkRate = (baseCode: string, tierKey: string) => bulkMap[baseCode]?.[tierKey] || '';
  const setBulkRate = (baseCode: string, tierKey: string, val: string) => {
    if (!isDecimalInput(val)) return;
    setBulkMap(prev => ({
      ...prev,
      [baseCode]: { ...(prev[baseCode] || {}), [tierKey]: val },
    }));
  };

  // ── Bulk apply ────────────────────────────────────────────────────────────
  const applyBulk = (family: Family, mode: 'all' | 'blanks') => {
    const bulk = bulkMap[family.baseCode] || {};
    if (Object.keys(bulk).every(k => bulk[k] === '')) {
      toast({ title: 'Enter at least one rate in the bulk row first', variant: 'destructive' });
      return;
    }
    setEditMap(prev => {
      const next = { ...prev };
      for (const product of family.products) {
        const sqm = parseFloat(product.totalSqm || '0');
        for (const [tierKey, rate] of Object.entries(bulk)) {
          if (!rate) continue;
          if (mode === 'blanks') {
            const existing = deriveRate(getProductTierPrice(product, tierKey as TierKey), product.totalSqm);
            if (existing) continue;
          }
          if (sqm <= 0) continue;
          next[product.itemCode] = { ...(next[product.itemCode] || {}), [tierKey]: rate };
        }
      }
      return next;
    });
    toast({ title: mode === 'all' ? 'Applied to all sizes' : 'Filled blank sizes', description: `${family.baseCode} family updated — click Save to persist.` });
  };

  // ── Save family ────────────────────────────────────────────────────────────
  const saveFamily = async (family: Family) => {
    const items = family.products.map(p => ({
      itemCode: p.itemCode,
      rates: editMap[p.itemCode] || {},
    })).filter(i => Object.keys(i.rates).length > 0);

    if (!items.length) {
      toast({ title: 'No changes to save' }); return;
    }
    setSavingFamilies(prev => new Set([...prev, family.baseCode]));
    try {
      const res = await apiRequest('PUT', '/api/product-pricing/save-rates', items);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      const { updated, skipped } = await res.json();
      setEditMap(prev => {
        const next = { ...prev };
        for (const p of family.products) delete next[p.itemCode];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing/search'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing/browse'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
      toast({ title: `Saved ${updated} product${updated !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped — no sqm)` : ''}` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingFamilies(prev => { const s = new Set(prev); s.delete(family.baseCode); return s; });
    }
  };

  const familyHasDirty = (family: Family) =>
    family.products.some(p => Object.keys(editMap[p.itemCode] || {}).length > 0);

  const familyIsFullyPriced = (family: Family) =>
    family.products.every(p => TIERS.some(t => {
      const v = getProductTierPrice(p, t.key);
      return v !== null && parseFloat(v) > 0;
    }));

  // ── Odoo tab helpers ───────────────────────────────────────────────────────
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
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing/browse'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing/search'] });
    },
    onError: (e: Error) => toast({ title: 'Mapping failed', description: e.message, variant: 'destructive' }),
  });

  // ── Grid column template ───────────────────────────────────────────────────
  const GRID = '160px 70px 64px repeat(11, 1fr) 100px';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '100%', overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid var(--color-border-secondary)', padding: '0 24px', background: 'var(--color-background-primary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {([{ id: 'pricing', label: 'Product Pricing' }, { id: 'odoo', label: 'Odoo Products' }] as { id: TabId; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 18px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                border: 'none', background: 'transparent',
                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >{tab.label}</button>
          ))}
        </div>
        <button
          onClick={() => { refetchBrowse(); refetchFamilies(); if (activeTab === 'odoo') refetchOdoo(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw style={{ width: '12px', height: '12px' }} /> Refresh
        </button>
      </div>

      {/* ── TAB 1: PRICING ──────────────────────────────────────────────── */}
      {activeTab === 'pricing' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left browse panel */}
          <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--color-border-secondary)', display: 'flex', flexDirection: 'column', background: 'var(--color-background-secondary)' }}>
            <div style={{ padding: '12px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Browse</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>{totalFamilies}</span> families · <span style={{ color: '#639922', fontWeight: 600 }}>{pricedFamilies}</span> priced
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {browseLoading && <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Loading…</div>}
              {browseData.map(cat => {
                const isOpen = expandedCats.has(cat.name);
                return (
                  <div key={cat.name}>
                    <div
                      onClick={() => toggleCat(cat.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', userSelect: 'none' }}
                    >
                      {isOpen ? <ChevronDown style={{ width: '11px', height: '11px' }} /> : <ChevronRight style={{ width: '11px', height: '11px' }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{cat.families.length}</span>
                    </div>
                    {isOpen && cat.families.map(fam => (
                      <div
                        key={fam.baseCode}
                        onClick={() => navigateToFamily(fam.baseCode)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '4px 10px 4px 22px', cursor: 'pointer', fontSize: '11px',
                          color: selectedBaseCode === fam.baseCode ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                          background: selectedBaseCode === fam.baseCode ? 'var(--color-background-primary)' : 'transparent',
                          borderLeft: selectedBaseCode === fam.baseCode ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                        }}
                      >
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: fam.pricedCount === fam.productCount ? '#639922' : fam.pricedCount > 0 ? '#EF9F27' : '#d1d5db' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{fam.baseCode}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{fam.productCount}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main pricing area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Search + stats bar */}
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
                <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '13px', height: '13px', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search by product code (e.g. GOSF05)…"
                  style={{ width: '100%', padding: '7px 10px 7px 30px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '13px', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', outline: 'none' }}
                />
              </div>
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearchPrefix(''); setSelectedBaseCode(null); }}
                  style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Clear
                </button>
              )}
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                {familiesLoading ? 'Loading…' : `${visibleFamilies.length} famil${visibleFamilies.length === 1 ? 'y' : 'ies'}`}
              </div>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '3px', padding: '6px 12px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Product</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Size</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>SqM</div>
              {TIERS.map(t => (
                <div key={t.key} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase' }}>{t.label}</div>
              ))}
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'center', textTransform: 'uppercase' }}>Actions</div>
            </div>

            {/* Families */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {!familiesLoading && visibleFamilies.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
                  {searchInput ? 'No products match your search.' : 'Select a product family from the browse panel or search above.'}
                </div>
              )}

              {visibleFamilies.map(family => {
                const bc = family.baseCode;
                const expanded = isFamilyExpanded(bc);
                const dirty = familyHasDirty(family);
                const saving = savingFamilies.has(bc);
                const allPriced = familyIsFullyPriced(family);

                return (
                  <div key={bc} ref={el => { familyRefs.current[bc] = el; }} style={{ marginBottom: '2px' }}>
                    {/* Family header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggleFamily(bc)}>
                      {expanded ? <ChevronDown style={{ width: '13px', height: '13px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} /> : <ChevronRight style={{ width: '13px', height: '13px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: allPriced ? '#639922' : '#EF9F27' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{bc}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{family.products.length} size{family.products.length !== 1 ? 's' : ''}</span>
                      {family.categoryName && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', background: 'var(--color-background-primary)', padding: '1px 7px', borderRadius: '20px', border: '0.5px solid var(--color-border-secondary)' }}>{family.categoryName}</span>}
                      {dirty && <span style={{ fontSize: '10px', background: '#EEF0FF', color: '#5048E5', borderRadius: '4px', padding: '1px 6px', marginLeft: 'auto' }}>unsaved changes</span>}
                    </div>

                    {expanded && (
                      <div>
                        {/* Bulk-apply row */}
                        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '3px', padding: '5px 12px', background: '#FAFAF7', borderBottom: '0.5px solid var(--color-border-tertiary)', alignItems: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic', fontWeight: 500 }}>Bulk apply $/m²</div>
                          <div /><div />
                          {TIERS.map(tier => {
                            const val = getBulkRate(bc, tier.key);
                            return (
                              <div key={tier.key} style={{ display: 'flex', justifyContent: 'center' }}>
                                <div style={{ position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--color-text-tertiary)' }}>$</span>
                                  <input
                                    type="text" inputMode="decimal" value={val}
                                    onChange={e => setBulkRate(bc, tier.key, e.target.value)}
                                    placeholder="—"
                                    style={{ width: '60px', padding: '3px 3px 3px 13px', fontSize: '11px', textAlign: 'right', border: `0.5px solid ${val ? '#7F77DD' : 'var(--color-border-secondary)'}`, borderRadius: '5px', background: val ? '#F0EFF9' : 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }}
                                    onFocus={e => e.target.select()}
                                    onClick={e => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); applyBulk(family, 'all'); }}
                              style={{ fontSize: '10px', padding: '4px 7px', borderRadius: '5px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', cursor: 'pointer', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                              All
                            </button>
                            <button onClick={e => { e.stopPropagation(); applyBulk(family, 'blanks'); }}
                              style={{ fontSize: '10px', padding: '4px 7px', borderRadius: '5px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', cursor: 'pointer', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                              Blanks
                            </button>
                          </div>
                        </div>

                        {/* SKU rows */}
                        {family.products.map(product => {
                          const sqm = parseFloat(product.totalSqm || '0');
                          const hasEdits = Object.keys(editMap[product.itemCode] || {}).length > 0;
                          const hasPrice = TIERS.some(t => { const v = getProductTierPrice(product, t.key); return v !== null && parseFloat(v) > 0; });

                          return (
                            <div key={product.itemCode}
                              style={{ display: 'grid', gridTemplateColumns: GRID, gap: '3px', padding: '4px 12px', background: hasEdits ? '#FAFAF5' : 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', alignItems: 'center' }}>
                              {/* Product label */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0, background: hasPrice ? '#639922' : '#d1d5db' }} />
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {product.itemCode}
                                </span>
                              </div>
                              {/* Size */}
                              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.size}</div>
                              {/* SqM */}
                              <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textAlign: 'right' }}>{sqm > 0 ? sqm.toFixed(2) : '—'}</div>
                              {/* Rate inputs */}
                              {TIERS.map(tier => {
                                const val = getRate(product, tier.key);
                                const isEdited = editMap[product.itemCode]?.[tier.key] !== undefined;
                                return (
                                  <div key={tier.key} style={{ display: 'flex', justifyContent: 'center' }}>
                                    <div style={{ position: 'relative' }}>
                                      <span style={{ position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--color-text-tertiary)' }}>$</span>
                                      <input
                                        type="text" inputMode="decimal" value={val}
                                        onChange={e => setRate(product.itemCode, tier.key, e.target.value)}
                                        placeholder="—"
                                        style={{ width: '58px', padding: '3px 3px 3px 12px', fontSize: '11px', textAlign: 'right', border: `0.5px solid ${isEdited ? '#7F77DD' : 'var(--color-border-secondary)'}`, borderRadius: '5px', background: isEdited ? '#F9F9FF' : 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }}
                                        onFocus={e => e.target.select()}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              {/* Placeholder in save column — save is per-family */}
                              <div />
                            </div>
                          );
                        })}

                        {/* Family save bar */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px', background: dirty ? '#F5F5FF' : 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border-secondary)', gap: '8px', alignItems: 'center' }}>
                          {dirty && <span style={{ fontSize: '11px', color: '#5048E5' }}>Changes pending for {family.products.filter(p => Object.keys(editMap[p.itemCode] || {}).length > 0).length} product(s)</span>}
                          <button
                            onClick={() => saveFamily(family)}
                            disabled={saving || !dirty}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', border: 'none', background: dirty ? '#1a1a1a' : 'var(--color-background-primary)', color: dirty ? '#fff' : 'var(--color-text-tertiary)', fontSize: '12px', cursor: dirty ? 'pointer' : 'default', fontWeight: 500, opacity: saving ? 0.6 : 1 }}>
                            {saving ? <RefreshCw style={{ width: '12px', height: '12px' }} /> : dirty ? <Save style={{ width: '12px', height: '12px' }} /> : <Check style={{ width: '12px', height: '12px' }} />}
                            {saving ? 'Saving…' : dirty ? 'Save family' : 'Saved'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ODOO PRODUCTS ───────────────────────────────────────── */}
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

      {/* ── Mapping dialog ─────────────────────────────────────────────── */}
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
                  <SelectContent>{categoriesData.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select value={selType} onValueChange={setSelType} disabled={!selCategory}>
                  <SelectTrigger><SelectValue placeholder={selCategory ? 'Select type' : 'Select category first'} /></SelectTrigger>
                  <SelectContent>{filteredMappingTypes.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Size</Label>
                <div className="flex gap-2">
                  <Input value={selSize} onChange={e => setSelSize(e.target.value)} placeholder="e.g. 12x18" />
                  <Button variant="outline" size="sm" onClick={() => { const s = parseSizeFromCode(mappingProduct.itemCode); if (s) { setSelSize(s); setSelSqm(calculateSqm(s, selPackingType, parseInt(sheetsPerPack) || 1)); } }}>Auto</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Packing Type</Label>
                <Select value={selPackingType} onValueChange={setSelPackingType}>
                  <SelectTrigger><SelectValue placeholder="Select packing type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Roll">Roll</SelectItem>
                    <SelectItem value="Sheets">Sheets</SelectItem>
                    <SelectItem value="Packet">Packet</SelectItem>
                    <SelectItem value="Carton">Carton</SelectItem>
                    <SelectItem value="Unit">Unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {['Packet', 'Carton'].includes(selPackingType) && (
                <div className="space-y-2">
                  <Label>Sheets per {selPackingType}</Label>
                  <Input type="number" min="1" value={sheetsPerPack} onChange={e => setSheetsPerPack(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Total SqM per Pack</Label>
                <div className="flex gap-2">
                  <Input value={selSqm} onChange={e => setSelSqm(e.target.value)} placeholder="0.0000" />
                  <Button variant="outline" size="sm" onClick={() => { if (selSize) setSelSqm(calculateSqm(selSize, selPackingType, parseInt(sheetsPerPack) || 1)); }}>Calculate</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingProduct(null)}>Cancel</Button>
            <Button onClick={() => saveMapping.mutate()} disabled={saveMapping.isPending || !selCategory || !selType}>
              <Save className="h-4 w-4 mr-2" />
              {saveMapping.isPending ? 'Saving…' : 'Save Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
