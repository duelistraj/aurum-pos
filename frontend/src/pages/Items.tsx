import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Plus, 
  AlertCircle, 
  DownloadCloud, 
  Pencil, 
  Trash2, 
  ChevronDown, 
  CheckCircle, 
  Gem, 
  ShoppingBag, 
  Tag, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Settings,
  Sparkles,
  LayoutGrid,
  Circle,
  CircleDot,
  Disc,
  Scissors,
  Award,
  MoreHorizontal,
  Check,
  IndianRupee
} from 'lucide-react';
import { Card, Button, Input, Alert, Modal, Loader } from '../components/UI';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Item } from '../types';
import { useShop } from '../context/ShopContext';
import { formatCurrency, formatWeight, downloadBlob } from '../utils';

// Helper SVGs matching the design mockup for spreadsheet and PDF sheets
const ExcelIcon = () => (
  <svg className="w-10 h-10 flex-shrink-0" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 3H8C6.9 3 6 3.9 6 5V27C6 28.1 6.9 29 8 29H24C25.1 29 26 28.1 26 27V11L18 3Z" fill="#107C41" />
    <path d="M18 3V11H26L18 3Z" fill="#0C5E31" />
    <text x="9" y="21" fill="white" fontSize="8" fontWeight="bold" fontFamily="system-ui">X</text>
    <rect x="15" y="14" width="7" height="8" rx="0.5" stroke="white" strokeWidth="1.2" fill="none" />
    <line x1="15" y1="18" x2="22" y2="18" stroke="white" strokeWidth="1.2" />
    <line x1="18.5" y1="14" x2="18.5" y2="22" stroke="white" strokeWidth="1.2" />
  </svg>
);

const PDFIcon = () => (
  <svg className="w-10 h-10 flex-shrink-0" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 3H8C6.9 3 6 3.9 6 5V27C6 28.1 6.9 29 8 29H24C25.1 29 26 28.1 26 27V11L18 3Z" fill="#D83B01" />
    <path d="M18 3V11H26L18 3Z" fill="#A82A01" />
    <text x="8" y="23" fill="white" fontSize="6.5" fontWeight="black" fontFamily="system-ui" letterSpacing="0.2">PDF</text>
  </svg>
);

const METAL_FILTER_OPTIONS = [
  { value: 'all', label: 'All Metals', icon: LayoutGrid },
  { value: 'silver', label: 'Silver', icon: Disc },
  { value: 'gold', label: 'Gold', icon: Sparkles },
  { value: 'platinum', label: 'Platinum', icon: Gem },
];

const PURITY_OPTIONS_BY_METAL: Record<string, Array<{ value: string; label: string }>> = {
  silver: [
    { value: '99.9', label: '99.9%' },
    { value: '92.5', label: '92.5%' },
    { value: 'other', label: 'Other (Unspecified)' },
  ],
  gold: [
    { value: '99.9', label: '24K (99.9%)' },
    { value: '91.6', label: '22K (91.6%)' },
    { value: '75', label: '18K (75.0%)' },
    { value: '58.5', label: '14K (58.5%)' },
  ],
  platinum: [
    { value: '99.9', label: 'Pt999 (99.9%)' },
    { value: '95', label: 'Pt950 (95.0%)' },
    { value: '90', label: 'Pt900 (90.0%)' },
  ],
};

const DEFAULT_PURITY_BY_METAL: Record<string, string> = {
  silver: '92.5',
  gold: '91.6',
  platinum: '95',
};

const getConfiguredPurities = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => Object.entries(availableMetals).find(
  ([name]) => name.toLowerCase() === metal.toLowerCase(),
)?.[1] ?? [];

const getPurityOptions = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => {
  const options = PURITY_OPTIONS_BY_METAL[metal.toLowerCase()] ?? [];
  const configured = getConfiguredPurities(metal, availableMetals);
  if (configured.length === 0 || configured.includes(100)) return options;

  return options.filter((option) => (
    option.value === 'other'
      ? configured.includes(0)
      : configured.includes(Number(option.value))
  ));
};

const getDefaultPurity = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => {
  const options = getPurityOptions(metal, availableMetals);
  return options.find((option) => option.value === DEFAULT_PURITY_BY_METAL[metal.toLowerCase()])?.value
    ?? options[0]?.value
    ?? 'other';
};

const getCanonicalMetal = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => Object.keys(availableMetals).find(
  (name) => name.toLowerCase() === metal.toLowerCase(),
) ?? metal;

const getMetalIconBg = (metalName: string) => {
  const name = metalName.toLowerCase();
  if (name === 'gold') {
    return { icon: Sparkles, bg: 'inventory-option-icon' };
  }
  if (name === 'silver') {
    return { icon: Disc, bg: 'inventory-option-icon' };
  }
  return { icon: Gem, bg: 'inventory-option-icon' };
};

const getPurityIconBg = (purityValue: string) => {
  return { icon: purityValue === 'other' ? Settings : Award, bg: 'inventory-option-icon' };
};

export const Items: React.FC = () => {
  const { canManage, activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const entitlementQuery = useQuery({
    queryKey: queryKeys.entitlement(shopId),
    queryFn: () => apiClient.getEntitlement(),
    enabled: Boolean(shopId),
  });
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  
  // Search and Filters State
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedMetal, setSelectedMetal] = React.useState('all');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [selectedStatus, setSelectedStatus] = React.useState('all');
  
  // Pagination State
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [totalItems, setTotalItems] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);

  // Summary counts
  const [summary, setSummary] = React.useState({
    total_items: 0,
    in_stock: 0,
    unique_items: 0,
    sold_items: 0,
    items_925_count: 0,
  });

  // Modal and Mode States
  const [showModal, setShowModal] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<Item | null>(null);
  const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
  const [isManageMode, setIsManageMode] = React.useState(false);
  const [availableMetals, setAvailableMetals] = React.useState<Record<string, number[]>>({});
  const [latestItem, setLatestItem] = React.useState<Item | null>(null);
  
  // Custom dropdown overlays toggle states
  const [showCategoryDropdown, setShowCategoryDropdown] = React.useState(false);
  const [showMetalDropdown, setShowMetalDropdown] = React.useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = React.useState(false);
  const [showRowsPerPageDropdown, setShowRowsPerPageDropdown] = React.useState(false);
  const [categorySearch, setCategorySearch] = React.useState('');
  
  const [showFormCategoryDropdown, setShowFormCategoryDropdown] = React.useState(false);
  const [showFormMetalDropdown, setShowFormMetalDropdown] = React.useState(false);
  const [showFormPurityDropdown, setShowFormPurityDropdown] = React.useState(false);
  
  const categoryDropdownRef = React.useRef<HTMLDivElement>(null);
  const metalDropdownRef = React.useRef<HTMLDivElement>(null);
  const statusDropdownRef = React.useRef<HTMLDivElement>(null);
  const rowsPerPageDropdownRef = React.useRef<HTMLDivElement>(null);
  const formCategoryDropdownRef = React.useRef<HTMLDivElement>(null);
  const formMetalDropdownRef = React.useRef<HTMLDivElement>(null);
  const formPurityDropdownRef = React.useRef<HTMLDivElement>(null);
  const [showDownloadDropdown, setShowDownloadDropdown] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = React.useState({
    sku: '',
    barcode: '',
    name: '',
    category: 'jewellery',
    metal: '',
    purity: '92.5',
    net_weight: '',
    making_charge: '',
    quantity: '1',
    notes: '',
  });

  // Category and Status drop-down options config
  const categoryOptions = [
    { value: 'all', label: 'All Categories', icon: LayoutGrid, bg: 'bg-orange-50 text-orange-500 dark:bg-orange-950/20 dark:text-orange-400' },
    { value: 'jewellery', label: 'Jewellery', icon: Sparkles, bg: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/20 dark:text-yellow-400' },
    { value: 'unique', label: 'Unique', icon: Gem, bg: 'bg-purple-50 text-purple-500 dark:bg-purple-950/20 dark:text-purple-400' },
    { value: 'ring', label: 'Ring', icon: Circle, bg: 'bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400' },
    { value: 'necklace', label: 'Necklace', icon: CircleDot, bg: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400' },
    { value: 'bracelet', label: 'Bracelet', icon: Disc, bg: 'bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400' },
    { value: 'earring', label: 'Earring', icon: Scissors, bg: 'bg-violet-50 text-violet-500 dark:bg-violet-950/20 dark:text-violet-400' },
    { value: 'pendant', label: 'Pendant', icon: Award, bg: 'bg-cyan-50 text-cyan-500 dark:bg-cyan-950/20 dark:text-cyan-400' },
    { value: 'other', label: 'Other', icon: MoreHorizontal, bg: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status', icon: LayoutGrid, bg: 'bg-orange-50 text-orange-500 dark:bg-orange-950/20 dark:text-orange-400' },
    { value: 'in_stock', label: 'In Stock', icon: CheckCircle, bg: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400' },
    { value: 'sold', label: 'Sold', icon: IndianRupee, bg: 'bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400' },
  ];

  const loadMetals = React.useCallback(async () => {
    try {
      const metals = await apiClient.getAvailableMetals();
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
  }, []);

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
      if (rowsPerPageDropdownRef.current && !rowsPerPageDropdownRef.current.contains(target)) {
        setShowRowsPerPageDropdown(false);
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

  const loadSummary = React.useCallback(async () => {
    try {
      const data = await apiClient.getItemsSummary();
      setSummary(data);
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
          });
        }
      } catch (innerErr) {
        console.error('Failed to compute local fallback summary:', innerErr);
      }
    }
  }, []);

  const loadItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getItems({
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        metal: selectedMetal !== 'all' ? selectedMetal : undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      });

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
      setError(
        err instanceof Error ? err.message : 'Failed to load items'
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, rowsPerPage, debouncedSearch, selectedMetal, selectedCategory, selectedStatus]);

  const loadLatestItem = React.useCallback(async () => {
    try {
      const item = await apiClient.getLatestItem();
      setLatestItem(item);
    } catch {
      setLatestItem(null);
    }
  }, []);

  const refreshItems = async () => {
    await Promise.all([loadItems(), loadSummary(), loadLatestItem()]);
  };

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      category: 'jewellery',
      metal: 'Silver',
      purity: '92.5',
      net_weight: '',
      making_charge: '',
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
    if (latestItem) {
      const metal = getCanonicalMetal(latestItem.metal, availableMetals);
      setFormData({
        sku: latestItem.sku,
        name: latestItem.name,
        category: latestItem.category,
        metal,
        purity: String(latestItem.purity),
        net_weight: '',
        making_charge: latestItem.making_charge?.toString() ?? '',
        quantity: '1',
        notes: '',
        barcode: '',
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleManageToggle = () => {
    if (isManageMode) {
      setIsManageMode(false);
      setSelectedItems(new Set());
    } else if (canManage) {
      setIsManageMode(true);
    } else {
      setError('Your shop role does not allow inventory management.');
    }
  };

  const openEditItem = (item: Item) => {
    if (!isManageMode) return;
    setEditingItem(item);
    const metal = getCanonicalMetal(item.metal, availableMetals);
    setFormData({
      sku: item.sku,
      name: item.name,
      category: item.category,
      metal,
      purity: String(item.purity),
      net_weight: String(item.net_weight),
      making_charge: item.making_charge?.toString() ?? '',
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
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const handleCategorySelect = (val: string) => {
    setSelectedCategory(val);
    setCurrentPage(1);
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  const handleStatusSelect = (val: string) => {
    setSelectedStatus(val);
    setCurrentPage(1);
    setShowStatusDropdown(false);
  };

  const handleMetalSelect = (val: string) => {
    setSelectedMetal(val);
    setCurrentPage(1);
    setShowMetalDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const purityValue = formData.purity === 'other'
        ? 0
        : parseFloat(formData.purity);

      const makingChargeValue = parseFloat(formData.making_charge);
      if (Number.isNaN(makingChargeValue)) {
        throw new Error('Making Charge is required');
      }

      const quantityValue = parseInt(formData.quantity, 10);
      if (Number.isNaN(quantityValue) || quantityValue <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      const payload = {
        sku: formData.sku,
        barcode: formData.barcode || '',
        category: formData.category,
        name: formData.name,
        metal: formData.metal,
        purity: purityValue,
        net_weight: parseFloat(formData.net_weight),
        making_charge: makingChargeValue,
        quantity: quantityValue,
        notes: formData.notes || null,
      };

      if (editingItem) {
        await apiClient.updateItem(editingItem.id, payload);
      } else {
        await apiClient.createItem(payload);
      }

      closeModal();
      await refreshItems();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save item'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!isManageMode) return;
    const shouldDelete = window.confirm(
      'Delete this item? This action cannot be undone.'
    );
    if (!shouldDelete) {
      return;
    }

    setLoading(true);
    try {
      await apiClient.deleteItem(itemId);
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      await refreshItems();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete item'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBatchLabels = async (format: 'xlsx' | 'pdf') => {
    if (!isManageMode) {
      setError('Enter manage mode to download labels.');
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
    if (!isManageMode) return;
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (!isManageMode) return;
    if (selectedItems.size === items.length && items.length > 0) {
      setSelectedItems(new Set());
    } else {
      const allIds = new Set(items.map(item => item.id));
      setSelectedItems(allIds);
    }
  };

  // Generate pagination page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage, '...', totalPages);
      }
    }
    return pages;
  };

  const purityOptions = getPurityOptions(formData.metal, availableMetals);

  return (
    <div className="app-page min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="app-page__container max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Title and Actions */}
        <div className="app-page__header inventory-page__header mb-8 animate-slide-down">
          <div className="inventory-page__title">
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Inventory</h1>
              <p className="text-slate-400 dark:text-slate-400 mt-1 font-medium">
                {isManageMode
                  ? 'Manage mode enabled - add, edit, delete, and label downloads are available.'
                  : 'Inventory is view-only. Click Manage to unlock add, edit, delete, and label download actions.'}
              </p>
          </div>
          <div className="inventory-page__actions">
              <button
                onClick={handleManageToggle}
                className={`flex items-center space-x-2 border px-5 py-2.5 rounded-app-control shadow-xs transition-all duration-200 font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isManageMode 
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-slate-950 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/30 focus:ring-emerald-500' 
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 focus:ring-slate-500'
                }`}
              >
                <Settings className={`w-5 h-5 ${isManageMode ? 'text-emerald-500' : 'text-slate-500'}`} />
                <span>{isManageMode ? 'Exit Manage' : 'Manage'}</span>
              </button>
              {selectedItems.size > 0 && (
                <div className="relative" ref={dropdownRef}>
                  <Button
                    onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
                    variant="primary"
                    disabled={!isManageMode}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-app-control font-bold shadow-xs transition-all"
                  >
                    <DownloadCloud className="w-5 h-5" />
                    <span>Download</span>
                    <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showDownloadDropdown ? 'rotate-180' : ''}`} />
                  </Button>
                  
                  {showDownloadDropdown && (
                    <div className="absolute right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-20 p-4 flex flex-col gap-3 w-80 animate-fade-in">
                      <button
                        onClick={() => {
                          handleDownloadBatchLabels('xlsx');
                          setShowDownloadDropdown(false);
                        }}
                        className="flex items-center text-left p-3.5 rounded-app-control border border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all duration-200"
                      >
                        <div className="mr-3.5 text-emerald-600 dark:text-emerald-500 flex-shrink-0">
                          <ExcelIcon />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">Excel (.xlsx)</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Download as Excel file</p>
                        </div>
                      </button>
                      
                      <button
                        onClick={() => {
                          handleDownloadBatchLabels('pdf');
                          setShowDownloadDropdown(false);
                        }}
                        className="flex items-center text-left p-3.5 rounded-app-control border border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200"
                      >
                        <div className="mr-3.5 text-red-500 dark:text-red-500 flex-shrink-0">
                          <PDFIcon />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">PDF (.pdf)</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Download as PDF file</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
              <Button
                onClick={openAddItemModal}
                disabled={!isManageMode}
                className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-app-control shadow-md font-semibold transition-all"
              >
                <Plus className="w-5 h-5 font-bold" />
                <span>Add Item</span>
              </Button>
          </div>
        </div>

        {/* Summary Metrics Cards (Responsive grid with 4 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-slide-down">
          {/* In Stock */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-app-surface p-5 flex items-center shadow-xs">
            <div className="inventory-summary-icon p-3.5 rounded-app-control mr-4">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">In Stock</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.in_stock}</p>
            </div>
          </div>

          {/* Unique Items */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-app-surface p-5 flex items-center shadow-xs">
            <div className="inventory-summary-icon p-3.5 rounded-app-control mr-4">
              <Gem className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Unique Items</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.unique_items}</p>
            </div>
          </div>

          {/* Sold Items */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-app-surface p-5 flex items-center shadow-xs">
            <div className="inventory-summary-icon p-3.5 rounded-app-control mr-4">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Sold Items</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.sold_items}</p>
            </div>
          </div>

          {/* 925 Items */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-app-surface p-5 flex items-center shadow-xs">
            <div className="inventory-summary-icon p-3.5 rounded-app-control mr-4">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">925 Items</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {summary.items_925_count}
              </p>
            </div>
          </div>
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
        <div className="inventory-page__filter-row flex flex-col md:flex-row gap-4 mb-6 items-stretch animate-slide-up">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search by SKU, name, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-app-control focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all duration-200 shadow-xs placeholder-slate-400 font-medium"
            />
          </div>
          
          {/* Metal Custom Selector */}
          <div className="relative w-full md:w-48" ref={metalDropdownRef}>
            <div
              onClick={() => {
                setShowMetalDropdown(!showMetalDropdown);
                setShowCategoryDropdown(false);
                setShowStatusDropdown(false);
              }}
              className={`relative flex flex-col justify-center px-4 py-2 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none shadow-xs h-full transition-all ${
                showMetalDropdown ? 'border-amber-500 ring-2 ring-amber-500/25 dark:border-amber-500' : 'border-slate-200 dark:border-slate-800'
              }`}
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                {METAL_FILTER_OPTIONS.map((opt) => {
                  const isSelected = opt.value === selectedMetal;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleMetalSelect(opt.value)}
                      className={`relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${
                        isSelected
                          ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                      }`}
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
                        <div className="w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Custom Selector */}
          <div className="relative w-full md:w-56" ref={categoryDropdownRef}>
            <div 
              onClick={() => {
                setShowCategoryDropdown(!showCategoryDropdown);
                setShowStatusDropdown(false);
              }}
              className={`relative flex flex-col justify-center px-4 py-2 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none shadow-xs h-full transition-all ${
                showCategoryDropdown ? 'border-amber-500 ring-2 ring-amber-500/25 dark:border-amber-500' : 'border-slate-200 dark:border-slate-800'
              }`}
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full max-h-80 overflow-y-auto animate-fade-in">
                <div className="relative p-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()} // Prevent close on click
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-app-control focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm placeholder-slate-400 font-medium"
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
                        className={`relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${
                          isSelected 
                            ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                        }`}
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
                          <div className="w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Status Custom Selector */}
          <div className="relative w-full md:w-56" ref={statusDropdownRef}>
            <div 
              onClick={() => {
                setShowStatusDropdown(!showStatusDropdown);
                setShowCategoryDropdown(false);
              }}
              className={`relative flex flex-col justify-center px-4 py-2 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none shadow-xs h-full transition-all ${
                showStatusDropdown ? 'border-amber-500 ring-2 ring-amber-500/25 dark:border-amber-500' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 pointer-events-none">Status</label>
              <div className="flex items-center justify-between">
                <span className="text-slate-800 dark:text-slate-100 font-bold text-sm truncate">
                  {statusOptions.find(o => o.value === selectedStatus)?.label || 'All Status'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showStatusDropdown ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {showStatusDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                {statusOptions.map((opt) => {
                  const isSelected = opt.value === selectedStatus;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleStatusSelect(opt.value)}
                      className={`relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${
                        isSelected 
                          ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                      }`}
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
                        <div className="w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        {loading && !items.length ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : (
          <Card className="overflow-hidden animate-slide-up bg-white border border-slate-100 dark:border-slate-800 shadow-sm rounded-app-surface">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 w-12">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === items.length && items.length > 0}
                        onChange={handleSelectAll}
                        disabled={!isManageMode}
                        className="checkbox-round"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Barcode
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Metal
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Weight
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Making Charge
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length > 0 ? (
                    items.map((item) => (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          selectedItems.has(item.id) 
                            ? 'bg-amber-50/30 dark:bg-amber-950/30' 
                            : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="px-5 py-5">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => handleSelectItem(item.id)}
                            disabled={!isManageMode}
                            className="checkbox-round"
                          />
                        </td>
                        <td className="px-6 py-5">
                          <span className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 font-bold px-3 py-1 rounded-app-control text-xs font-mono tracking-wider border border-blue-100/50 dark:border-blue-900/30">
                            {item.sku}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 font-bold px-3 py-1 rounded-app-control text-xs font-mono tracking-wider border border-amber-100/50 dark:border-amber-900/30">
                            {item.barcode}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900 dark:text-white text-base">
                            {item.name}
                          </p>
                        </td>
                        <td className="px-6 py-5">
                          <span className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold px-3 py-1.5 rounded-app-control text-xs border border-slate-200 dark:border-slate-700">
                            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-bold text-slate-800 dark:text-slate-100 text-base">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-5">
                          <span className="bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 font-semibold px-3 py-1.5 rounded-app-control text-xs border border-indigo-100/50 dark:border-indigo-900/30">
                            {item.metal} {item.purity > 0 ? `${item.purity}%` : '(unspecified)'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-slate-500 dark:text-slate-400 text-sm font-medium">
                          Net: {formatWeight(item.net_weight)}
                        </td>
                        <td className="px-6 py-5 text-slate-900 dark:text-white text-base font-semibold">
                          {item.making_charge !== null && item.making_charge !== undefined
                            ? formatCurrency(item.making_charge)
                            : '—'}
                        </td>
                        <td className="px-6 py-5">
                          {item.status === 'in_stock' && (
                            <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 w-fit border border-emerald-100/50 dark:border-emerald-900/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              In Stock
                            </span>
                          )}
                          {item.status === 'sold' && (
                            <span className="bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 font-bold px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 w-fit border border-red-100/50 dark:border-red-900/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Sold
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center space-x-2">
                            {item.status === 'in_stock' && (
                              <>
                                <button
                                  onClick={() => openEditItem(item)}
                                  disabled={!isManageMode}
                                  className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-app-control transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                                  title="Edit item"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={!isManageMode}
                                  className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-app-control transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="text-center py-16 text-slate-400 dark:text-slate-500">
                        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400 dark:text-slate-500" />
                        <p className="text-base font-semibold text-slate-500 dark:text-slate-400">No items found</p>
                        <p className="text-sm text-slate-400 mt-1">Try updating your filters, search queries, or add a new item.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Footer / Pagination controls */}
        {!loading && (
          <div className="flex flex-col md:flex-row justify-between items-center mt-6 gap-4 text-slate-500 dark:text-slate-400 text-sm">
            <div>
              Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{totalItems > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}</span> to{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {Math.min(currentPage * rowsPerPage, totalItems)}
              </span>{' '}
              of <span className="font-semibold text-slate-800 dark:text-slate-200">{totalItems}</span> items
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="w-10 h-10 flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-app-control disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>

                {getPageNumbers().map((pageNum, idx) => {
                  if (pageNum === '...') {
                    return (
                      <span key={`dots-${idx}`} className="px-1.5 text-slate-400 font-bold">
                        ...
                      </span>
                    );
                  }
                  const isActive = pageNum === currentPage;
                  return (
                    <button
                      key={`page-${pageNum}`}
                      onClick={() => setCurrentPage(pageNum as number)}
                      className={`w-10 h-10 font-bold rounded-app-control flex items-center justify-center transition-all ${
                        isActive
                          ? 'border-2 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                          : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-app-control disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <div className="inventory-page__rows-dropdown relative" ref={rowsPerPageDropdownRef}>
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={showRowsPerPageDropdown}
                  onClick={() => setShowRowsPerPageDropdown((open) => !open)}
                  className="inventory-page__rows-trigger"
                >
                  <span>{rowsPerPage}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showRowsPerPageDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showRowsPerPageDropdown && (
                  <div className="inventory-page__rows-menu" role="listbox" aria-label="Rows per page">
                    {[10, 20, 50, 100].map((option) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={rowsPerPage === option}
                        key={option}
                        onClick={() => {
                          setRowsPerPage(option);
                          setCurrentPage(1);
                          setShowRowsPerPageDropdown(false);
                        }}
                        className={`inventory-page__rows-option ${rowsPerPage === option ? 'is-selected' : ''}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Item Modal */}
        <Modal
          isOpen={showModal}
          title={editingItem ? 'Edit Item' : 'Add New Item'}
          size="lg"
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
            />
            <Input
              label="Quantity *"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="1"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
            />
             <div className="relative" ref={formCategoryDropdownRef}>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Category *
              </label>
              <div 
                onClick={() => {
                  setShowFormCategoryDropdown(!showFormCategoryDropdown);
                  setShowFormMetalDropdown(false);
                  setShowFormPurityDropdown(false);
                }}
                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border rounded-app-control focus:outline-none transition-all duration-200 cursor-pointer select-none flex items-center justify-between h-[46px] ${
                  showFormCategoryDropdown ? 'border-amber-500 ring-2 ring-amber-500/25 dark:border-amber-500' : 'border-slate-300 dark:border-slate-800'
                }`}
              >
                <span className="font-semibold text-sm">
                  {categoryOptions.find(o => o.value === formData.category)?.label || 'Select Category'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showFormCategoryDropdown ? 'rotate-180' : ''}`} />
              </div>

              {showFormCategoryDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full max-h-60 overflow-y-auto animate-fade-in">
                  {categoryOptions.filter(o => o.value !== 'all').map((opt) => {
                    const isSelected = opt.value === formData.category;
                    const Icon = opt.icon;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setFormData({ ...formData, category: opt.value });
                          setShowFormCategoryDropdown(false);
                        }}
                        className={`relative flex items-center justify-between px-3 py-2 rounded-app-control cursor-pointer select-none transition-all ${
                          isSelected 
                            ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-7 h-7 rounded-app-control flex items-center justify-center ${opt.bg}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                            {opt.label}
                          </span>
                        </div>
                        {isSelected ? (
                          <div className="w-4 h-4 rounded-full border border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-700" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative" ref={formMetalDropdownRef}>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Metal *
              </label>
              <div 
                onClick={() => {
                  setShowFormMetalDropdown(!showFormMetalDropdown);
                  setShowFormCategoryDropdown(false);
                  setShowFormPurityDropdown(false);
                }}
                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border rounded-app-control focus:outline-none transition-all duration-200 cursor-pointer select-none flex items-center justify-between h-[46px] ${
                  showFormMetalDropdown ? 'border-amber-500 ring-2 ring-amber-500/25 dark:border-amber-500' : 'border-slate-300 dark:border-slate-800'
                }`}
              >
                <span className="font-semibold text-sm">
                  {formData.metal ? (formData.metal.charAt(0).toUpperCase() + formData.metal.slice(1)) : 'Select Metal'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showFormMetalDropdown ? 'rotate-180' : ''}`} />
              </div>

              {showFormMetalDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                  {Object.keys(availableMetals).map((metal) => {
                    const isSelected = metal === formData.metal;
                    const config = getMetalIconBg(metal);
                    const Icon = config.icon;
                    return (
                      <div
                        key={metal}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            metal: metal,
                            purity: getDefaultPurity(metal, availableMetals),
                          });
                          setShowFormMetalDropdown(false);
                        }}
                        className={`relative flex items-center justify-between px-3 py-2 rounded-app-control cursor-pointer select-none transition-all ${
                          isSelected 
                            ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`inventory-option-icon w-7 h-7 rounded-app-control flex items-center justify-center ${config.bg}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-400'}`}>
                            {metal.charAt(0).toUpperCase() + metal.slice(1)}
                          </span>
                        </div>
                        {isSelected ? (
                          <div className="w-4 h-4 rounded-full border border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-700" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative" ref={formPurityDropdownRef}>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Purity *
              </label>
              <div 
                onClick={() => {
                  setShowFormPurityDropdown(!showFormPurityDropdown);
                  setShowFormCategoryDropdown(false);
                  setShowFormMetalDropdown(false);
                }}
                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border rounded-app-control focus:outline-none transition-all duration-200 cursor-pointer select-none flex items-center justify-between h-[46px] ${
                  showFormPurityDropdown ? 'border-amber-500 ring-2 ring-amber-500/25 dark:border-amber-500' : 'border-slate-300 dark:border-slate-800'
                }`}
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
                        className={`relative flex items-center justify-between px-3 py-2 rounded-app-control cursor-pointer select-none transition-all ${
                          isSelected 
                            ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                        }`}
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
                          <div className="w-4 h-4 rounded-full border border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-700" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <Input
              label="Net Weight (g) *"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={formData.net_weight}
              onChange={(e) =>
                setFormData({ ...formData, net_weight: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
            />
            <Input
              label="Making Charge *"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={formData.making_charge}
              onChange={(e) =>
                setFormData({ ...formData, making_charge: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
            />
            <div className="md:col-span-2">
              <Input
                label="Notes (Optional)"
                placeholder="Add any notes about this item"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="py-2.5 rounded-app-control"
              />
            </div>
            <div className="bg-blue-50 border border-blue-150 rounded-app-inset p-3.5 md:col-span-2">
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
