import {
  Check,
  CreditCard,
  Keyboard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X
} from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { invoiceService } from "../db/invoiceService";
import { useDebounce, useKeyboardShortcut, useProducts } from "../hooks";
import { CartItem, InvoiceItem, Product } from "../types";
import { Badge, Button, ConfirmModal, useToast } from "./ui";
import { VirtuosoGrid } from 'react-virtuoso';

export const Billing: React.FC = () => {
  const { products, loading, refetch } = useProducts();
  const toast = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Search state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);

  // Quick add quantity modal
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);
  const [quickAddQty, setQuickAddQty] = useState("1");

  // Clear cart confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcut("f", () => searchInputRef.current?.focus(), { ctrl: true });
  useKeyboardShortcut("Escape", () => {
    setSearch("");
    searchInputRef.current?.blur();
  });

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return products;
    const searchLower = debouncedSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      (p.sku && p.sku.toLowerCase().includes(searchLower))
    );
  }, [products, debouncedSearch]);

  const subtotalAmount = useMemo(() =>
    cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0),
    [cart]
  );

  const discountAmount = useMemo(() => {
    const parsed = Number.parseFloat(discount);
    const raw = Number.isFinite(parsed) ? parsed : 0;
    return Math.max(0, Math.min(raw, subtotalAmount));
  }, [discount, subtotalAmount]);

  const totalAmount = useMemo(
    () => Math.max(0, subtotalAmount - discountAmount),
    [subtotalAmount, discountAmount]
  );

  const totalItems = useMemo(() =>
    cart.reduce((sum, item) => sum + item.cartQuantity, 0),
    [cart]
  );

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    if (product.quantity <= 0) {
      toast.warning("Out of Stock", `${product.name} is currently out of stock`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        const newQty = existing.cartQuantity + quantity;
        if (newQty > product.quantity) {
          toast.warning("Insufficient Stock", `Only ${product.quantity} units available`);
          return prev.map((item) =>
            item.id === product.id ? { ...item, cartQuantity: product.quantity } : item
          );
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, cartQuantity: newQty } : item
        );
      }
      const addQty = Math.min(quantity, product.quantity);
      return [...prev, { ...product, cartQuantity: addQty }];
    });
  }, [toast]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const newQty = item.cartQuantity + delta;
          if (newQty <= 0) return item;
          if (newQty > item.quantity) {
            toast.warning("Insufficient Stock", `Only ${item.quantity} units available`);
            return item;
          }
          return { ...item, cartQuantity: newQty };
        }
        return item;
      }).filter(item => item.cartQuantity > 0)
    );
  }, [toast]);

  const handleProductClick = (product: Product) => {
    if (product.quantity <= 0) {
      toast.warning("Out of Stock", `${product.name} is currently out of stock`);
      return;
    }

    // Check if already in cart, just increment
    const inCart = cart.find(item => item.id === product.id);
    if (inCart && inCart.cartQuantity >= product.quantity) {
      toast.warning("Maximum Reached", `All ${product.quantity} units already in cart`);
      return;
    }

    addToCart(product, 1);
  };

  const handleQuickAdd = () => {
    if (quickAddProduct) {
      const qty = parseInt(quickAddQty) || 1;
      addToCart(quickAddProduct, qty);
      setQuickAddProduct(null);
      setQuickAddQty("1");
    }
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setDiscount("");
    setShowClearConfirm(false);
    toast.info("Cart Cleared", "All items have been removed");
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.warning("Empty Cart", "Add items to cart before checkout");
      return;
    }

    setIsCheckingOut(true);
    const invoiceId = uuidv4();

    // Extra safety: re-check stock at checkout time (service also enforces this).
    const productsById = new Map(products.map((p) => [p.id, p] as const));
    for (const item of cart) {
      const product = productsById.get(item.id);
      if (!product) {
        toast.error("Checkout Failed", `Product not found: ${item.name}`);
        setIsCheckingOut(false);
        return;
      }
      if (item.cartQuantity > product.quantity) {
        toast.warning(
          "Insufficient Stock",
          `${item.name}: only ${product.quantity} units available`
        );
        setIsCheckingOut(false);
        return;
      }
    }

    const invoiceItems: Omit<InvoiceItem, "invoice_id">[] = cart.map((item) => ({
      id: uuidv4(),
      product_id: item.id,
      quantity: item.cartQuantity,
      price: item.price,
      cost_price: item.purchase_price ?? 0,
    }));

    try {
      await invoiceService.createInvoice(
        {
          id: invoiceId,
          customer_name: customerName.trim() || "Walking Customer",
          customer_phone: customerPhone.trim() || null,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          created_at: new Date().toISOString(),
        },
        invoiceItems
      );

      // NOTE: invoiceDataForPdf is commented out because auto-print is disabled.
      // Uncomment this and the setTimeout block below to re-enable auto-printing.
      /*
      const invoiceDataForPdf = {
        invoice: {
          id: invoiceId,
          customer_name: customerName.trim() || "Walking Customer",
          customer_phone: customerPhone.trim() || null,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          payment_mode: "cash" as const,
          created_at: new Date().toISOString(),
        },
        items: cart.map((item) => ({
          id: uuidv4(),
          invoice_id: invoiceId,
          product_id: item.id,
          product_name: item.name,
          quantity: item.cartQuantity,
          price: item.price,
          cost_price: item.purchase_price ?? 0,
        })),
      };
      */

      // Show success FIRST, before any print operations
      toast.success(
        "Invoice Created",
        `Invoice #${invoiceId.slice(0, 8).toUpperCase()} for ₹${totalAmount.toLocaleString()}`
      );

      // Clear cart and UI immediately
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("");
      setIsCheckingOut(false);

      // Refresh product quantities
      refetch();

      // NOTE: Auto-printing disabled to prevent UI freeze.
      // PDF generation (jsPDF) is CPU-intensive and blocks the main thread.
      // Users can manually export/print invoices from the Sales/Returns page.
      // 
      // To re-enable auto-printing in the future, consider using a Web Worker
      // for PDF generation, or implement a print queue that processes invoices
      // in the background.

      /* DISABLED: Auto-print feature
      setTimeout(async () => {
        const isWindows = navigator.platform.toLowerCase().includes('win');

        try {
          if (isWindows) {
            const { saveInvoicePdf } = await import("../utils/invoiceGenerator");
            const { tryPrintPdfSilent } = await import("../utils/printService");
            const pdfPath = await saveInvoicePdf(invoiceDataForPdf);
            const printResult = await tryPrintPdfSilent(pdfPath);
            if (!printResult.success) {
              console.warn("Silent print failed:", printResult.error);
            }
          } else {
            const { generateInvoicePdfBytes } = await import("../utils/invoiceGenerator");
            const { savePdfWithDialog } = await import("../utils/printService");

            const { bytes, filename } = await generateInvoicePdfBytes(invoiceDataForPdf);
            const saveResult = await savePdfWithDialog(bytes, filename);

            if (saveResult.success && saveResult.savedPath) {
              console.log("Invoice saved to:", saveResult.savedPath);
            } else if (saveResult.error && saveResult.error !== "Save cancelled by user") {
              console.warn("Save failed:", saveResult.error);
            }
          }
        } catch (printErr) {
          console.warn("Print/Save error (non-blocking):", printErr);
        }
      }, 100);
      */

    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Checkout Failed", message || "Could not create invoice. Please try again.");
      setIsCheckingOut(false);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      {/* Product Selection Area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Search Bar with Keyboard Hint */}
        <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 transition-shadow focus-within:shadow-md focus-within:border-indigo-300">
          {/* ... existing search code ... */}
          <div className="pl-3 text-slate-400">
            <Search size={20} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search products by name or SKU..."
            className="flex-1 outline-none text-slate-700 placeholder:text-slate-400 bg-transparent text-lg h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 mr-2">
            <Keyboard size={12} />
            <span className="font-mono">Ctrl+F</span>
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors mr-1"
            >
              <X size={18} className="text-slate-500" />
            </button>
          )}
        </div>



        {/* Product Grid */}
        {/* Product Grid - Virtualized */}
        <div className="flex-1 overflow-visible p-1 bg-slate-50/30 rounded-3xl border border-slate-100/50 ml-1">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                <Package size={32} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">{search ? "No products found" : "No products available"}</h3>
              <p className="text-slate-500 max-w-xs mt-1">{search ? "Try searching for something else" : "Add products in the Inventory tab to get started"}</p>
            </div>
          ) : (
            <VirtuosoGrid
              style={{ height: '100%', width: '100%' }}
              totalCount={filteredProducts.length}
              listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 p-4 pb-20"
              itemContent={(index: number) => {
                const p = filteredProducts[index];
                if (!p) return null;

                const inCartItem = cart.find((item) => item.id === p.id);
                const available = p.quantity - (inCartItem?.cartQuantity || 0);

                let statusText = `${available} in stock`;
                let statusVariant: "success" | "warning" | "danger" = "success";

                if (p.quantity <= 0) { statusText = "Out of Stock"; statusVariant = "danger"; }
                else if (available <= 0) { statusText = "All in Cart"; statusVariant = "warning"; }
                else if (available <= 5) { statusText = `${available} left`; statusVariant = "warning"; }

                const isDisabled = p.quantity <= 0;

                return (
                  <div className="p-2 h-full">
                    <button
                      onClick={() => handleProductClick(p)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isDisabled) {
                          setQuickAddProduct(p);
                          setQuickAddQty("1");
                        }
                      }}
                      disabled={isDisabled}
                      className={`
                        relative text-left p-4 rounded-2xl border transition-all duration-300 group flex flex-col h-full w-full shadow-sm
                        ${isDisabled
                          ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'
                          : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:-translate-y-1.5'
                        }
                        ${inCartItem ? 'ring-2 ring-indigo-500 ring-offset-2 border-indigo-200 bg-indigo-50/10' : ''}
                      `}
                    >
                      {/* In Cart Indicator */}
                      {inCartItem && (
                        <div className="absolute -top-2 -right-2 w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white z-10 animate-in zoom-in">
                          {inCartItem.cartQuantity}
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${inCartItem ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
                          <Package size={20} />
                        </div>
                        <Badge variant={statusVariant} size="sm" className="shadow-sm text-[10px]">
                          {statusText}
                        </Badge>
                      </div>

                      <div className="flex-1 min-h-[3rem]">
                        <h3 className="font-bold text-slate-800 line-clamp-2 leading-snug mb-1 group-hover:text-indigo-700 transition-colors text-sm">{p.name}</h3>
                        <p className="text-[10px] text-slate-400 font-mono tracking-wide">{p.sku || "NO SKU"}</p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-base font-bold text-slate-900">₹{p.price.toLocaleString()}</span>
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all
                            ${isDisabled
                              ? 'bg-slate-100 text-slate-300'
                              : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-600 group-hover:text-white shadow-sm'
                            }`}
                        >
                          <Plus size={14} strokeWidth={2.5} />
                        </div>
                      </div>
                    </button>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 flex flex-col h-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShoppingCart className="text-indigo-600" size={20} />
              Current Order
            </h2>
            {cart.length > 0 && (
              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full border border-indigo-200">
                {totalItems} items
              </span>
            )}
          </div>
        </div>

        {/* Customer Name */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Customer</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <User size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Walking Customer"
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 font-medium"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Phone</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <span className="text-xs text-slate-400 font-bold">+91</span>
              <input
                type="tel"
                placeholder="Optional"
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 font-medium"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <ShoppingCart size={48} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Cart is empty</p>
              <p className="text-xs text-slate-400">Select products to add</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">₹{item.price.toLocaleString()} / unit</p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.cartQuantity === 1) {
                          removeFromCart(item.id);
                        } else {
                          updateCartQuantity(item.id, -1);
                        }
                      }}
                      className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                    >
                      {item.cartQuantity === 1 ? <Trash2 size={12} className="text-red-500" /> : <Minus size={12} />}
                    </button>
                    <span className="text-xs font-bold w-6 text-center text-slate-700">{item.cartQuantity}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateCartQuantity(item.id, 1);
                      }}
                      disabled={item.cartQuantity >= item.quantity}
                      className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white hover:shadow-sm text-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-slate-900">
                    ₹{(item.price * item.cartQuantity).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer */}
        <div className="p-5 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
          {cart.length > 0 && (
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span className="font-medium text-slate-700">₹{subtotalAmount.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                <span>Discount</span>
                <div className="flex items-center gap-1 border-b border-slate-300 focus-within:border-indigo-500 transition-colors">
                  <span className="text-slate-400">₹</span>
                  <input
                    type="number"
                    min={0}
                    max={subtotalAmount}
                    step={1}
                    placeholder="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-16 text-right bg-transparent outline-none font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-end">
                <span className="text-sm font-bold text-slate-800">Total</span>
                <span className="text-2xl font-bold text-indigo-600 leading-none">₹{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {cart.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
                title="Clear Cart"
              >
                <Trash2 size={20} />
              </button>
            )}
            <button
              className={`
                flex-1 h-12 rounded-xl font-bold text-white shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all
                ${cart.length === 0 || isCheckingOut
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5'
                }
              `}
              disabled={cart.length === 0 || isCheckingOut}
              onClick={handleCheckout}
            >
              {isCheckingOut ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard size={20} />
                  <span>Checkout</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      {
        quickAddProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setQuickAddProduct(null)}
            />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in zoom-in-95 duration-200">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Package size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 leading-tight">{quickAddProduct.name}</h3>
                <p className="text-sm text-slate-500 mt-1">Available: {quickAddProduct.quantity} units</p>
              </div>

              <div className="flex items-center justify-center gap-4 mb-8">
                <button
                  onClick={() => setQuickAddQty(String(Math.max(1, parseInt(quickAddQty) - 1)))}
                  className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors"
                >
                  <Minus size={24} />
                </button>
                <div className="w-20 text-center">
                  <input
                    type="number"
                    value={quickAddQty}
                    onChange={(e) => setQuickAddQty(e.target.value)}
                    className="w-full text-center text-3xl font-bold text-slate-800 outline-none bg-transparent"
                    min="1"
                    max={quickAddProduct.quantity}
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => setQuickAddQty(String(Math.min(quickAddProduct.quantity, parseInt(quickAddQty) + 1)))}
                  className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors"
                >
                  <Plus size={24} />
                </button>
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setQuickAddProduct(null)} className="flex-1 h-12 rounded-xl">
                  Cancel
                </Button>
                <Button onClick={handleQuickAdd} className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700" leftIcon={<Check size={18} />}>
                  Add to Cart
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* Clear Cart Confirmation */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={clearCart}
        title="Clear Cart"
        message="Are you sure you want to remove all items from the cart?"
        confirmText="Clear All"
        variant="warning"
      />
    </div >
  );
};
