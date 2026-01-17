import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PRICING_TIERS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { debounce } from "lodash";
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  MoreHorizontal,
  Edit3,
  Trash2,
  ExternalLink,
  Plus,
  RefreshCw,
  X,
  Check,
  ArrowUpDown,
  Users,
  Sparkles,
  Tag,
  Calendar,
  DollarSign,
  Flame,
  ChevronRight,
  Copy,
  ArrowLeft,
} from "lucide-react";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  email2: string | null;
  company: string | null;
  phone: string | null;
  phone2: string | null;
  cell: string | null;
  address1: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  website: string | null;
  isCompany: boolean;
  contactType: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
  tags: string | null;
  note: string | null;
  isHotProspect: boolean;
  odooPartnerId: number | null;
  totalOrders: number;
  totalSpent: string;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'table' | 'cards';
type SortField = 'company' | 'email' | 'updatedAt' | 'createdAt' | 'totalSpent';
type SortOrder = 'asc' | 'desc';

export default function OdooContacts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  // View state - Default to cards view
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // Filters - Default to showing only companies
  const [filters, setFilters] = useState({
    isCompany: true as boolean | null,
    pricingTier: null as string | null,
    hasEmail: null as boolean | null,
    isHotProspect: null as boolean | null,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Debounced search
  const debouncedSetSearch = useCallback(
    debounce((value: string) => setDebouncedSearch(value), 300),
    []
  );

  useEffect(() => {
    debouncedSetSearch(searchQuery);
  }, [searchQuery, debouncedSetSearch]);

  // Fetch contacts
  const { data: contacts = [], isLoading, refetch } = useQuery<Contact[]>({
    queryKey: ['/api/customers'],
    staleTime: 30000,
  });

  // Fetch available partner categories (tags) from Odoo for filter dropdown
  const { data: partnerCategories = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/odoo/partner-categories'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/partner-categories');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch partner IDs for the selected Odoo tag filter (only when a tag is selected)
  const { data: tagFilterPartnerIds } = useQuery<number[]>({
    queryKey: ['/api/odoo/partners-by-category', filters.pricingTier],
    queryFn: async () => {
      if (!filters.pricingTier) return [];
      const res = await fetch(`/api/odoo/partners-by-category/${encodeURIComponent(filters.pricingTier)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!filters.pricingTier,
    staleTime: 60000, // Cache for 1 minute
  });

  // Filter and sort contacts
  const filteredContacts = contacts
    .filter(c => {
      // Search filter
      if (debouncedSearch) {
        const search = debouncedSearch.toLowerCase();
        const searchableFields = [
          c.company, c.firstName, c.lastName, c.email, c.email2, c.phone, c.city
        ].filter(Boolean).map(f => (f as string).toLowerCase());
        if (!searchableFields.some(f => f.includes(search))) return false;
      }
      if (filters.isCompany !== null && c.isCompany !== filters.isCompany) return false;
      // Tag filter: check if the contact's Odoo partner ID is in the list of partners with this tag
      if (filters.pricingTier && tagFilterPartnerIds) {
        if (!c.odooPartnerId || !tagFilterPartnerIds.includes(c.odooPartnerId)) return false;
      }
      if (filters.hasEmail === true && !c.email) return false;
      if (filters.hasEmail === false && c.email) return false;
      if (filters.isHotProspect === true && !c.isHotProspect) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'company':
          aVal = a.company || a.firstName || '';
          bVal = b.company || b.firstName || '';
          break;
        case 'email':
          aVal = a.email || '';
          bVal = b.email || '';
          break;
        case 'totalSpent':
          aVal = parseFloat(a.totalSpent || '0');
          bVal = parseFloat(b.totalSpent || '0');
          break;
        case 'createdAt':
        case 'updatedAt':
          aVal = new Date(a[sortField] || 0).getTime();
          bVal = new Date(b[sortField] || 0).getTime();
          break;
        default:
          aVal = '';
          bVal = '';
      }
      if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

  // Update contact mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const res = await apiRequest('PUT', `/api/customers/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setEditingField(null);
      toast({ title: "Updated", description: "Contact saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    },
  });

  // Inline edit handlers
  const startEdit = (id: string, field: string, currentValue: string) => {
    setEditingField({ id, field });
    setEditValue(currentValue || '');
  };

  const saveEdit = () => {
    if (!editingField) return;
    updateMutation.mutate({ 
      id: editingField.id, 
      updates: { [editingField.field]: editValue || null } 
    });
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Handle keyboard in inline edit
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Select all
  const toggleSelectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  // Toggle single selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  // Get display name
  const getDisplayName = (contact: Contact) => {
    if (contact.company) return contact.company;
    if (contact.firstName || contact.lastName) {
      return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    }
    return contact.email || 'Unnamed Contact';
  };

  // Get initials
  const getInitials = (contact: Contact) => {
    const name = getDisplayName(contact);
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: text });
  };

  // Check if a contact has a valid pricing tier (case-insensitive match)
  const hasPricingTier = (contact: Contact): boolean => {
    if (!contact.pricingTier) return false;
    const tier = contact.pricingTier.toUpperCase();
    return PRICING_TIERS.some(pt => pt.toUpperCase() === tier);
  };

  // Active filters count
  const activeFiltersCount = Object.values(filters).filter(v => v !== null).length;

  // Clear filters
  const clearFilters = () => {
    setFilters({
      isCompany: null,
      pricingTier: null,
      hasEmail: null,
      isHotProspect: null,
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Notion-style Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Link href="/">
              <span className="hover:text-gray-900 cursor-pointer">Home</span>
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Companies</span>
          </div>
          
          {/* Title Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Companies</h1>
                <p className="text-sm text-gray-500">{filteredContacts.length.toLocaleString()} companies</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="text-gray-600 hover:text-gray-900"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-[105px] z-30 bg-white border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-violet-100 focus:border-violet-300 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Filter Button */}
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 bg-violet-100 text-violet-700">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowUpDown className="w-4 h-4" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setSortField('updatedAt'); setSortOrder('desc'); }}>
                  Recently Updated
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('createdAt'); setSortOrder('desc'); }}>
                  Recently Created
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('company'); setSortOrder('asc'); }}>
                  Name A-Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('company'); setSortOrder('desc'); }}>
                  Name Z-A
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('totalSpent'); setSortOrder('desc'); }}>
                  Highest Value
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'table' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'cards' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-4 flex flex-wrap items-center gap-3">
                  {/* Type Filter */}
                  <Select
                    value={filters.isCompany === null ? 'all' : filters.isCompany ? 'company' : 'person'}
                    onValueChange={(v) => setFilters(f => ({ 
                      ...f, 
                      isCompany: v === 'all' ? null : v === 'company' 
                    }))}
                  >
                    <SelectTrigger className="w-[140px] bg-white">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="company">Companies</SelectItem>
                      <SelectItem value="person">People</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Tags Filter */}
                  <Select
                    value={filters.pricingTier || 'all'}
                    onValueChange={(v) => setFilters(f => ({ ...f, pricingTier: v === 'all' ? null : v }))}
                  >
                    <SelectTrigger className="w-[160px] bg-white">
                      <SelectValue placeholder="Tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tags</SelectItem>
                      {partnerCategories.map(category => (
                        <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Has Email */}
                  <Select
                    value={filters.hasEmail === null ? 'all' : filters.hasEmail ? 'yes' : 'no'}
                    onValueChange={(v) => setFilters(f => ({ 
                      ...f, 
                      hasEmail: v === 'all' ? null : v === 'yes' 
                    }))}
                  >
                    <SelectTrigger className="w-[140px] bg-white">
                      <SelectValue placeholder="Email" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Email</SelectItem>
                      <SelectItem value="yes">Has Email</SelectItem>
                      <SelectItem value="no">No Email</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Hot Prospects */}
                  <Button
                    variant={filters.isHotProspect ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setFilters(f => ({ 
                      ...f, 
                      isHotProspect: f.isHotProspect ? null : true 
                    }))}
                    className="gap-2"
                  >
                    <Flame className={`w-4 h-4 ${filters.isHotProspect ? 'text-orange-500' : ''}`} />
                    Hot Prospects
                  </Button>

                  {activeFiltersCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="text-gray-500"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Loading contacts...
            </div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No contacts found</h3>
            <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <AnimatePresence>
                  {filteredContacts.slice(0, 100).map((contact, index) => (
                    <motion.tr
                      key={contact.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="group hover:bg-violet-50/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/odoo-contacts/${contact.id}`)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium ${
                            contact.isCompany 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-violet-100 text-violet-700'
                          }`}>
                            {contact.isCompany ? <Building2 className="w-4 h-4" /> : getInitials(contact)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{getDisplayName(contact)}</span>
                              {contact.isHotProspect && <Flame className="w-4 h-4 text-orange-500" />}
                            </div>
                            {contact.isCompany && contact.firstName && (
                              <span className="text-xs text-gray-500">{contact.firstName} {contact.lastName}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {editingField?.id === contact.id && editingField?.field === 'email' ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                          </div>
                        ) : (
                          <div 
                            className="flex items-center gap-2 group/email"
                            onClick={e => { e.stopPropagation(); startEdit(contact.id, 'email', contact.email || ''); }}
                          >
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700 group-hover/email:text-violet-600">
                              {contact.email || <span className="text-gray-400 italic">Add email...</span>}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">{contact.phone || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {contact.city || contact.province ? (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">
                              {[contact.city, contact.province].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.pricingTier ? (
                          <Badge variant="secondary" className="capitalize bg-gray-100 text-gray-700">
                            {contact.pricingTier}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/odoo-contacts/${contact.id}`)}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/clients/${contact.id}`}>
                                <Edit3 className="w-4 h-4 mr-2" />
                                Edit in CRM
                              </Link>
                            </DropdownMenuItem>
                            {contact.email && (
                              <DropdownMenuItem onClick={() => copyToClipboard(contact.email!)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Email
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {filteredContacts.length > 100 && (
              <div className="px-4 py-3 bg-gray-50 text-center text-sm text-gray-500">
                Showing 100 of {filteredContacts.length} contacts. Use search to find more.
              </div>
            )}
          </div>
        ) : (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {filteredContacts.slice(0, 100).map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <Card 
                    className={`group hover:shadow-lg transition-all duration-200 cursor-pointer ${
                      !hasPricingTier(contact)
                        ? 'bg-red-50 border-red-200 hover:border-red-300' 
                        : 'bg-white hover:border-violet-200'
                    }`}
                    onClick={() => navigate(`/odoo-contacts/${contact.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold ${
                          contact.isCompany 
                            ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700' 
                            : 'bg-gradient-to-br from-violet-100 to-purple-200 text-violet-700'
                        }`}>
                          {contact.isCompany ? <Building2 className="w-6 h-6" /> : getInitials(contact)}
                        </div>
                        <div className="flex items-center gap-1">
                          {contact.isHotProspect && (
                            <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                              <Flame className="w-4 h-4 text-orange-500" />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <h3 className="font-semibold text-gray-900 mb-1 truncate group-hover:text-violet-700 transition-colors">
                        {getDisplayName(contact)}
                      </h3>
                      
                      {contact.isCompany && contact.firstName && (
                        <p className="text-sm text-gray-500 mb-2 truncate">
                          {contact.firstName} {contact.lastName}
                        </p>
                      )}
                      
                      <div className="space-y-1.5 mt-3">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {(contact.city || contact.province) && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{[contact.city, contact.province].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-3">
                        {hasPricingTier(contact) ? (
                          <Badge variant="secondary" className="capitalize text-xs">
                            {contact.pricingTier}
                          </Badge>
                        ) : contact.pricingTier ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {contact.pricingTier}
                            </Badge>
                            <Badge variant="destructive" className="text-xs">
                              Need Pricing Tier
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            No Pricing Tier
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!detailContact} onOpenChange={() => setDetailContact(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          {detailContact && (
            <>
              <SheetHeader className="pb-4 border-b">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-semibold ${
                    detailContact.isCompany 
                      ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700' 
                      : 'bg-gradient-to-br from-violet-100 to-purple-200 text-violet-700'
                  }`}>
                    {detailContact.isCompany ? <Building2 className="w-7 h-7" /> : getInitials(detailContact)}
                  </div>
                  <div className="flex-1">
                    <SheetTitle className="text-xl flex items-center gap-2">
                      {getDisplayName(detailContact)}
                      {detailContact.isHotProspect && <Flame className="w-5 h-5 text-orange-500" />}
                    </SheetTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize">
                        {detailContact.isCompany ? 'Company' : 'Person'}
                      </Badge>
                      {detailContact.pricingTier && (
                        <Badge variant="secondary" className="capitalize">
                          {detailContact.pricingTier}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-6">
                {/* Contact Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Contact Information</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-gray-900">{detailContact.email || '—'}</p>
                      </div>
                      {detailContact.email && (
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(detailContact.email!)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="text-gray-900">{detailContact.phone || '—'}</p>
                      </div>
                    </div>

                    {detailContact.cell && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <Phone className="w-5 h-5 text-gray-400" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">Mobile</p>
                          <p className="text-gray-900">{detailContact.cell}</p>
                        </div>
                      </div>
                    )}

                    {detailContact.website && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <Globe className="w-5 h-5 text-gray-400" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">Website</p>
                          <a href={detailContact.website} target="_blank" rel="noopener" className="text-violet-600 hover:underline">
                            {detailContact.website}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address */}
                {(detailContact.address1 || detailContact.city) && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">Address</h4>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          {detailContact.address1 && <p className="text-gray-900">{detailContact.address1}</p>}
                          <p className="text-gray-700">
                            {[detailContact.city, detailContact.province, detailContact.zip].filter(Boolean).join(', ')}
                          </p>
                          {detailContact.country && <p className="text-gray-500">{detailContact.country}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sales Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Sales Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Sales Rep</p>
                      <p className="text-gray-900 font-medium">{detailContact.salesRepName || '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Total Spent</p>
                      <p className="text-gray-900 font-medium">
                        ${parseFloat(detailContact.totalSpent || '0').toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Total Orders</p>
                      <p className="text-gray-900 font-medium">{detailContact.totalOrders || 0}</p>
                    </div>
                    {detailContact.odooPartnerId && (
                      <div className="p-3 rounded-lg bg-gray-50">
                        <p className="text-xs text-gray-500">Odoo ID</p>
                        <p className="text-gray-900 font-medium">{detailContact.odooPartnerId}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {detailContact.note && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">Notes</h4>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-gray-700 whitespace-pre-wrap">{detailContact.note}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t">
                  <Link href={`/clients/${detailContact.id}`}>
                    <Button className="w-full bg-violet-600 hover:bg-violet-700">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Full Profile
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
