import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  AlertCircle, 
  Download,
  Trash2, 
  ChevronDown, 
  CheckCircle, 
  Gem, 
  ShoppingBag, 
  Tag, 
  Search, 
  Check,
  IndianRupee,
  LayoutGrid,
} from 'lucide-react';
import { Card, Button, Input, Alert, Modal, Loader } from '../components/UI';
import { TablePagination } from '../components/TablePagination';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Item } from '../types';
import { useShop } from '../context/ShopContext';
import { formatCurrency, downloadBlob } from '../utils';
import { getPreference, setPreference } from '../utils/storage';
import {
  CATEGORY_OPTIONS,
  getCategoryOption,
  getCanonicalMetal,
  getDefaultPurity,
  getMetalIconBg,
  getPurityIconBg,
  getPurityOptions,
  INVENTORY_CATEGORY_FILTERS,
  JEWELLERY_CATEGORIES,
  METAL_FILTER_OPTIONS,
  normalizeCategory,
  STONE_CATEGORIES,
} from '../features/items/catalog';
import { ExcelIcon, PDFIcon } from '../features/items/catalogIcons';
import { formatMetalName } from '../features/metalRates/display';

const ITEM_STATUS_LABEL_BY_STATUS: Record<string, string> = {
  archived: 'Archived',
  in_stock: 'Stock',
  reserved: 'Reserved',
  sold: 'Sold',
};

const PHONE_VIEWPORT_QUERY = '(max-width: 639px)';
const INVENTORY_FILTERS_KEY_PREFIX = 'inventory-filters:';
const DEFAULT_INVENTORY_FILTERS = {
  metal: 'all',
  category: 'all',
  status: 'in_stock',
} as const;
const INVENTORY_STATUS_FILTERS = new Set(['all', 'in_stock', 'sold']);
const LONG_PRESS_DURATION_MS = 600;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const inferPricingMethod = (item: Item): Item['pricing_method'] => item.pricing_method
  ?? (item.category === 'unique'
    ? 'fixed_rate'
    : item.category === 'other'
      ? 'fixed_making_charge'
      : 'making_charge_per_gram');

interface InventoryFilters {
  metal: string;
  category: string;
  status: string;
}

const parseInventoryFilters = (value: string | null): InventoryFilters => {
  if (!value) return { ...DEFAULT_INVENTORY_FILTERS };
  try {
    const parsed = JSON.parse(value) as Partial<InventoryFilters>;
    const validMetals = new Set(METAL_FILTER_OPTIONS.map((option) => option.value));
    const category = typeof parsed.category === 'string'
      ? normalizeCategory(parsed.category)
      : '';
    return {
      metal: typeof parsed.metal === 'string' && validMetals.has(parsed.metal)
        ? parsed.metal
        : DEFAULT_INVENTORY_FILTERS.metal,
      category: INVENTORY_CATEGORY_FILTERS.has(category)
        ? category
        : DEFAULT_INVENTORY_FILTERS.category,
      status: typeof parsed.status === 'string' && INVENTORY_STATUS_FILTERS.has(parsed.status)
        ? parsed.status
        : DEFAULT_INVENTORY_FILTERS.status,
    };
  } catch {
    return { ...DEFAULT_INVENTORY_FILTERS };
  }
};

const getMetalTone = (item: Item) => {
  const metal = item.item_type === 'stone' ? 'stone' : item.metal.trim().toLowerCase();
  return METAL_FILTER_OPTIONS.some((option) => option.value === metal) ? metal : 'other';
};

const inventoryWeightFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 3,
});

const formatInventoryQtyGrams = (weight: number) => (
  `${inventoryWeightFormatter.format(weight)} g`
);

const formatInventoryWeightGrams = (weight: number) => (
  `${inventoryWeightFormatter.format(weight)} gram`
);

const getInventoryWeightText = (item: Item) => {
  if (item.item_type === 'stone') return `${item.ratti} ratti`;
  if (item.stock_mode === 'weight') {
    return formatInventoryWeightGrams(item.net_weight);
  }
  if (item.pricing_method === 'fixed_rate' || item.category === 'unique') return 'Fixed';
  return formatInventoryWeightGrams(item.net_weight);
};

const subscribeToPhoneViewport = (onChange: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mediaQuery = window.matchMedia(PHONE_VIEWPORT_QUERY);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
};

const getPhoneViewportSnapshot = () =>
  typeof window !== 'undefined'
  && Boolean(window.matchMedia?.(PHONE_VIEWPORT_QUERY).matches);

const usePhoneViewport = () => React.useSyncExternalStore(
  subscribeToPhoneViewport,
  getPhoneViewportSnapshot,
  () => false,
);

type LabelDownloadFormat = 'xlsx' | 'pdf';

interface AddItemButtonProps {
  disabled: boolean;
  onClick: () => void;
}

const AddItemButton: React.FC<AddItemButtonProps> = ({
  disabled,
  onClick,
}) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label="Add Item"
    title="Add Item"
    className="inventory-page__icon-action inventory-page__add-action"
  >
    <Plus className="h-6 w-6" />
  </Button>
);

interface DownloadLabelsMenuProps {
  containerRef: React.RefObject<HTMLDivElement>;
  disabled: boolean;
  isOpen: boolean;
  onDownload: (format: LabelDownloadFormat) => void;
  onToggle: () => void;
}

const DownloadLabelsMenu: React.FC<DownloadLabelsMenuProps> = ({
  containerRef,
  disabled,
  isOpen,
  onDownload,
  onToggle,
}) => (
  <div
    className="inventory-download relative"
    ref={containerRef}
  >
    <Button
      type="button"
      onClick={onToggle}
      variant="primary"
      disabled={disabled}
      aria-label="Download selected item labels"
      aria-controls="inventory-label-download-menu"
      aria-expanded={isOpen}
      aria-haspopup="menu"
      title="Download selected item labels"
      className="inventory-download__trigger inventory-page__icon-action"
    >
      <Download className="h-6 w-6" />
    </Button>

    {isOpen ? (
      <div
        id="inventory-label-download-menu"
        role="menu"
        aria-label="Download selected item labels"
        className="inventory-download__menu inventory-download__menu--standard absolute right-0 z-20 mt-2 flex animate-fade-in flex-col rounded-app-surface border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => onDownload('xlsx')}
          className="inventory-download__option inventory-download__option--xlsx"
        >
          <div className="inventory-download__option-icon text-emerald-600 dark:text-emerald-500">
            <ExcelIcon className="h-6 w-6" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">Excel (.xlsx)</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => onDownload('pdf')}
          className="inventory-download__option inventory-download__option--pdf"
        >
          <div className="inventory-download__option-icon text-red-500 dark:text-red-500">
            <PDFIcon className="h-6 w-6" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">PDF (.pdf)</span>
        </button>
      </div>
    ) : null}
  </div>
);

const ItemStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colorClass = status === 'in_stock'
    ? 'border-emerald-100/50 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400'
    : status === 'sold'
      ? 'border-red-100/50 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400'
      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const dotClass = status === 'in_stock'
    ? 'bg-emerald-500'
    : status === 'sold'
      ? 'bg-red-500'
      : 'bg-slate-400';

  return (
    <span
      className={`flex w-fit flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[0.65rem] font-bold sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm ${colorClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {ITEM_STATUS_LABEL_BY_STATUS[status] ?? status}
    </span>
  );
};

export const Items: React.FC = () => {
  const queryClient = useQueryClient();
  const { canManage, activeMembership } = useShop();
  const isPhoneViewport = usePhoneViewport();
  const shopId = activeMembership?.shop_id ?? '';
  const activeShopRef = React.useRef(shopId);
  const itemsRequestRef = React.useRef(0);
  const entitlementQuery = useQuery({
    queryKey: queryKeys.entitlement(shopId),
    queryFn: () => apiClient.getEntitlement(),
    enabled: Boolean(shopId),
  });
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [itemsLoading, setItemsLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  
  // Search and Filters State
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedMetal, setSelectedMetal] = React.useState('all');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [selectedStatus, setSelectedStatus] = React.useState('in_stock');
  const [filtersReadyShopId, setFiltersReadyShopId] = React.useState<string | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [totalItems, setTotalItems] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);

  // Summary counts
  const [summary, setSummary] = React.useState<{
    total_items: number;
    in_stock: number;
    unique_items: number;
    sold_items: number;
    items_925_count: number;
    metal_summaries: Record<string, {
      in_stock: number;
      sold_items: number;
      unique_items: number;
      purity_counts: Record<string, number>;
    }>;
  }>({
    total_items: 0,
    in_stock: 0,
    unique_items: 0,
    sold_items: 0,
    items_925_count: 0,
    metal_summaries: {},
  });

  // Modal and Mode States
  const [showModal, setShowModal] = React.useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<Item | null>(null);
  const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
  const [expandedItemId, setExpandedItemId] = React.useState<string | null>(null);
  const [availableMetals, setAvailableMetals] = React.useState<Record<string, number[]>>({});
  const [latestItem, setLatestItem] = React.useState<Item | null>(null);
  
  // Custom dropdown overlays toggle states
  const [showCategoryDropdown, setShowCategoryDropdown] = React.useState(false);
  const [showMetalDropdown, setShowMetalDropdown] = React.useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = React.useState(false);
  const [categorySearch, setCategorySearch] = React.useState('');
  
  const [showFormCategoryDropdown, setShowFormCategoryDropdown] = React.useState(false);
  const [showFormMetalDropdown, setShowFormMetalDropdown] = React.useState(false);
  const [showFormPurityDropdown, setShowFormPurityDropdown] = React.useState(false);
  
  const categoryDropdownRef = React.useRef<HTMLDivElement>(null);
  const metalDropdownRef = React.useRef<HTMLDivElement>(null);
  const statusDropdownRef = React.useRef<HTMLDivElement>(null);
  const formCategoryDropdownRef = React.useRef<HTMLDivElement>(null);
  const formMetalDropdownRef = React.useRef<HTMLDivElement>(null);
  const formPurityDropdownRef = React.useRef<HTMLDivElement>(null);
  const [showDownloadDropdown, setShowDownloadDropdown] = React.useState(false);
  const [pressingRowId, setPressingRowId] = React.useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const longPressRef = React.useRef<{
    itemId: string;
    startX: number;
    startY: number;
    timer: number;
  } | null>(null);
  const suppressRowClickRef = React.useRef<string | null>(null);
  
  const [formData, setFormData] = React.useState({
    sku: '',
    barcode: '',
    name: '',
    category: 'jewellery',
    item_type: 'jewellery' as Item['item_type'],
    pricing_method: 'making_charge_per_gram' as Item['pricing_method'],
    stock_mode: 'quantity' as Item['stock_mode'],
    metal: '',
    purity: '92.5',
    net_weight: '',
    making_charge: '',
    fixed_rate: '',
    stock_weight: '',
    ratti: '',
    rate_per_ratti: '',
    quantity: '1',
    notes: '',
  });

  React.useEffect(() => {
    activeShopRef.current = shopId;
    itemsRequestRef.current += 1;
    setItems([]);
    setTotalItems(0);
    setTotalPages(0);
    setSelectedItems(new Set());
    setExpandedItemId(null);
    setEditingItem(null);
    setShowModal(false);
    setCurrentPage(1);
    setSearchTerm('');
    setDebouncedSearch('');
    setError('');
  }, [shopId]);

  React.useEffect(() => {
    let cancelled = false;
    setFiltersReadyShopId(null);
    setItemsLoading(Boolean(shopId));
    setSelectedMetal(DEFAULT_INVENTORY_FILTERS.metal);
    setSelectedCategory(DEFAULT_INVENTORY_FILTERS.category);
    setSelectedStatus(DEFAULT_INVENTORY_FILTERS.status);
    if (!shopId) return () => { cancelled = true; };

    void getPreference(`${INVENTORY_FILTERS_KEY_PREFIX}${shopId}`).then((storedValue) => {
      if (cancelled || activeShopRef.current !== shopId) return;
      const filters = parseInventoryFilters(storedValue);
      setSelectedMetal(filters.metal);
      setSelectedCategory(filters.category);
      setSelectedStatus(filters.status);
      setFiltersReadyShopId(shopId);
    });
    return () => { cancelled = true; };
  }, [shopId]);

  React.useEffect(() => {
    if (!shopId || filtersReadyShopId !== shopId) return;
    void setPreference(
      `${INVENTORY_FILTERS_KEY_PREFIX}${shopId}`,
      JSON.stringify({
        metal: selectedMetal,
        category: selectedCategory,
        status: selectedStatus,
      }),
    );
  }, [filtersReadyShopId, selectedCategory, selectedMetal, selectedStatus, shopId]);

  // Category and Status drop-down options config
  const categoryOptions = CATEGORY_OPTIONS;

  const statusOptions = [
    { value: 'all', label: 'All Status', icon: LayoutGrid, bg: 'bg-orange-50 text-orange-500 dark:bg-orange-950/20 dark:text-orange-400' },
    { value: 'in_stock', label: 'In Stock', icon: CheckCircle, bg: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400' },
    { value: 'sold', label: 'Sold', icon: IndianRupee, bg: 'bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400' },
  ];

  const loadMetals = React.useCallback(async () => {
    const requestedShopId = shopId;
    try {
      const metals = await apiClient.getAvailableMetals();
      if (activeShopRef.current !== requestedShopId) return;
      setAvailableMetals(metals);
      
      const metalKeys = Object.keys(metals);
      if (metalKeys.length > 0) {
        setFormData((prev) => ({
          ...prev,
          metal: metalKeys[0],
          purity: getDefaultPurity(metalKeys[0], metals),
        }));
      }
    } catch (err) {
      console.error('Failed to load available metals:', err);
    }
  }, [shopId]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(target)) {
        setShowCategoryDropdown(false);
      }
      if (metalDropdownRef.current && !metalDropdownRef.current.contains(target)) {
        setShowMetalDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setShowStatusDropdown(false);
      }
      if (formCategoryDropdownRef.current && !formCategoryDropdownRef.current.contains(target)) {
        setShowFormCategoryDropdown(false);
      }
      if (formMetalDropdownRef.current && !formMetalDropdownRef.current.contains(target)) {
        setShowFormMetalDropdown(false);
      }
      if (formPurityDropdownRef.current && !formPurityDropdownRef.current.contains(target)) {
        setShowFormPurityDropdown(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShowDownloadDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  React.useEffect(() => {
    setShowDownloadDropdown(false);
  }, [isPhoneViewport]);

  React.useEffect(() => {
    if (!showDownloadDropdown) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowDownloadDropdown(false);
      dropdownRef.current
        ?.querySelector<HTMLButtonElement>('.inventory-download__trigger')
        ?.focus();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showDownloadDropdown]);

  const loadSummary = React.useCallback(async () => {
    const requestedShopId = shopId;
    try {
      const data = await apiClient.getItemsSummary();
      if (activeShopRef.current !== requestedShopId) return;
      setSummary({ ...data, metal_summaries: data.metal_summaries ?? {} });
    } catch (err) {
      console.warn('Failed to load items summary from backend, calculating locally:', err);
      try {
        const response = await apiClient.getItems();
        const rawItems = Array.isArray(response) ? response : (response && Array.isArray(response.items) ? response.items : []);
        if (rawItems.length > 0) {
          const totalItemsCount = rawItems.reduce((sum, item) => sum + item.quantity, 0);
          const inStockCount = rawItems.filter(item => item.status === 'in_stock').reduce((sum, item) => sum + item.quantity, 0);
          const uniqueCount = rawItems.filter(item => item.category === 'unique').reduce((sum, item) => sum + item.quantity, 0);
          const soldCount = rawItems.filter(item => item.status === 'sold').reduce((sum, item) => sum + item.quantity, 0);
          const items925Count = rawItems.filter(item => item.status === 'in_stock' && item.metal.toLowerCase() === 'silver' && Number(item.purity) === 92.5).reduce((sum, item) => sum + item.quantity, 0);
          
          setSummary({
            total_items: totalItemsCount,
            in_stock: inStockCount,
            unique_items: uniqueCount,
            sold_items: soldCount,
            items_925_count: items925Count,
            metal_summaries: {},
          });
        }
      } catch (innerErr) {
        console.error('Failed to compute local fallback summary:', innerErr);
      }
    }
  }, [shopId]);

  const loadItems = React.useCallback(async () => {
    if (!shopId || filtersReadyShopId !== shopId) return;
    const requestedShopId = shopId;
    const requestId = itemsRequestRef.current + 1;
    itemsRequestRef.current = requestId;
    setItemsLoading(true);
    try {
      const response = await apiClient.getItems({
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        metal: selectedMetal !== 'all' ? selectedMetal : undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      });
      if (
        activeShopRef.current !== requestedShopId
        || itemsRequestRef.current !== requestId
      ) return;

      let itemsList: Item[] = [];
      let total = 0;
      let pages = 0;

      if (Array.isArray(response)) {
        const filtered = response.filter(
          (item) =>
            (item.sku.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
             item.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
             (item.barcode?.includes(debouncedSearch) ?? false)) &&
            (selectedMetal === 'all' || item.metal.toLowerCase() === selectedMetal.toLowerCase()) &&
            (selectedCategory === 'all' || item.category.toLowerCase() === selectedCategory.toLowerCase()) &&
            (selectedStatus === 'all' || item.status.toLowerCase() === selectedStatus.toLowerCase())
        );
        total = filtered.length;
        pages = Math.ceil(total / rowsPerPage);
        const offset = (currentPage - 1) * rowsPerPage;
        itemsList = filtered.slice(offset, offset + rowsPerPage);
      } else if (response && Array.isArray(response.items)) {
        itemsList = response.items;
        total = response.total;
        pages = response.pages;
      }

      setItems(itemsList);
      setTotalItems(total);
      setTotalPages(pages);
      setError('');
    } catch (err) {
      if (itemsRequestRef.current !== requestId) return;
      setError(
        err instanceof Error ? err.message : 'Failed to load items'
      );
    } finally {
      if (itemsRequestRef.current === requestId) setItemsLoading(false);
    }
  }, [shopId, filtersReadyShopId, currentPage, rowsPerPage, debouncedSearch, selectedMetal, selectedCategory, selectedStatus]);

  const loadLatestItem = React.useCallback(async () => {
    const requestedShopId = shopId;
    try {
      const item = await apiClient.getLatestItem();
      if (activeShopRef.current !== requestedShopId) return;
      setLatestItem(item);
    } catch {
      setLatestItem(null);
    }
  }, [shopId]);

  const refreshItems = async () => {
    await Promise.all([loadItems(), loadSummary(), loadLatestItem()]);
  };

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      category: 'jewellery',
      item_type: 'jewellery',
      pricing_method: 'making_charge_per_gram',
      stock_mode: 'quantity',
      metal: 'Silver',
      purity: '92.5',
      net_weight: '',
      making_charge: '',
      fixed_rate: '',
      stock_weight: '',
      ratti: '',
      rate_per_ratti: '',
      quantity: '1',
      notes: '',
      barcode: '',
    });
    setEditingItem(null);
  };

  const openAddItemModal = () => {
    if (entitlementQuery.data && !entitlementQuery.data.can_add_item) {
      setError('This shop has reached its active-item limit. Sell or remove an item, or activate Pro.');
      return;
    }
    if (latestItem && latestItem.item_type !== 'stone' && latestItem.metal.toLowerCase() !== 'stone') {
      const metal = getCanonicalMetal(latestItem.metal, availableMetals);
      setFormData({
        sku: latestItem.sku,
        name: latestItem.name,
        category: normalizeCategory(latestItem.category),
        item_type: 'jewellery',
        pricing_method: inferPricingMethod(latestItem),
        stock_mode: latestItem.stock_mode ?? 'quantity',
        metal,
        purity: String(latestItem.purity),
        net_weight: '',
        making_charge: latestItem.making_charge?.toString() ?? '',
        fixed_rate: latestItem.fixed_rate?.toString() ?? '',
        stock_weight: '',
        ratti: '',
        rate_per_ratti: '',
        quantity: '1',
        notes: '',
        barcode: '',
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const openEditItem = (item: Item) => {
    if (!canManage) return;
    setEditingItem(item);
    const metal = item.item_type === 'stone'
      ? 'stone'
      : getCanonicalMetal(item.metal, availableMetals);
    setFormData({
      sku: item.sku,
      name: item.name,
      category: normalizeCategory(item.category),
      item_type: item.item_type,
      pricing_method: inferPricingMethod(item),
      stock_mode: item.stock_mode ?? 'quantity',
      metal,
      purity: String(item.purity),
      net_weight: String(item.net_weight),
      making_charge: item.making_charge?.toString() ?? '',
      fixed_rate: item.fixed_rate?.toString() ?? '',
      stock_weight: item.stock_weight?.toString() ?? '',
      ratti: item.ratti?.toString() ?? '',
      rate_per_ratti: item.rate_per_ratti?.toString() ?? '',
      quantity: String(item.quantity),
      notes: item.notes ?? '',
      barcode: item.barcode,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  React.useEffect(() => {
    loadMetals();
    loadLatestItem();
  }, [loadMetals, loadLatestItem]);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Debounce search term changes
  React.useEffect(() => {
    if (searchTerm === debouncedSearch) return;
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
      setExpandedItemId(null);
    }, 300);
    return () => clearTimeout(handler);
  }, [debouncedSearch, searchTerm]);

  const handleCategorySelect = (val: string) => {
    setSelectedCategory(val);
    setCurrentPage(1);
    setExpandedItemId(null);
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  const handleStatusSelect = (val: string) => {
    setSelectedStatus(val);
    setCurrentPage(1);
    setExpandedItemId(null);
    setShowStatusDropdown(false);
  };

  const handleMetalSelect = (val: string) => {
    setSelectedMetal(val);
    setCurrentPage(1);
    setExpandedItemId(null);
    setShowMetalDropdown(false);
  };

  const handleFormMetalSelect = (metal: string) => {
    setFormData((current) => {
      if (metal === 'stone') {
        return {
          ...current,
          category: current.item_type === 'stone' ? current.category : 'neelam',
          item_type: 'stone',
          pricing_method: 'rate_per_ratti',
          stock_mode: 'quantity',
          metal: 'stone',
          purity: '0',
          net_weight: '',
          making_charge: '',
          fixed_rate: '',
          stock_weight: '',
          ratti: current.item_type === 'stone' ? current.ratti : '',
          rate_per_ratti: current.item_type === 'stone' ? current.rate_per_ratti : '',
        };
      }
      return {
        ...current,
        category: current.item_type === 'stone' ? 'jewellery' : current.category,
        item_type: 'jewellery',
        pricing_method: current.item_type === 'stone'
          ? 'making_charge_per_gram'
          : current.pricing_method,
        stock_mode: current.item_type === 'stone' ? 'quantity' : current.stock_mode,
        metal,
        purity: getDefaultPurity(metal, availableMetals),
        ratti: '',
        rate_per_ratti: '',
      };
    });
    setShowFormMetalDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const purityValue = formData.purity === 'other'
        ? 0
        : parseFloat(formData.purity);

      const isStone = formData.item_type === 'stone';
      const isFixedRate = formData.pricing_method === 'fixed_rate';
      const isWeighted = formData.stock_mode === 'weight';
      const makingChargeValue = isStone || isFixedRate ? 0 : parseFloat(formData.making_charge);
      const fixedRateValue = isFixedRate ? parseFloat(formData.fixed_rate) : 0;
      if (!isStone && !isFixedRate && Number.isNaN(makingChargeValue)) throw new Error('Making Charge is required');
      if (isFixedRate && (Number.isNaN(fixedRateValue) || fixedRateValue <= 0)) {
        throw new Error('Fixed Rate must be greater than 0');
      }

      const quantityValue = isWeighted ? 1 : parseInt(formData.quantity, 10);
      if (Number.isNaN(quantityValue) || quantityValue <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      const payload = {
        sku: formData.sku,
        barcode: formData.barcode || '',
        category: normalizeCategory(formData.category),
        item_type: formData.item_type,
        pricing_method: formData.pricing_method,
        stock_mode: formData.stock_mode,
        name: formData.name,
        metal: isStone ? 'stone' : formData.metal,
        purity: isStone ? 0 : purityValue,
        net_weight: isStone
          ? 0
          : isFixedRate
            ? parseFloat(formData.net_weight) || 0
            : parseFloat(formData.net_weight),
        making_charge: makingChargeValue,
        fixed_rate: fixedRateValue,
        stock_weight: isWeighted
          ? editingItem?.stock_weight ?? parseFloat(formData.net_weight)
          : null,
        ratti: isStone ? parseFloat(formData.ratti) : null,
        rate_per_ratti: isStone ? parseFloat(formData.rate_per_ratti) : null,
        quantity: quantityValue,
        notes: formData.notes || null,
      };

      if (editingItem) {
        await apiClient.updateItem(editingItem.id, payload);
      } else {
        await apiClient.createItem(payload);
      }

      closeModal();
      await Promise.all([
        refreshItems(),
        queryClient.invalidateQueries({ queryKey: queryKeys.entitlement(shopId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'dashboard', 'analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'change-log'] }),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save item'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelectedItems = async () => {
    if (!canManage || selectedItems.size === 0) return;
    setLoading(true);
    try {
      await apiClient.deleteItems(Array.from(selectedItems));
      setSelectedItems(new Set());
      setShowDeleteConfirmation(false);
      setShowDownloadDropdown(false);
      await Promise.all([
        refreshItems(),
        queryClient.invalidateQueries({ queryKey: queryKeys.entitlement(shopId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'dashboard', 'analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'change-log'] }),
      ]);
    } catch (err) {
      setShowDeleteConfirmation(false);
      setError(
        err instanceof Error ? err.message : 'Failed to delete item'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBatchLabels = async (format: LabelDownloadFormat) => {
    if (!canManage) {
      setError('Your shop role does not allow label downloads.');
      return;
    }

    if (selectedItems.size === 0) {
      setError('Please select at least one item');
      return;
    }

    try {
      const itemIds = Array.from(selectedItems);
      const blob = await apiClient.getBatchLabels(itemIds, format);
      await downloadBlob(blob, `selected-labels.${format}`);
      setSelectedItems(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to download labels'
      );
    }
  };

  const handleSelectItem = (itemId: string) => {
    if (!canManage) return;
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
    if (newSelected.size === 0) setShowDownloadDropdown(false);
  };

  const handleSelectAll = () => {
    if (!canManage) return;
    if (selectedItems.size === items.length && items.length > 0) {
      setSelectedItems(new Set());
      setShowDownloadDropdown(false);
    } else {
      const allIds = new Set(items.map(item => item.id));
      setSelectedItems(allIds);
    }
  };

  const toggleExpandedItem = (itemId: string) => {
    setExpandedItemId((current) => current === itemId ? null : itemId);
  };

  const cancelLongPress = React.useCallback(() => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
    setPressingRowId(null);
  }, []);

  React.useEffect(() => cancelLongPress, [cancelLongPress]);

  const handleRowPointerDown = (
    event: React.PointerEvent<HTMLTableRowElement>,
    item: Item,
  ) => {
    if (
      !canManage
      || item.status !== 'in_stock'
      || (typeof event.button === 'number' && event.button !== 0)
    ) return;
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    cancelLongPress();
    setPressingRowId(item.id);
    const timer = window.setTimeout(() => {
      suppressRowClickRef.current = item.id;
      longPressRef.current = null;
      setPressingRowId(null);
      openEditItem(item);
    }, LONG_PRESS_DURATION_MS);
    longPressRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  };

  const handleRowPointerMove = (event: React.PointerEvent<HTMLTableRowElement>) => {
    const press = longPressRef.current;
    if (!press) return;
    const moved = Math.hypot(
      event.clientX - press.startX,
      event.clientY - press.startY,
    );
    if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) cancelLongPress();
  };

  const handleRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    itemId: string,
  ) => {
    if (suppressRowClickRef.current === itemId) {
      suppressRowClickRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    handleMobileRowClick(event, itemId);
  };

  const handleMobileRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    itemId: string,
  ) => {
    if (window.matchMedia?.('(min-width: 640px)').matches) return;
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    toggleExpandedItem(itemId);
  };

  const purityOptions = getPurityOptions(formData.metal, availableMetals);
  const formMetalOptions = editingItem?.item_type === 'stone'
    ? ['stone']
    : [
        ...Object.keys(availableMetals).filter((metal) => metal.toLowerCase() !== 'stone'),
        ...(editingItem ? [] : ['stone']),
      ];
  const selectedMetalSummary = summary.metal_summaries[selectedMetal];
  const purityCount = (purity: string) => selectedMetalSummary?.purity_counts[purity] ?? 0;
  const goldConfig = getMetalIconBg('gold');
  const silverConfig = getMetalIconBg('silver');
  const platinumConfig = getMetalIconBg('platinum');
  const stoneConfig = getMetalIconBg('stone');
  const summaryCards: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    bg?: string;
  }> = selectedMetal === 'all'
    ? [
        { label: 'Gold Items', value: summary.metal_summaries.gold?.in_stock ?? 0, icon: goldConfig.icon, bg: goldConfig.bg },
        { label: 'Silver Items', value: summary.metal_summaries.silver?.in_stock ?? 0, icon: silverConfig.icon, bg: silverConfig.bg },
        { label: 'Platinum Items', value: summary.metal_summaries.platinum?.in_stock ?? 0, icon: platinumConfig.icon, bg: platinumConfig.bg },
        { label: 'Stones', value: summary.metal_summaries.stone?.in_stock ?? 0, icon: stoneConfig.icon, bg: stoneConfig.bg },
      ]
    : selectedMetal === 'gold'
      ? [
          { label: 'In Stock', value: selectedMetalSummary?.in_stock ?? 0, icon: CheckCircle },
          { label: 'Sold Items', value: selectedMetalSummary?.sold_items ?? 0, icon: ShoppingBag },
          { label: '18K Items', value: purityCount('75'), icon: Gem },
          { label: '22K Items', value: purityCount('91.6'), icon: Tag },
        ]
      : selectedMetal === 'platinum'
        ? [
            { label: 'In Stock', value: selectedMetalSummary?.in_stock ?? 0, icon: CheckCircle },
            { label: 'Sold Items', value: selectedMetalSummary?.sold_items ?? 0, icon: ShoppingBag },
            { label: '900 Items', value: purityCount('90'), icon: Gem },
            { label: '950 Items', value: purityCount('95'), icon: Tag },
          ]
        : [
            { label: 'In Stock', value: selectedMetalSummary?.in_stock ?? 0, icon: CheckCircle },
            { label: 'Sold Items', value: selectedMetalSummary?.sold_items ?? 0, icon: ShoppingBag },
            { label: 'Unique Items', value: selectedMetalSummary?.unique_items ?? 0, icon: Gem },
            { label: '925 Items', value: purityCount('92.5'), icon: Tag },
          ];

  return (
    <div className="app-page min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="app-page__container max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Title and Actions */}
        <div className="app-page__header inventory-page__header mb-8 animate-slide-down">
          <div className="inventory-page__title">
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Inventory</h1>
              <p className="text-slate-400 dark:text-slate-400 mt-1 font-medium">
                {canManage
                  ? 'Add, edit, remove, and print labels for your inventory.'
                  : 'Browse and search your shop inventory.'}
              </p>
          </div>
          {canManage ? <div
            role="group"
            aria-label="Inventory management actions"
            className={`inventory-page__actions ${
              isPhoneViewport ? 'inventory-page__actions--phone' : ''
            }`}
          >
            <AddItemButton disabled={false} onClick={openAddItemModal} />

            {selectedItems.size > 0 ? (
              <>
                <DownloadLabelsMenu
                  containerRef={dropdownRef}
                  disabled={loading}
                  isOpen={showDownloadDropdown}
                  onToggle={() => setShowDownloadDropdown((current) => !current)}
                  onDownload={(format) => {
                    setShowDownloadDropdown(false);
                    void handleDownloadBatchLabels(format);
                  }}
                />
                <Button
                  type="button"
                  variant="danger"
                  disabled={loading}
                  aria-label="Delete selected items"
                  title="Delete selected items"
                  className="inventory-page__icon-action"
                  onClick={() => setShowDeleteConfirmation(true)}
                >
                  <Trash2 className="h-6 w-6" />
                </Button>
              </>
            ) : null}
          </div> : null}
        </div>

        {/* Summary Metrics Cards (Responsive grid with 4 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-slide-down">
          {summaryCards.map(({ label, value, icon: Icon, bg }) => (
            <div key={label} className="inventory-summary-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-app-surface p-5 flex items-center shadow-xs">
              <div className={`${bg ?? 'inventory-summary-icon'} p-3.5 rounded-app-control mr-4`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6">
            <Alert
              type="error"
              title="Error"
              message={error}
              onClose={() => setError('')}
            />
          </div>
        )}

        {/* Search Bar and Dropdown Filters */}
        <div className="inventory-page__filter-layout mb-6 animate-slide-up">
          <div className="inventory-page__filter-search relative">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search by SKU, name, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="inventory-focus-control w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-app-control focus:outline-none transition-all duration-200 shadow-xs placeholder-slate-400 font-medium"
            />
          </div>

          <div className="inventory-page__filter-controls">
          
          {/* Metal Custom Selector */}
          <div className="inventory-page__filter-control inventory-page__filter-control--metal relative" ref={metalDropdownRef}>
            <div
              onClick={() => {
                setShowMetalDropdown(!showMetalDropdown);
                setShowCategoryDropdown(false);
                setShowStatusDropdown(false);
              }}
              className={`inventory-select-trigger relative flex flex-col justify-center px-4 py-2 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none shadow-xs h-full transition-all ${showMetalDropdown ? 'is-open' : ''}`}
            >
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 pointer-events-none">Metal</label>
              <div className="flex items-center justify-between">
                <span className="text-slate-800 dark:text-slate-100 font-bold text-sm truncate">
                  {METAL_FILTER_OPTIONS.find((option) => option.value === selectedMetal)?.label || 'All Metals'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showMetalDropdown ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {showMetalDropdown && (
              <div className="inventory-page__filter-menu absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                {METAL_FILTER_OPTIONS.map((opt) => {
                  const isSelected = opt.value === selectedMetal;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleMetalSelect(opt.value)}
                      className={`inventory-dropdown-option relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`${opt.bg} w-8 h-8 rounded-app-control flex items-center justify-center`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                          {opt.label}
                        </span>
                      </div>
                      {isSelected ? (
                        <div className="inventory-selection-indicator is-selected w-5 h-5 rounded-full border-2 flex items-center justify-center text-white">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="inventory-selection-indicator w-5 h-5 rounded-full border-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Custom Selector */}
          <div className="inventory-page__filter-control inventory-page__filter-control--category relative" ref={categoryDropdownRef}>
            <div 
              onClick={() => {
                setShowCategoryDropdown(!showCategoryDropdown);
                setShowStatusDropdown(false);
              }}
              className={`inventory-select-trigger relative flex flex-col justify-center px-4 py-2 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none shadow-xs h-full transition-all ${showCategoryDropdown ? 'is-open' : ''}`}
            >
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 pointer-events-none">Category</label>
              <div className="flex items-center justify-between">
                <span className="text-slate-800 dark:text-slate-100 font-bold text-sm truncate">
                  {categoryOptions.find(o => o.value === selectedCategory)?.label || 'All Categories'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {showCategoryDropdown && (
              <div className="inventory-page__filter-menu inventory-page__filter-menu--category absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full max-h-80 overflow-y-auto animate-fade-in">
                <div className="relative p-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()} // Prevent close on click
                    className="inventory-focus-control w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-app-control focus:outline-none text-sm placeholder-slate-400 font-medium"
                  />
                </div>

                {categoryOptions
                  .filter(o => o.label.toLowerCase().includes(categorySearch.toLowerCase()))
                  .map((opt) => {
                    const isSelected = opt.value === selectedCategory;
                    const Icon = opt.icon;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => handleCategorySelect(opt.value)}
                        className={`inventory-dropdown-option relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="inventory-option-icon w-8 h-8 rounded-app-control flex items-center justify-center">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                            {opt.label}
                          </span>
                        </div>
                        {isSelected ? (
                          <div className="inventory-selection-indicator is-selected w-5 h-5 rounded-full border-2 flex items-center justify-center text-white">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="inventory-selection-indicator w-5 h-5 rounded-full border-2" />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Status Custom Selector */}
          <div className="inventory-page__filter-control inventory-page__filter-control--status relative" ref={statusDropdownRef}>
            <div 
              onClick={() => {
                setShowStatusDropdown(!showStatusDropdown);
                setShowCategoryDropdown(false);
              }}
              className={`inventory-select-trigger relative flex flex-col justify-center px-4 py-2 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none shadow-xs h-full transition-all ${showStatusDropdown ? 'is-open' : ''}`}
            >
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 pointer-events-none">Status</label>
              <div className="flex items-center justify-between">
                <span className="text-slate-800 dark:text-slate-100 font-bold text-sm truncate">
                  {statusOptions.find(o => o.value === selectedStatus)?.label || 'In Stock'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showStatusDropdown ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {showStatusDropdown && (
              <div className="inventory-page__filter-menu absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                {statusOptions.map((opt) => {
                  const isSelected = opt.value === selectedStatus;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleStatusSelect(opt.value)}
                      className={`inventory-dropdown-option relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`inventory-option-icon w-8 h-8 rounded-app-control flex items-center justify-center ${opt.bg}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                          {opt.label}
                        </span>
                      </div>
                      {isSelected ? (
                        <div className="inventory-selection-indicator is-selected w-5 h-5 rounded-full border-2 flex items-center justify-center text-white">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="inventory-selection-indicator w-5 h-5 rounded-full border-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Items Table */}
        {itemsLoading && !items.length ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : (
          <Card
            aria-busy={itemsLoading}
            className="relative overflow-hidden animate-slide-up bg-white border border-slate-100 dark:border-slate-800 shadow-sm rounded-app-surface"
          >
            {itemsLoading ? (
              <div
                className="inventory-table__progress"
                role="status"
                aria-label="Loading inventory page"
              />
            ) : null}
            <div className="overflow-x-auto">
              <table className="inventory-table w-full table-fixed sm:table-auto">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className={`w-9 px-1 py-3 text-left text-xs font-semibold text-slate-400 sm:w-12 sm:px-5 sm:py-4 ${
                      canManage ? 'table-cell' : 'hidden'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedItems.size === items.length && items.length > 0}
                        onChange={handleSelectAll}
                        disabled={!canManage}
                        aria-label="Select all items on this page"
                        className="checkbox-round"
                      />
                    </th>
                    <th className="hidden px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      SKU
                    </th>
                    <th className="w-[6.5rem] px-2 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:w-auto sm:px-6 sm:py-4 sm:text-xs">
                      Barcode
                    </th>
                    <th className="px-2 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:px-6 sm:py-4 sm:text-xs">
                      Name
                    </th>
                    <th className="hidden px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      Category
                    </th>
                    <th className="hidden whitespace-nowrap px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      Qty
                    </th>
                    <th className="hidden px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      Metal
                    </th>
                    <th className="hidden px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      Weight
                    </th>
                    <th className="hidden whitespace-nowrap px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      Charge / Rate
                    </th>
                    <th className="w-20 px-2 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:w-auto sm:px-6 sm:py-4 sm:text-xs">
                      Status
                    </th>
                    <th className="hidden min-w-48 px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:table-cell">
                      Notes
                    </th>
                    <th className="w-11 px-1 py-3 sm:hidden">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item) => {
                      const isExpanded = expandedItemId === item.id;
                      const detailsId = `inventory-item-details-${item.id}`;
                      const categoryOption = getCategoryOption(item.category);
                      const CategoryIcon = categoryOption.icon;
                      const metalTone = getMetalTone(item);
                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            tabIndex={canManage && item.status === 'in_stock' ? 0 : undefined}
                            aria-label={canManage && item.status === 'in_stock'
                              ? `${item.name}. Hold to edit, or press Enter.`
                              : undefined}
                            onClick={(event) => handleRowClick(event, item.id)}
                            onPointerDown={(event) => handleRowPointerDown(event, item)}
                            onPointerMove={handleRowPointerMove}
                            onPointerUp={cancelLongPress}
                            onPointerCancel={cancelLongPress}
                            onPointerLeave={cancelLongPress}
                            onContextMenu={(event) => {
                              if (canManage && item.status === 'in_stock') event.preventDefault();
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === 'Enter'
                                && event.target === event.currentTarget
                                && canManage
                                && item.status === 'in_stock'
                              ) {
                                event.preventDefault();
                                openEditItem(item);
                              }
                            }}
                            className={`inventory-table__row transition-colors max-sm:cursor-pointer ${
                              selectedItems.has(item.id)
                                ? 'inventory-row--selected'
                                : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                            } ${pressingRowId === item.id ? 'inventory-table__row--pressing' : ''}`}
                          >
                            <td className={`px-1 py-3 sm:px-5 sm:py-5 ${
                              canManage ? 'table-cell' : 'hidden'
                            }`}>
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item.id)}
                                onChange={() => handleSelectItem(item.id)}
                                disabled={!canManage}
                                aria-label={`Select ${item.barcode}`}
                                className="checkbox-round"
                              />
                            </td>
                            <td className="inventory-sku-cell hidden px-6 py-5 sm:table-cell">
                              <span className="inventory-sku-pill font-mono text-sm font-bold tracking-wider text-slate-700 dark:text-slate-300">
                                {item.sku}
                              </span>
                            </td>
                            <td className="min-w-0 px-2 py-3 sm:px-6 sm:py-5">
                              <span
                                title={item.barcode}
                                className="block truncate rounded-app-control border border-amber-100/50 bg-amber-50 px-2 py-1 font-mono text-sm font-bold tracking-wider text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400 sm:inline-block sm:px-3"
                              >
                                {item.barcode}
                              </span>
                            </td>
                            <td className="min-w-0 px-2 py-3 sm:px-6 sm:py-5">
                              <p
                                title={item.name}
                                className="truncate text-sm font-bold text-slate-900 dark:text-white"
                              >
                                {item.name}
                              </p>
                            </td>
                            <td className="hidden px-6 py-5 sm:table-cell">
                              <span className="inventory-category-label inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                <CategoryIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                {categoryOption.label}
                              </span>
                            </td>
                            <td className="hidden whitespace-nowrap px-6 py-5 text-sm font-bold text-slate-800 dark:text-slate-100 sm:table-cell">
                              {item.stock_mode === 'weight'
                                ? formatInventoryQtyGrams(item.stock_weight ?? 0)
                                : item.quantity}
                            </td>
                            <td className="inventory-metal-cell hidden px-6 py-5 sm:table-cell">
                              <span className={`inventory-metal-pill inventory-metal-pill--${metalTone} border px-3 py-1.5 text-sm font-semibold rounded-app-control`}>
                                <span>{item.item_type === 'stone' ? 'Stone' : formatMetalName(item.metal)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{item.item_type === 'stone' ? `${item.ratti} Ratti` : item.purity > 0 ? `${item.purity}%` : 'Unspecified'}</span>
                              </span>
                            </td>
                            <td className="hidden whitespace-nowrap px-6 py-5 text-sm font-medium text-slate-500 dark:text-slate-400 sm:table-cell">
                              {getInventoryWeightText(item)}
                            </td>
                            <td className="hidden whitespace-nowrap px-6 py-5 text-sm font-semibold text-slate-900 dark:text-white sm:table-cell">
                              {item.item_type === 'stone'
                                ? `${formatCurrency(item.rate_per_ratti ?? 0)} / ratti`
                                : item.pricing_method === 'fixed_rate' || item.category === 'unique'
                                  ? formatCurrency(item.fixed_rate ?? 0)
                                  : item.pricing_method === 'fixed_making_charge'
                                    ? `${formatCurrency(item.making_charge)} fixed`
                                    : `${formatCurrency(item.making_charge)} / gram`}
                            </td>
                            <td className="inventory-status-cell px-2 py-3 sm:px-6 sm:py-5">
                              <div className="inventory-status-cell__content">
                                <ItemStatusBadge status={item.status} />
                              </div>
                            </td>
                            <td className="hidden max-w-64 px-6 py-5 text-sm font-medium text-slate-600 dark:text-slate-300 sm:table-cell">
                              <span className="inventory-notes-clamp block" title={item.notes ?? undefined}>
                                {item.notes || '-'}
                              </span>
                            </td>
                            <td className="px-1 py-2 sm:hidden">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={detailsId}
                                aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${item.barcode}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleExpandedItem(item.id);
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-app-control text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              >
                                <ChevronDown
                                  aria-hidden="true"
                                  className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                />
                              </button>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr id={detailsId} className="bg-slate-50/60 dark:bg-slate-950/40 sm:hidden">
                              <td colSpan={canManage ? 5 : 4} className="px-3 pb-4 pt-2">
                                <div className="grid grid-cols-2 gap-3 rounded-app-inset border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                  <div className="col-span-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                      Full barcode
                                    </p>
                                    <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900 dark:text-white">
                                      {item.barcode}
                                    </p>
                                  </div>
                                  <div className="col-span-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                      Item
                                    </p>
                                    <p className="mt-1 break-words text-sm font-bold text-slate-900 dark:text-white">
                                      {item.name}
                                    </p>
                                  </div>
                                  {[
                                    ['SKU', item.sku],
                                    ['Category', categoryOption.label],
                                    ['Qty', item.stock_mode === 'weight' ? formatInventoryQtyGrams(item.stock_weight ?? 0) : String(item.quantity)],
                                    ['Type', item.item_type === 'stone' ? 'Stone' : `${formatMetalName(item.metal)} ${item.purity > 0 ? `${item.purity}%` : '(unspecified)'}`],
                                    ...(item.item_type === 'stone'
                                      ? [
                                          ['Ratti', String(item.ratti ?? '')],
                                          ['Rate per Ratti', formatCurrency(item.rate_per_ratti ?? 0)],
                                          ['HSN / GST', `${item.hsn ?? ''} / ${item.gst_rate_percent ?? ''}%`],
                                        ]
                                      : item.pricing_method === 'fixed_rate' || item.category === 'unique'
                                      ? [
                                          ['Weight', 'Fixed'],
                                          ['Fixed rate', formatCurrency(item.fixed_rate ?? 0)],
                                        ]
                                      : [
                                          ['Weight', formatInventoryWeightGrams(item.net_weight)],
                                          [
                                            item.pricing_method === 'fixed_making_charge' ? 'Fixed making charge' : 'Making charge per gram',
                                            formatCurrency(item.making_charge),
                                          ],
                                        ]),
                                  ].map(([label, value]) => (
                                    <div key={label}>
                                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                        {label}
                                      </p>
                                      <p className="mt-1 break-words text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        {value}
                                      </p>
                                    </div>
                                  ))}
                                  <div className="col-span-2">
                                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                                      Status
                                    </p>
                                    <ItemStatusBadge status={item.status} />
                                  </div>
                                  <div className="col-span-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                      Notes
                                    </p>
                                    <p
                                      className="inventory-notes-clamp mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300"
                                      title={item.notes ?? undefined}
                                    >
                                      {item.notes || '-'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
              {items.length === 0 ? (
                <div className="inventory-empty-state text-slate-400 dark:text-slate-500">
                  <AlertCircle className="h-12 w-12 opacity-30" />
                  <p className="text-base font-semibold text-slate-500 dark:text-slate-400">
                    No items found
                  </p>
                  <p className="text-center text-sm text-slate-400">
                    Try updating your filters, search queries, or add a new item.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>
        )}

        {/* Footer / Pagination controls */}
        {(!itemsLoading || items.length > 0) && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            rowsPerPage={rowsPerPage}
            itemLabel="items"
            loading={itemsLoading}
            onPageChange={(nextPage) => {
              setCurrentPage(nextPage);
              setExpandedItemId(null);
            }}
            onRowsPerPageChange={(rows) => {
              setRowsPerPage(rows);
              setCurrentPage(1);
              setExpandedItemId(null);
            }}
          />
        )}

        <Modal
          isOpen={showDeleteConfirmation && selectedItems.size > 0}
          title={selectedItems.size === 1 ? 'Delete item' : 'Delete items'}
          className="inventory-delete-dialog"
          onClose={() => {
            if (!loading) setShowDeleteConfirmation(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={loading}
                onClick={() => setShowDeleteConfirmation(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                isLoading={loading}
                onClick={() => void handleDeleteSelectedItems()}
              >
                <Trash2 className="h-5 w-5" />
                <span>
                  Delete {selectedItems.size === 1 ? 'item' : `${selectedItems.size} items`}
                </span>
              </Button>
            </>
          }
        >
          <div className="inventory-delete-confirmation">
            <span className="inventory-delete-confirmation__icon" aria-hidden="true">
              <Trash2 />
            </span>
            <div>
              <p className="inventory-delete-confirmation__message">
                {selectedItems.size === 1
                  ? 'Delete the selected item from inventory?'
                  : `Delete ${selectedItems.size} selected items from inventory?`}
              </p>
              <p className="inventory-delete-confirmation__warning">
                This action cannot be undone.
              </p>
            </div>
          </div>
        </Modal>

        {/* Add/Edit Item Modal */}
        <Modal
          isOpen={showModal}
          title={editingItem ? 'Edit Item' : 'Add New Item'}
          size="lg"
          className={editingItem ? 'inventory-edit-modal' : ''}
          onClose={closeModal}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={closeModal}
                className="rounded-app-control px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={loading}
                className="rounded-app-control px-5"
              >
                {editingItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="SKU *"
              placeholder="e.g., GLD-001"
              value={formData.sku}
              onChange={(e) =>
                setFormData({ ...formData, sku: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
              wrapperClassName={formData.item_type === 'stone' ? 'order-2' : 'order-3'}
            />
            <Input
              label="Item Name *"
              placeholder="e.g., Gold Ring"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
              wrapperClassName={formData.item_type === 'stone' ? 'order-2' : 'order-3'}
            />
            {formData.item_type === 'jewellery' ? (
              <>
                <fieldset className="order-2 md:col-span-2">
                  <legend className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Pricing method</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      ['making_charge_per_gram', 'Making charge / gram'],
                      ['fixed_making_charge', 'Fixed making charge'],
                      ['fixed_rate', 'Fixed rate'],
                    ] as const).map(([value, label]) => (
                      <label key={value} className={`inventory-radio-card flex cursor-pointer items-center gap-2 rounded-app-control border p-3 ${formData.pricing_method === value ? 'is-selected' : ''}`}>
                        <input
                          className="inventory-radio"
                          type="radio"
                          name="pricing-method"
                          value={value}
                          checked={formData.pricing_method === value}
                          disabled={formData.stock_mode === 'weight' && value === 'fixed_rate'}
                          onChange={() => setFormData({ ...formData, pricing_method: value })}
                        />
                        <span className="text-sm font-semibold">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="order-2 md:col-span-2">
                  <legend className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Stock is deducted by</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {([['quantity', 'Quantity'], ['weight', 'Weight']] as const).map(([value, label]) => (
                      <label key={value} className={`inventory-radio-card flex cursor-pointer items-center gap-2 rounded-app-control border p-3 ${formData.stock_mode === value ? 'is-selected' : ''}`}>
                        <input
                          className="inventory-radio"
                          type="radio"
                          name="stock-mode"
                          checked={formData.stock_mode === value}
                          onChange={() => setFormData({
                            ...formData,
                            stock_mode: value,
                            pricing_method: value === 'weight' && formData.pricing_method === 'fixed_rate'
                              ? 'making_charge_per_gram'
                              : formData.pricing_method,
                          })}
                        />
                        <span className="text-sm font-semibold">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}
             <div className={`relative ${formData.item_type === 'stone' ? 'order-3' : 'order-4'}`} ref={formCategoryDropdownRef}>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Category *
              </label>
              <div 
                onClick={() => {
                  setShowFormCategoryDropdown(!showFormCategoryDropdown);
                  setShowFormMetalDropdown(false);
                  setShowFormPurityDropdown(false);
                }}
                className={`inventory-select-trigger w-full px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border rounded-app-control focus:outline-none transition-all duration-200 cursor-pointer select-none flex items-center justify-between h-[46px] ${showFormCategoryDropdown ? 'is-open' : ''}`}
              >
                <span className="font-semibold text-sm">
                  {categoryOptions.find(o => o.value === formData.category)?.label || 'Select Category'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showFormCategoryDropdown ? 'rotate-180' : ''}`} />
              </div>

              {showFormCategoryDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full max-h-60 overflow-y-auto animate-fade-in">
                  {categoryOptions.filter((option) => option.value !== 'all' && (
                    formData.item_type === 'stone'
                      ? STONE_CATEGORIES.has(option.value)
                      : JEWELLERY_CATEGORIES.has(option.value)
                  )).map((opt) => {
                    const isSelected = opt.value === formData.category;
                    const Icon = opt.icon;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            category: opt.value,
                          });
                          setShowFormCategoryDropdown(false);
                        }}
                        className={`inventory-dropdown-option relative flex items-center justify-between px-3 py-2 rounded-app-control cursor-pointer select-none transition-all ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="inventory-option-icon w-7 h-7 rounded-app-control flex items-center justify-center">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                            {opt.label}
                          </span>
                        </div>
                        {isSelected ? (
                          <div className="inventory-selection-indicator is-selected w-4 h-4 rounded-full border flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="inventory-selection-indicator w-4 h-4 rounded-full border" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {formData.stock_mode === 'weight' ? (
              <Input
                label="Weight (g) *"
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                value={formData.net_weight}
                onChange={(e) => setFormData({ ...formData, net_weight: e.target.value })}
                required
                className="py-2.5 rounded-app-control"
                wrapperClassName={formData.item_type === 'stone' ? 'order-3' : 'order-4'}
              />
            ) : (
              <Input
                label="Quantity *"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
                className="py-2.5 rounded-app-control"
                wrapperClassName={formData.item_type === 'stone' ? 'order-3' : 'order-4'}
              />
            )}

            <div className="relative order-1" ref={formMetalDropdownRef}>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Metal *
              </label>
              <div
                aria-disabled={editingItem?.item_type === 'stone'}
                onClick={() => {
                  if (editingItem?.item_type === 'stone') return;
                  setShowFormMetalDropdown(!showFormMetalDropdown);
                  setShowFormCategoryDropdown(false);
                  setShowFormPurityDropdown(false);
                }}
                className={`inventory-select-trigger flex h-[46px] w-full select-none items-center justify-between rounded-app-control border bg-white px-4 py-2.5 text-slate-800 transition-all duration-200 focus:outline-none dark:bg-slate-900 dark:text-slate-100 ${editingItem?.item_type === 'stone' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${showFormMetalDropdown ? 'is-open' : ''}`}
              >
                <span className="font-semibold text-sm">
                  {formData.metal ? formatMetalName(formData.metal) : 'Select Metal'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showFormMetalDropdown ? 'rotate-180' : ''}`} />
              </div>

              {showFormMetalDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                  {formMetalOptions.map((metal) => {
                    const isSelected = metal === formData.metal;
                    const config = getMetalIconBg(metal);
                    const Icon = config.icon;
                    return (
                      <div
                        key={metal}
                        onClick={() => handleFormMetalSelect(metal)}
                        className={`inventory-dropdown-option relative flex items-center justify-between px-3 py-2 rounded-app-control cursor-pointer select-none transition-all ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-7 h-7 rounded-app-control flex items-center justify-center ${config.bg}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                            {formatMetalName(metal)}
                          </span>
                        </div>
                        {isSelected ? (
                          <div className="inventory-selection-indicator is-selected w-4 h-4 rounded-full border flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="inventory-selection-indicator w-4 h-4 rounded-full border" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {formData.item_type === 'jewellery' ? <div className="relative order-1" ref={formPurityDropdownRef}>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Purity *
              </label>
              <div 
                onClick={() => {
                  setShowFormPurityDropdown(!showFormPurityDropdown);
                  setShowFormCategoryDropdown(false);
                  setShowFormMetalDropdown(false);
                }}
                className={`inventory-select-trigger w-full px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border rounded-app-control focus:outline-none transition-all duration-200 cursor-pointer select-none flex items-center justify-between h-[46px] ${showFormPurityDropdown ? 'is-open' : ''}`}
              >
                <span className="font-semibold text-sm">
                  {purityOptions.find(o => o.value === formData.purity)?.label || 'Select Purity'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showFormPurityDropdown ? 'rotate-180' : ''}`} />
              </div>

              {showFormPurityDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                  {purityOptions.map((opt) => {
                    const isSelected = opt.value === formData.purity;
                    const config = getPurityIconBg(opt.value);
                    const Icon = config.icon;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setFormData({ ...formData, purity: opt.value });
                          setShowFormPurityDropdown(false);
                        }}
                        className={`inventory-dropdown-option relative flex items-center justify-between px-3 py-2 rounded-app-control cursor-pointer select-none transition-all ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`inventory-option-icon w-7 h-7 rounded-app-control flex items-center justify-center ${config.bg}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                            {opt.label}
                          </span>
                        </div>
                        {isSelected ? (
                          <div className="inventory-selection-indicator is-selected w-4 h-4 rounded-full border flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="inventory-selection-indicator w-4 h-4 rounded-full border" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div> : null}
            {formData.item_type === 'stone' ? (
              <>
                <Input
                  label="Ratti *"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="0.001"
                  value={formData.ratti}
                  onChange={(e) => setFormData({ ...formData, ratti: e.target.value })}
                  required
                  wrapperClassName="order-1"
                />
                <Input
                  label="Rate per Ratti *"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={formData.rate_per_ratti}
                  onChange={(e) => setFormData({ ...formData, rate_per_ratti: e.target.value })}
                  required
                  wrapperClassName="order-4"
                />
              </>
            ) : formData.pricing_method === 'fixed_rate' ? (
              <>
                <Input
                  label="Fixed Rate *"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formData.fixed_rate}
                  onChange={(e) => setFormData({ ...formData, fixed_rate: e.target.value })}
                  required
                  className="py-2.5 rounded-app-control"
                  wrapperClassName="order-5"
                />
                <Input
                  label="Weight (g) (Optional)"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={formData.net_weight}
                  onChange={(e) => setFormData({ ...formData, net_weight: e.target.value })}
                  className="py-2.5 rounded-app-control"
                  wrapperClassName="order-5"
                />
              </>
            ) : (
              <>
                <Input
                  label={formData.pricing_method === 'fixed_making_charge' ? 'Fixed Making Charge *' : 'Making Charge per gram *'}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.making_charge}
                  onChange={(e) => setFormData({ ...formData, making_charge: e.target.value })}
                  required
                  className="py-2.5 rounded-app-control"
                  wrapperClassName="order-5"
                />
                {formData.stock_mode === 'quantity' ? <Input
                  label="Weight (g) *"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.net_weight}
                  onChange={(e) => setFormData({ ...formData, net_weight: e.target.value })}
                  required
                  className="py-2.5 rounded-app-control"
                  wrapperClassName="order-5"
                /> : null}
              </>
            )}
            <div className={`${formData.item_type === 'stone' ? 'order-5' : 'order-6'} md:col-span-2`}>
              <Input
                label="Notes (Optional)"
                placeholder="Add any notes about this item"
                value={formData.notes}
                maxLength={50}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="py-2.5 rounded-app-control"
              />
              <p className="mt-1 text-right text-xs font-medium text-slate-400" aria-live="polite">
                {formData.notes.length}/50
              </p>
            </div>
            <div className={`${formData.item_type === 'stone' ? 'order-6' : 'order-7'} bg-blue-50 border border-blue-150 rounded-app-inset p-3.5 md:col-span-2`}>
              <p className="text-sm text-blue-700 font-medium">
                <strong>Note:</strong> Barcode will be automatically generated as a unique 8-digit code.
              </p>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
};
export default Items;
