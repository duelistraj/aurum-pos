import React from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Minus, AlertCircle, Camera, X } from 'lucide-react';
import {
  Card,
  Button,
  Input,
  Alert,
  Modal,
  Badge,
} from '../components/UI';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { ItemPOSWithPrice, CustomerDetails } from '../types';
import { downloadInvoicePdf, formatCurrency } from '../utils';
import {
  clearCheckoutIdempotencyKey,
  getCheckoutIdempotencyKey,
} from '../utils/checkout';
import {
  acceptIndianPhoneInput,
  INDIAN_PHONE_ERROR,
  isValidIndianPhone,
} from '../utils/phone';

const CAMERA_BARCODE_FORMATS = Object.freeze([
  'code_128',
  'ean_13',
  'ean_8',
  'qr_code',
  'upc_a',
  'upc_e',
]);
const AURUM_LABEL_BARCODE_FORMAT = 'code_128';

const formatMetalLabel = (metal: string, purity: number) => {
  if (metal.toLowerCase() === 'silver' && purity === 0) {
    return 'Silver (unspecified)';
  }

  return purity > 0 ? `${metal} ${purity}%` : `${metal} (unspecified)`;
};

const focusBarcodeInput = () => {
  document.getElementById('barcodeInput')?.focus();
};

type CartItem = Omit<ItemPOSWithPrice, 'pricing'> & {
  pricing: NonNullable<ItemPOSWithPrice['pricing']>;
  cartQuantity: number;
  weightGrams?: number;
};

export const POS: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const isReadOnly = activeMembership?.access_mode === 'read_only';
  const isAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [barcode, setBarcode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [success, setSuccess] = React.useState<string>('');
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [sendInvoiceViaWhatsApp, setSendInvoiceViaWhatsApp] = React.useState(false);
  const [showCameraScanner, setShowCameraScanner] = React.useState(false);
  const [weightedItem, setWeightedItem] = React.useState<ItemPOSWithPrice | null>(null);
  const [weightInput, setWeightInput] = React.useState('');
  const [cameraError, setCameraError] = React.useState<string>('');
  const [customerDetails, setCustomerDetails] = React.useState<CustomerDetails>(
    {
      name: '',
      phone: '',
      address: '',
    }
  );

  const location = useLocation();
  const streamRef = React.useRef<MediaStream | null>(null);
  const cartRef = React.useRef(cart);
  const whatsAppCapability = useQuery({
    queryKey: ['shops', shopId, 'whatsapp', 'capability'],
    queryFn: () => apiClient.getWhatsAppCapability(),
    enabled: Boolean(shopId),
    staleTime: 60_000,
  });

  // Sync cart ref to prevent stale closures in async loops
  React.useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  React.useEffect(() => {
    setCart([]);
    setCustomerDetails({ name: '', phone: '', address: '' });
    setShowCheckout(false);
    setSendInvoiceViaWhatsApp(false);
    setError('');
    setSuccess('');
    void clearCheckoutIdempotencyKey();
  }, [shopId]);

  // Open scanner if scan query param is present
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('scan') === 'true' && !isReadOnly && isAndroid) {
      setShowCameraScanner(true);
    }
  }, [isAndroid, isReadOnly, location.search]);

  const stopCamera = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const scanBarcode = React.useCallback(async (barcodeValue: string) => {
    const trimmedValue = barcodeValue.trim();
    if (!trimmedValue) return;
    if (isReadOnly) {
      setError('Restore Pro to process sales in this additional shop.');
      return;
    }

    setLoading(true);
    try {
      const item = await apiClient.getItemForPOS(trimmedValue);
      if (item.quantity <= 0) {
        throw new Error('Item is out of stock');
      }

      if (item.requires_weight) {
        const existingWeighted = cartRef.current.find((line) => line.id === item.id);
        setWeightedItem(item);
        setWeightInput(existingWeighted?.weightGrams?.toString() ?? '');
        setBarcode('');
        return;
      }
      if (!item.pricing) throw new Error('Price could not be calculated');
      const pricedItem = { ...item, pricing: item.pricing } as CartItem;

      const existingLine = cartRef.current.find((line) => line.barcode === trimmedValue);
      if (existingLine && existingLine.cartQuantity >= item.quantity) {
        throw new Error('Item is out of stock');
      }

      setCart((prev) => {
        const existingIndex = prev.findIndex((line) => line.barcode === trimmedValue);
        if (existingIndex !== -1) {
          const existingLine = prev[existingIndex];
          const next = [...prev];
          next[existingIndex] = {
            ...existingLine,
            cartQuantity: existingLine.cartQuantity + 1,
          };
          return next;
        }

        return [...prev, { ...pricedItem, cartQuantity: 1 }];
      });

      setBarcode('');
      setError('');
      setSuccess('Item added to cart');
      setTimeout(() => setSuccess(''), 3000);
      focusBarcodeInput();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Item not found or not available for sale'
      );
      setBarcode('');
      focusBarcodeInput();
    } finally {
      setLoading(false);
    }
  }, [isReadOnly]);

  const confirmWeightedItem = async () => {
    if (!weightedItem) return;
    const weight = Number(weightInput);
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Enter a weight greater than 0');
      return;
    }
    setLoading(true);
    try {
      const quoted = await apiClient.quoteWeightedItem(weightedItem.id, weight);
      if (!quoted.pricing) throw new Error('Price could not be calculated');
      setCart((current) => {
        const existingIndex = current.findIndex((line) => line.id === quoted.id);
        const line: CartItem = { ...quoted, pricing: quoted.pricing!, cartQuantity: 1, weightGrams: weight };
        if (existingIndex === -1) return [...current, line];
        const next = [...current];
        next[existingIndex] = line;
        return next;
      });
      setWeightedItem(null);
      setWeightInput('');
      setError('');
      setSuccess('Weighted item added to cart');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to quote weighted item');
    } finally {
      setLoading(false);
    }
  };

  const handleScanBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    await scanBarcode(barcode);
  };

  // Focus barcode input on mount and camera scanner close
  React.useEffect(() => {
    if (!showCameraScanner) {
      focusBarcodeInput();
    }
  }, [showCameraScanner]);

  // Handle native camera barcode scanning loop
  React.useEffect(() => {
    let active = true;

    const startCamera = async () => {
      if (!showCameraScanner) return;
      setCameraError('');

      // Check support for BarcodeDetector API (native in modern Android/Chromium)
      const BarcodeDetector = window.BarcodeDetector;
      if (!BarcodeDetector) {
        setCameraError(
          'Camera barcode scanning is unavailable on this device. Update your browser or enter the barcode manually.'
        );
        return;
      }

      let supportedFormats = [...CAMERA_BARCODE_FORMATS];
      if (BarcodeDetector.getSupportedFormats) {
        try {
          const deviceFormats = await BarcodeDetector.getSupportedFormats();
          supportedFormats = CAMERA_BARCODE_FORMATS.filter((format) =>
            deviceFormats.includes(format)
          );
        } catch (err) {
          console.error('Barcode format detection error:', err);
          setCameraError(
            'Unable to initialize barcode detection on this device.'
          );
          return;
        }
      }

      if (!supportedFormats.includes(AURUM_LABEL_BARCODE_FORMAT)) {
        setCameraError(
          'This device cannot scan Aurum Code 128 barcode labels. Enter the barcode manually instead.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = document.getElementById('scannerVideo') as HTMLVideoElement | null;
        if (video) {
          video.srcObject = stream;
          await video.play();

          const barcodeDetector = new BarcodeDetector({
            formats: supportedFormats,
          });

          const scanFrame = async () => {
            if (!active || !video || video.paused || video.ended) return;
            try {
              const barcodes = await barcodeDetector.detect(video);
              if (barcodes.length > 0) {
                const detected = barcodes[0].rawValue;

                // Stop tracks and clean state first to prevent multiple scans
                active = false;
                stopCamera();
                setShowCameraScanner(false);

                // Add scan result to cart
                await scanBarcode(detected);
                return;
              }
            } catch (err) {
              console.error('Detection frame error:', err);
            }

            // Decode next frame in 200ms if active
            if (active) {
              setTimeout(scanFrame, 200);
            }
          };

          scanFrame();
        }
      } catch (err) {
        console.error('Camera capture error:', err);
        setCameraError(
          'Unable to access camera. Please confirm permissions are enabled.'
        );
      }
    };

    if (showCameraScanner) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      active = false;
      stopCamera();
    };
  }, [scanBarcode, showCameraScanner, stopCamera]);

  const decrementCartItem = (index: number) => {
    setCart((prev) => {
      const next = [...prev];
      if (next[index].cartQuantity > 1) {
        next[index] = {
          ...next[index],
          cartQuantity: next[index].cartQuantity - 1,
        };
        return next;
      }
      return next.filter((_, i) => i !== index);
    });
  };

  const incrementCartItem = (index: number) => {
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      if (item.cartQuantity >= item.quantity) {
        setError('Item is out of stock');
        return prev;
      }
      next[index] = {
        ...item,
        cartQuantity: item.cartQuantity + 1,
      };
      return next;
    });
  };

  const totalUnits = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.pricing.metal_value * item.cartQuantity,
    0
  );
  const makingCharges = cart.reduce(
    (sum, item) => sum + item.pricing.making_charge * item.cartQuantity,
    0
  );
  const fixedRates = cart.reduce(
    (sum, item) => sum + (item.pricing.fixed_rate ?? 0) * item.cartQuantity,
    0
  );
  const gstAmount = cart.reduce(
    (sum, item) => sum + item.pricing.gst_amount * item.cartQuantity,
    0,
  );
  const totalWithGst = parseFloat(
    cart.reduce(
      (sum, item) => sum + item.pricing.final_price * item.cartQuantity,
      0,
    ).toFixed(2),
  );
  const gstRates = new Set(cart.map((item) => item.pricing.gst_rate_percent));
  const gstLabel = gstRates.size === 1 ? `GST (${[...gstRates][0]}%)` : 'GST (item-specific)';

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      setError('Restore Pro to process sales in this additional shop.');
      return;
    }
    if (!customerDetails.name || !customerDetails.phone) {
      setError('Customer name and phone are required');
      return;
    }
    if (!isValidIndianPhone(customerDetails.phone)) {
      setError(INDIAN_PHONE_ERROR);
      return;
    }

    setLoading(true);
    try {
      const salePayload = {
        items: cart.map((item) => item.stock_mode === 'weight'
          ? { item_id: item.id, weight_grams: item.weightGrams }
          : { item_id: item.id, quantity: item.cartQuantity }),
        customer_name: customerDetails.name,
        customer_phone: customerDetails.phone,
        customer_address: customerDetails.address,
        total_amount: totalWithGst,
        send_invoice_via_whatsapp: sendInvoiceViaWhatsApp,
      };
      const idempotencyKey = await getCheckoutIdempotencyKey(salePayload);
      const sale = await apiClient.createSale(salePayload, idempotencyKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.entitlement(shopId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cashierDashboard(shopId) }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'dashboard', 'cashier', 'analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'items'] }),
        queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'invoices'] }),
      ]);

      let invoiceDownloaded = true;
      try {
        const invoice = await apiClient.getInvoiceDownload(sale.id);
        await downloadInvoicePdf(
          invoice.url,
          `${sale.invoice_no}.pdf`,
          () => apiClient.getInvoicePdf(sale.id),
        );
      } catch (pdfErr) {
        invoiceDownloaded = false;
        console.error('Failed to download PDF:', pdfErr);
      }

      setSuccess(
        invoiceDownloaded
          ? `Sale completed and invoice downloaded.${
            sendInvoiceViaWhatsApp ? ' WhatsApp delivery queued.' : ''
          }`
          : `Sale completed. The invoice could not be opened; retry from Transactions.${
            sendInvoiceViaWhatsApp ? ' WhatsApp delivery is queued.' : ''
          }`,
      );
      await clearCheckoutIdempotencyKey();
      setCart([]);
      setCustomerDetails({ name: '', phone: '', address: '' });
      setSendInvoiceViaWhatsApp(false);
      setShowCheckout(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to complete sale'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page h-full lg:h-[calc(100vh-11rem)] flex flex-col bg-transparent overflow-hidden">
      <div className="app-page__container w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-full flex flex-col">
        {/* Header */}
        <div className="app-page__header app-page__header--stacked mb-4 animate-slide-down flex-shrink-0">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Point of Sale</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Scan items and process sales</p>
        </div>

        {/* Alerts */}
        <div className="flex-shrink-0 space-y-2 mb-4">
          {isReadOnly && (
            <Alert
              type="warning"
              title="This shop is read-only"
              message="Your organization is on the Free plan. Restore Pro to scan inventory or complete sales in this additional shop."
            />
          )}
          {error && (
            <Alert
              type="error"
              title="Error"
              message={error}
              onClose={() => setError('')}
            />
          )}
          {success && (
            <Alert
              type="success"
              title="Success"
              message={success}
              onClose={() => setSuccess('')}
            />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 lg:overflow-hidden">
          {/* Main POS Section: Col span 2 */}
          <div className="lg:col-span-2 flex flex-col h-full lg:overflow-hidden gap-4 min-h-0">
            {/* Barcode Scanner */}
            <Card className="p-5 flex-shrink-0 bg-white border border-slate-100 shadow-sm rounded-app-surface animate-slide-up">
              <form onSubmit={handleScanBarcode} className="space-y-3">
                <div className="flex gap-3 items-center">
                  <div className="min-w-0 flex-1">
                    <Input
                      id="barcodeInput"
                      placeholder="Scan or type barcode here..."
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      disabled={isReadOnly}
                      autoFocus
                      className="text-lg py-3 rounded-app-control focus:ring-amber-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    isLoading={loading}
                    disabled={isReadOnly || !barcode.trim()}
                    aria-label="Add barcode to cart"
                    className="px-6 py-3 rounded-app-control h-[46px] flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                  {isAndroid ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isReadOnly || loading}
                      aria-label="Scan barcode with camera"
                      title="Scan barcode with camera"
                      onClick={() => {
                        setCameraError('');
                        setShowCameraScanner(true);
                      }}
                      className="px-6 py-3 rounded-app-control h-[46px] flex items-center justify-center"
                    >
                      <Camera className="w-5 h-5" />
                    </Button>
                  ) : null}
                </div>
              </form>
            </Card>

            {/* Cart Items */}
            <Card className="p-5 flex-1 flex flex-col lg:overflow-hidden min-h-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-app-surface animate-slide-up">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3 flex-shrink-0">
                Cart Items ({totalUnits})
              </h2>
              {cart.length > 0 ? (
                <div className="space-y-3 overflow-y-auto flex-1 pr-1 min-h-0">
                  {cart.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-4 p-4 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/70 dark:hover:bg-slate-900/70 rounded-app-inset transition-all border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 shadow-xs"
                    >
                      {/* Left Side: Details */}
                      <div className="space-y-1">
                        <p className="font-bold text-base text-slate-900 dark:text-slate-100">
                          {item.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {item.item_type === 'stone'
                            ? `${item.category} • ${item.ratti} Ratti`
                            : item.stock_mode === 'weight'
                              ? `${formatMetalLabel(item.metal, item.purity)} • ${item.weightGrams}g sold by weight`
                              : item.pricing_method === 'fixed_rate'
                                ? 'Fixed price item'
                                : `${formatMetalLabel(item.metal, item.purity)} • ${item.net_weight}g`}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-2 py-1 rounded-app-control inline-block font-mono font-medium mt-1">
                          {item.item_type === 'stone'
                            ? `Rate/Ratti: ${formatCurrency(item.rate_per_ratti ?? 0)}`
                            : item.pricing_method === 'fixed_rate'
                            ? `Fixed rate: ${formatCurrency(item.pricing.fixed_rate ?? 0)}`
                            : `Base: ${formatCurrency(item.pricing.metal_value)} + ${item.pricing_method === 'fixed_making_charge' ? 'Fixed Making Charge' : 'Making Charge'}: ${formatCurrency(item.pricing.making_charge)}`}
                        </p>
                      </div>

                      {/* Right Side: Subtotal & Quantity Controls */}
                      <div className="flex flex-col items-end gap-3">
                        <div className="text-right">
                          <p className="text-lg font-extrabold text-amber-600 leading-none">
                            {formatCurrency(item.pricing.suggested_price * item.cartQuantity)}
                          </p>
                        </div>
                        
                        {/* Quantity controls */}
                        {item.stock_mode === 'weight' ? (
                          <Button type="button" variant="secondary" onClick={() => {
                            setWeightedItem(item);
                            setWeightInput(item.weightGrams?.toString() ?? '');
                          }} className="text-sm">Edit grams</Button>
                        ) : <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1 rounded-app-control border border-slate-200 dark:border-slate-800 shadow-xs">
                          <button
                            type="button"
                            onClick={() => decrementCartItem(index)}
                            className="w-9 h-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-app-control active:scale-95 transition-all"
                            title="Remove one unit"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="min-w-[1.75rem] text-center text-sm font-bold text-slate-800 dark:text-slate-200">
                            {item.cartQuantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => incrementCartItem(index)}
                            className="w-9 h-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-app-control active:scale-95 transition-all"
                            title="Add one unit"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500 flex-1 flex flex-col justify-center items-center">
                  <AlertCircle className="w-12 h-12 mb-3 opacity-30 text-slate-500 dark:text-slate-400" />
                  <p className="text-base font-semibold">No items in cart</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Scan a barcode to start processing</p>
                </div>
              )}
            </Card>
          </div>

          {/* Summary Section: Col span 1 */}
          <div className="h-full flex flex-col min-h-0">
            <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-app-surface flex flex-col justify-between h-full min-h-0 animate-slide-up">
              <div className="flex-1 overflow-y-auto pr-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">Summary</h2>

                <div className="space-y-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Subtotal:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-base">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  {fixedRates > 0 ? (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Fixed Rates:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-base">
                        {formatCurrency(fixedRates)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Making Charges:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-base">
                      {formatCurrency(makingCharges)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{gstLabel}:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-base">
                      {formatCurrency(gstAmount)}
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-slate-800 dark:text-slate-200 font-bold text-base">Total Amount:</span>
                    <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-500 leading-none">
                      {formatCurrency(totalWithGst)}
                    </span>
                  </div>
                  <Badge variant="info">
                    Items: {totalUnits}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 flex-shrink-0 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  onClick={() => setShowCheckout(true)}
                  disabled={isReadOnly || cart.length === 0}
                  className="w-full py-3.5 text-base font-bold rounded-app-control shadow-md"
                >
                  Proceed to Checkout
                </Button>

                <button
                  onClick={() => setCart([])}
                  className="w-full py-3.5 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-app-control transition-all font-semibold text-sm active:scale-99"
                >
                  Clear Cart
                </button>
              </div>
            </Card>
          </div>
        </div>

        {/* Checkout Modal */}
        <Modal
          isOpen={showCheckout}
          title="Checkout"
          size="md"
          onClose={() => setShowCheckout(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCheckout(false)}
                className="rounded-app-control px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCheckout}
                isLoading={loading}
                disabled={isReadOnly}
                className="rounded-app-control px-5"
              >
                Complete Sale
              </Button>
            </>
          }
        >
          <form onSubmit={handleCheckout} className="space-y-4">
            <Input
              label="Customer Name *"
              placeholder="Enter customer name"
              value={customerDetails.name}
              onChange={(e) =>
                setCustomerDetails({ ...customerDetails, name: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
            />
            <Input
              label="Phone Number *"
              placeholder="Enter phone number"
              value={customerDetails.phone}
              error={customerDetails.phone && !isValidIndianPhone(customerDetails.phone)
                ? INDIAN_PHONE_ERROR
                : undefined}
              onChange={(e) =>
                setCustomerDetails({
                  ...customerDetails,
                  phone: acceptIndianPhoneInput(customerDetails.phone, e.target.value),
                })
              }
              required
              type="tel"
              inputMode="numeric"
              maxLength={10}
              pattern="[0-9]{10}"
              className="py-2.5 rounded-app-control"
            />
            {whatsAppCapability.data?.enabled ? (
              <label className={`flex items-start gap-3 rounded-app-inset border p-4 ${
                whatsAppCapability.data.available
                  ? 'cursor-pointer border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                  : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-950/40'
              }`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                  checked={sendInvoiceViaWhatsApp}
                  disabled={!whatsAppCapability.data.available}
                  onChange={(event) => setSendInvoiceViaWhatsApp(event.target.checked)}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                    Send customer invoice on WhatsApp
                    {!whatsAppCapability.data.available ? ' - Pro required' : ''}
                  </span>
                  <span className="block text-xs leading-5 text-slate-600 dark:text-slate-400">
                    I confirm the customer requested WhatsApp delivery. Aurum POS will send the
                    invoice on behalf of {activeMembership?.shop_name ?? 'this store'} from Aurum's
                    shared WhatsApp number.
                  </span>
                </span>
              </label>
            ) : null}
            <Input
              label="Address (Optional)"
              placeholder="Enter customer address"
              value={customerDetails.address || ''}
              onChange={(e) =>
                setCustomerDetails({
                  ...customerDetails,
                  address: e.target.value,
                })
              }
              className="py-2.5 rounded-app-control"
            />
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                  <span>Total Items:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{totalUnits}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                  <span>{gstLabel}:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {formatCurrency(gstAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
                  <span className="text-slate-800 dark:text-white font-semibold text-base">Total Price:</span>
                  <span className="text-xl font-extrabold text-amber-600 dark:text-amber-500">
                    {formatCurrency(totalWithGst)}
                  </span>
                </div>
              </div>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={weightedItem !== null}
          title="Enter sale weight"
          onClose={() => {
            setWeightedItem(null);
            setWeightInput('');
          }}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setWeightedItem(null)}>Cancel</Button>
              <Button onClick={() => void confirmWeightedItem()} isLoading={loading}>Use weight</Button>
            </>
          )}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {weightedItem?.name} has {weightedItem?.stock_weight ?? 0} g available.
            </p>
            <Input
              id="weighted-sale-grams"
              label="Weight to sell (g)"
              type="number"
              inputMode="decimal"
              min="0.001"
              max={weightedItem?.stock_weight ?? undefined}
              step="0.001"
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              autoFocus
              required
            />
          </div>
        </Modal>

        {/* Fullscreen Camera Barcode Scanner View */}
        {showCameraScanner && (
          <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col justify-between p-6">
            {/* Header */}
            <div className="flex justify-between items-center z-10 text-white">
              <div>
                <h3 className="text-lg font-bold">Camera Barcode Scanner</h3>
                <p className="text-xs text-slate-400 mt-0.5">Align the barcode to scan</p>
              </div>
              <button
                onClick={() => {
                  stopCamera();
                  setShowCameraScanner(false);
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-full transition-all text-white shadow-lg"
                title="Close Camera"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Video Viewport */}
            <div className="relative flex-1 flex items-center justify-center my-6 overflow-hidden rounded-app-surface bg-slate-900 border border-slate-800 shadow-2xl">
              <video
                id="scannerVideo"
                className="absolute w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Viewfinder Target Frame Overlay */}
              <div className="relative w-72 h-48 border-2 border-amber-500 rounded-app-surface flex items-center justify-center shadow-2xl">
                {/* Bouncing Scanner Line */}
                <div 
                  className="w-full h-0.5 bg-red-500 absolute shadow-md shadow-red-500/50" 
                  style={{ 
                    animation: 'bounceSubtle 1.5s ease-in-out infinite',
                    top: '50%'
                  }} 
                />
              </div>

              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6 text-center text-white z-20">
                  <div className="max-w-xs space-y-3">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                    <p className="font-semibold text-base">{cameraError}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        stopCamera();
                        setShowCameraScanner(false);
                      }}
                      className="px-4 py-2 text-xs"
                    >
                      Close Scanner
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-slate-400 text-sm z-10 pb-4">
              <p>Camera scans and adds a single item to the cart instantly</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
