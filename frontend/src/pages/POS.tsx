import React from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Minus, AlertCircle, X } from 'lucide-react';
import {
  Card,
  Button,
  Input,
  Alert,
  Modal,
  Badge,
} from '../components/UI';
import { apiClient } from '../api/client';
import { ItemPOSWithPrice, CustomerDetails } from '../types';
import { formatCurrency, generateInvoiceNumber, downloadBlob } from '../utils';

const FIXED_MAKING_CATEGORIES = new Set(['ring', 'other', 'pendant']);

const isFixedMakingCategory = (category: string) =>
  FIXED_MAKING_CATEGORIES.has(category.toLowerCase());

const formatMetalLabel = (metal: string, purity: number) => {
  if (metal.toLowerCase() === 'silver' && purity === 0) {
    return 'Silver (unspecified)';
  }

  return purity > 0 ? `${metal} ${purity}%` : `${metal} (unspecified)`;
};

type CartItem = ItemPOSWithPrice & {
  cartQuantity: number;
};

export const POS: React.FC = () => {
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [barcode, setBarcode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [success, setSuccess] = React.useState<string>('');
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [showCameraScanner, setShowCameraScanner] = React.useState(false);
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

  // Sync cart ref to prevent stale closures in async loops
  React.useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Open scanner if scan query param is present
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('scan') === 'true') {
      setShowCameraScanner(true);
    }
  }, [location.search]);

  const focusBarcodeInput = () => {
    const input = document.getElementById('barcodeInput') as HTMLInputElement | null;
    input?.focus();
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const scanBarcode = async (barcodeValue: string) => {
    const trimmedValue = barcodeValue.trim();
    if (!trimmedValue) return;

    setLoading(true);
    try {
      const item = await apiClient.getItemForPOS(trimmedValue);
      if (item.quantity <= 0) {
        throw new Error('Item is out of stock');
      }

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

        return [...prev, { ...item, cartQuantity: 1 }];
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
      if (!('BarcodeDetector' in window)) {
        setCameraError(
          'Barcode Detection API is not supported in this browser. Please use a Chromium-based browser or mobile WebView.'
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

          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'],
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
  }, [showCameraScanner]);

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
  const subtotalBeforeTax = subtotal + makingCharges;
  const gstAmount = parseFloat((subtotalBeforeTax * 0.03).toFixed(2));
  const totalWithGst = parseFloat((subtotalBeforeTax + gstAmount).toFixed(2));

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerDetails.name || !customerDetails.phone) {
      setError('Customer name and phone are required');
      return;
    }

    setLoading(true);
    try {
      const invoiceNo = generateInvoiceNumber();
      const sale = await apiClient.createSale({
        invoice_no: invoiceNo,
        items: cart.map((item) => ({ item_id: item.id, quantity: item.cartQuantity })),
        customer_name: customerDetails.name,
        customer_phone: customerDetails.phone,
        customer_address: customerDetails.address,
        total_amount: totalWithGst,
      });

      // Download invoice PDF
      try {
        const pdf = await apiClient.getInvoicePDF(sale.id);
        await downloadBlob(pdf, `${sale.invoice_no}.pdf`);
      } catch (pdfErr) {
        console.error('Failed to download PDF:', pdfErr);
      }

      setSuccess('Sale completed successfully!');
      setCart([]);
      setCustomerDetails({ name: '', phone: '', address: '' });
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
    <div className="h-full lg:h-[calc(100vh-11rem)] flex flex-col bg-transparent overflow-hidden">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-full flex flex-col">
        {/* Header */}
        <div className="mb-4 animate-slide-down flex-shrink-0">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Point of Sale</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Scan items and process sales</p>
        </div>

        {/* Alerts */}
        <div className="flex-shrink-0 space-y-2 mb-4">
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
            <Card className="p-5 flex-shrink-0 bg-white border border-slate-100 shadow-sm rounded-2xl animate-slide-up">
              <form onSubmit={handleScanBarcode} className="space-y-3">
                <div className="flex space-x-3 items-center">
                  <Input
                    id="barcodeInput"
                    placeholder="Scan or type barcode here..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    autoFocus
                    className="flex-1 text-lg py-3 rounded-xl focus:ring-amber-500"
                  />
                  <Button
                    type="submit"
                    isLoading={loading}
                    disabled={!barcode.trim()}
                    className="px-6 py-3 rounded-xl h-[46px] flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              </form>
            </Card>

            {/* Cart Items */}
            <Card className="p-5 flex-1 flex flex-col lg:overflow-hidden min-h-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl animate-slide-up">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3 flex-shrink-0">
                Cart Items ({totalUnits})
              </h2>
              {cart.length > 0 ? (
                <div className="space-y-3 overflow-y-auto flex-1 pr-1 min-h-0">
                  {cart.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-4 p-4 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/70 dark:hover:bg-slate-900/70 rounded-2xl transition-all border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 shadow-xs"
                    >
                      {/* Left Side: Details */}
                      <div className="space-y-1">
                        <p className="font-bold text-base text-slate-900 dark:text-slate-100">
                          {item.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {formatMetalLabel(item.metal, item.purity)} • {item.net_weight}g
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-2 py-1 rounded inline-block font-mono font-medium mt-1">
                          Base: {formatCurrency(item.pricing.metal_value)} + Making:{' '}
                          {formatCurrency(item.pricing.making_charge)}{' '}
                          {isFixedMakingCategory(item.category) ? 'Fixed' : '/ gram'}
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
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                          <button
                            type="button"
                            onClick={() => decrementCartItem(index)}
                            className="w-9 h-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg active:scale-95 transition-all"
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
                            className="w-9 h-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg active:scale-95 transition-all"
                            title="Add one unit"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
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
            <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl flex flex-col justify-between h-full min-h-0 animate-slide-up">
              <div className="flex-1 overflow-y-auto pr-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">Summary</h2>

                <div className="space-y-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Subtotal:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-base">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Making Charges:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-base">
                      {formatCurrency(makingCharges)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">GST (3%):</span>
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
                  disabled={cart.length === 0}
                  className="w-full py-3.5 text-base font-bold rounded-xl shadow-md"
                >
                  Proceed to Checkout
                </Button>

                <button
                  onClick={() => setCart([])}
                  className="w-full py-3.5 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all font-semibold text-sm active:scale-99"
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
                className="rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCheckout}
                isLoading={loading}
                className="rounded-xl px-5"
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
              className="py-2.5 rounded-lg"
            />
            <Input
              label="Phone Number *"
              placeholder="Enter phone number"
              value={customerDetails.phone}
              onChange={(e) =>
                setCustomerDetails({
                  ...customerDetails,
                  phone: e.target.value,
                })
              }
              required
              type="tel"
              inputMode="tel"
              className="py-2.5 rounded-lg"
            />
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
              className="py-2.5 rounded-lg"
            />
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                  <span>Total Items:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{totalUnits}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                  <span>GST (3%):</span>
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
            <div className="relative flex-1 flex items-center justify-center my-6 overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl">
              <video
                id="scannerVideo"
                className="absolute w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Viewfinder Target Frame Overlay */}
              <div className="relative w-72 h-48 border-2 border-amber-500 rounded-3xl flex items-center justify-center shadow-2xl">
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