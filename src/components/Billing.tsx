import {
  Check,
  ChevronDown,
  CreditCard,
  Edit2,
  Keyboard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  User,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VirtuosoGrid } from 'react-virtuoso';
import { v4 as uuidv4 } from "uuid";
import { invoiceManagementService } from "../db/invoiceManagementService";
import { invoiceService } from "../db/invoiceService";
import { wholesaleStoreService } from "../db/wholesaleStoreService";
import { useDebounce, useKeyboardShortcut, useProducts } from "../hooks";
import { CartItem, InvoiceItem, PaymentMode, Product, SaleType, WholesaleStore } from "../types";
import { shareInvoiceOnWhatsApp, shareWholesaleInvoiceOnWhatsApp } from "../utils/shareWhatsApp";
import { Badge, Button, ConfirmModal, useToast } from "./ui";

export const Billing: React.FC = () => {
  const { products, loading, refetch } = useProducts();
  const toast = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sale type toggle
  const [saleType, setSaleType] = useState<SaleType>("retail");

  // Wholesale store selection
  const [stores, setStores] = useState<WholesaleStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Search state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);

  // Quick add quantity modal
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);
  const [quickAddQty, setQuickAddQty] = useState("1");

  // Clear cart confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Custom prices for wholesale items (biller-decided per-item pricing)
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // Load wholesale stores
  useEffect(() => {
    const loadStores = async () => {
      try {
        const allStores = await wholesaleStoreService.getAll();
        setStores(allStores);
      } catch (error) {
        console.error("Failed to load stores:", error);
      }
    };
    loadStores();
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcut("f", () => searchInputRef.current?.focus(), { ctrl: true });
  useKeyboardShortcut("Escape", () => {
    setSearch("");
    searchInputRef.current?.blur();
  });

  // Reset cart when switching sale type
  const handleSaleTypeChange = (newType: SaleType) => {
    if (cart.length > 0) {
      const confirmSwitch = window.confirm(
        "Switching sale type will clear the current cart. Continue?"
      );
      if (!confirmSwitch) return;
    }
    setSaleType(newType);
    setCart([]);
    setDiscount("");
    setSelectedStoreId("");
    setCustomerName("");
    setCustomerPhone("");
    setPaymentMode("cash");
    setCustomPrices({});
  };

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId]
  );

  const getProductPrice = useCallback(
    (product: Product | CartItem) => {
      // For wholesale, check if biller has set a custom price
      if (saleType === "wholesale" && customPrices[product.id] !== undefined) {
        return customPrices[product.id];
      }
      return product.price;
    },
    [saleType, customPrices]
  );

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return products;
    const searchLower = debouncedSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      (p.sku && p.sku.toLowerCase().includes(searchLower))
    );
  }, [products, debouncedSearch]);

  const subtotalAmount = useMemo(() =>
    cart.reduce((sum, item) => {
      const price = getProductPrice(item);
      return sum + price * item.cartQuantity;
    }, 0),
    [cart, getProductPrice]
  );

  const discountAmount = useMemo(() => {
    if (saleType === "wholesale") return 0; // No discount for wholesale
    const parsed = Number.parseFloat(discount);
    const raw = Number.isFinite(parsed) ? parsed : 0;
    return Math.max(0, Math.min(raw, subtotalAmount));
  }, [discount, subtotalAmount, saleType]);

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
    setPaymentMode("cash");
    setSelectedStoreId("");
    setCustomPrices({});
    setShowClearConfirm(false);
    toast.info("Cart Cleared", "All items have been removed");
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.warning("Empty Cart", "Add items to cart before checkout");
      return;
    }

    // Wholesale validation
    if (saleType === "wholesale") {
      if (!selectedStore) {
        toast.warning("Select Store", "Please select a wholesale store before checkout");
        return;
      }

      // Credit limit check (per-sale)
      if (paymentMode === "credit" && selectedStore.credit_limit > 0 && totalAmount > selectedStore.credit_limit) {
        toast.error(
          "Credit Limit Exceeded",
          `This bill (₹${totalAmount.toLocaleString()}) exceeds the per-sale credit limit of ₹${selectedStore.credit_limit.toLocaleString()} for ${selectedStore.store_name}`
        );
        return;
      }
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
      price: getProductPrice(item),
      cost_price: item.purchase_price ?? 0,
    }));

    const invoiceStatus: "pending" | "paid" =
      saleType === "wholesale" && paymentMode === "credit" ? "pending" : "paid";

    const customerNameValue =
      saleType === "wholesale" && selectedStore
        ? selectedStore.store_name
        : customerName.trim() || "Walking Customer";

    const customerPhoneValue =
      saleType === "wholesale" && selectedStore
        ? selectedStore.contact_number
        : customerPhone.trim() || null;

    try {
      await invoiceService.createInvoice(
        {
          id: invoiceId,
          customer_name: customerNameValue,
          customer_phone: customerPhoneValue,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          sale_type: saleType,
          store_id: saleType === "wholesale" ? selectedStoreId : null,
          status: invoiceStatus,
          payment_mode: paymentMode,
          created_at: new Date().toISOString(),
        },
        invoiceItems
      );

      let invoiceNumberLabel = invoiceId.slice(0, 8).toUpperCase();
      try {
        const record = await invoiceManagementService.saveInvoiceRecord({
          invoiceId,
          customerName: customerNameValue,
          customerPhone: customerPhoneValue,
          subtotal: subtotalAmount,
          grandTotal: totalAmount,
          discountAmount: discountAmount,
          items: cart.map((item) => ({
            name: item.name,
            qty: item.cartQuantity,
            rate: getProductPrice(item),
            total: item.cartQuantity * getProductPrice(item),
          })),
          status: invoiceStatus,
          paymentMode: paymentMode,
          saleType: saleType,
          storeId: saleType === "wholesale" ? selectedStoreId : null,
          storeName: saleType === "wholesale" && selectedStore ? selectedStore.store_name : null,
          storeContactPerson: saleType === "wholesale" && selectedStore ? selectedStore.contact_person : null,
          storeContactNumber: saleType === "wholesale" && selectedStore ? selectedStore.contact_number : null,
          storeAddress: saleType === "wholesale" && selectedStore ? selectedStore.store_address : null,
          paidAmount: invoiceStatus === "pending" ? 0 : totalAmount,
          outstandingAmount: invoiceStatus === "pending" ? totalAmount : 0,
          createdAt: new Date().toISOString(),
        });
        invoiceNumberLabel = record.invoice_number;

        // Send invoice via WhatsApp after invoice record is saved.
        if (saleType === "wholesale" && selectedStore) {
          const pendingAmount = invoiceStatus === "pending" ? totalAmount : 0;
          try {
            await shareWholesaleInvoiceOnWhatsApp(record, selectedStore, pendingAmount);
          } catch (whatsappError) {
            console.error("WhatsApp share failed:", whatsappError);
            toast.warning("WhatsApp Failed", "Invoice saved but WhatsApp could not be opened");
          }
        } else if (saleType === "retail") {
          if (record.customer_phone) {
            try {
              await shareInvoiceOnWhatsApp(record);
            } catch (whatsappError) {
              console.error("WhatsApp share failed:", whatsappError);
              toast.warning("WhatsApp Failed", "Invoice saved but WhatsApp could not be opened");
            }
          } else {
            toast.info("WhatsApp Skipped", "Retail invoice saved. Add a customer phone number to share on WhatsApp.");
          }
        }
      } catch (error) {
        console.error(error);
        toast.warning("Invoice Record Failed", "Bill saved, but invoice record could not be generated");
      }

      // Show success message
      toast.success(
        "Invoice Created",
        `${saleType === "wholesale" ? "Wholesale " : ""}Invoice #${invoiceNumberLabel} for ₹${totalAmount.toLocaleString()}${invoiceStatus === "pending" ? " (Credit)" : ""}`
      );

      // Clear cart and UI immediately
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("");
      setPaymentMode("cash");
      setCustomPrices({});
      setIsCheckingOut(false);

      // Refresh product quantities
      refetch();

      // NOTE: Auto-printing is disabled to prevent UI freeze.
      // PDF generation (jsPDF) is synchronous and blocks the main thread.
      // Users can print invoices from the Transactions page instead.

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
    <div className="flex gap-5 h-[calc(100vh-7rem)] animate-in fade-in duration-500">
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
                const displayPrice = getProductPrice(p);

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

                      <div className="flex-1 min-h-12">
                        <h3 className="font-bold text-slate-800 line-clamp-2 leading-snug mb-1 group-hover:text-indigo-700 transition-colors text-sm">{p.name}</h3>
                        <p className="text-[10px] text-slate-400 font-mono tracking-wide">{p.sku || "NO SKU"}</p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-base font-bold text-slate-900">₹{displayPrice.toLocaleString()}</span>
                        </div>
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
        {/* Sale Type Toggle */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex bg-slate-200 rounded-xl p-1">
            <button
              onClick={() => handleSaleTypeChange("retail")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                saleType === "retail"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <User size={16} />
              Retail
            </button>
            <button
              onClick={() => handleSaleTypeChange("wholesale")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                saleType === "wholesale"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Store size={16} />
              Wholesale
            </button>
          </div>
        </div>

        {/* Customer / Store + Payment Section */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3 shrink-0">
          {saleType === "wholesale" ? (
            /* Store Selector */
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Select Store *</label>
              <div className="relative">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                  <Store size={16} className="text-slate-400" />
                  {selectedStore ? (
                    <div className="flex-1 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-slate-700">{selectedStore.store_name}</span>
                        <span className="text-xs text-slate-400 ml-2">({selectedStore.contact_person})</span>
                      </div>
                      <button
                        onClick={() => setSelectedStoreId("")}
                        className="p-1 hover:bg-slate-200 rounded-lg"
                      >
                        <X size={14} className="text-slate-400" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedStoreId}
                      onChange={(e) => setSelectedStoreId(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-slate-700 outline-none font-medium"
                    >
                      <option value="">Choose a store...</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.store_name} — {s.contact_person}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {selectedStore && selectedStore.credit_limit > 0 && (
                <p className="text-xs text-slate-500 px-1">
                  Credit limit: ₹{selectedStore.credit_limit.toLocaleString()} / sale
                </p>
              )}
            </div>
          ) : (
            /* Retail Customer Section */
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Customer (optional)</label>
                <input
                  type="text"
                  placeholder="Walking Customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-700 placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Phone (optional)</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          {/* Payment Mode Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Payment Mode</label>
            <div className="relative">
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className={`w-full appearance-none px-3 py-2.5 text-sm font-semibold border rounded-xl outline-none cursor-pointer transition-all pr-10 ${
                  paymentMode === "credit"
                    ? "bg-amber-50 border-amber-300 text-amber-700 focus:ring-2 focus:ring-amber-200"
                    : "bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                }`}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                {saleType === "wholesale" && <option value="credit">Credit (Pay Later)</option>}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Cart Header */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <ShoppingCart size={16} className="text-indigo-600" />
            {saleType === "wholesale" ? "Wholesale Order" : "Cart"}
          </h2>
          {cart.length > 0 && (
            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
              {totalItems} items
            </span>
          )}
        </div>

        {/* Cart Items — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-slate-50/30 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <ShoppingCart size={40} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium text-sm">Cart is empty</p>
              <p className="text-xs text-slate-400">Click products to add</p>
            </div>
          ) : (
            cart.map((item) => {
              const price = getProductPrice(item);
              const hasCustomPrice = saleType === "wholesale" && customPrices[item.id] !== undefined;
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all"
                >
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                      {/* Inline price editing for wholesale */}
                      {saleType === "wholesale" ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            onClick={() => {
                              const current = customPrices[item.id] ?? item.price;
                              const input = prompt(`Set price for ${item.name}`, String(current));
                              if (input !== null) {
                                const newPrice = parseFloat(input);
                                if (Number.isFinite(newPrice) && newPrice >= 0) {
                                  setCustomPrices(prev => ({ ...prev, [item.id]: newPrice }));
                                }
                              }
                            }}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                            title="Edit price"
                          >
                            <Edit2 size={10} />
                            <span className={`font-medium ${hasCustomPrice ? "text-indigo-700" : "text-slate-500"}`}>
                              ₹{price.toLocaleString()}
                            </span>
                          </button>
                          {hasCustomPrice && (
                            <span className="text-[10px] text-slate-400 line-through">₹{item.price.toLocaleString()}</span>
                          )}
                          <span className="text-[10px] text-slate-400">/ unit</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 mt-0.5">₹{price.toLocaleString()} / unit</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.cartQuantity === 1) {
                              removeFromCart(item.id);
                              setCustomPrices(prev => {
                                const next = { ...prev };
                                delete next[item.id];
                                return next;
                              });
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
                        ₹{(price * item.cartQuantity).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Footer */}
        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] shrink-0">
          {cart.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span className="font-medium text-slate-700">₹{subtotalAmount.toLocaleString()}</span>
              </div>

              {saleType === "retail" && (
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
              )}

              {paymentMode === "credit" && (
                <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 px-3 py-2 rounded-lg border border-amber-200">
                  <CreditCard size={14} />
                  <span>This will be recorded as credit (pending payment)</span>
                </div>
              )}

              <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between items-end">
                <span className="text-sm font-bold text-slate-800">Total</span>
                <span className="text-xl font-bold text-indigo-600 leading-none">₹{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {cart.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
                title="Clear Cart"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              className={`
                flex-1 h-11 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all text-sm
                ${cart.length === 0 || isCheckingOut || (saleType === "wholesale" && !selectedStoreId)
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : paymentMode === "credit"
                    ? 'bg-amber-600 hover:bg-amber-700 hover:shadow-xl hover:-translate-y-0.5 shadow-amber-200'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 shadow-indigo-200'
                }
              `}
              disabled={cart.length === 0 || isCheckingOut || (saleType === "wholesale" && !selectedStoreId)}
              onClick={handleCheckout}
            >
              {isCheckingOut ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard size={18} />
                  <span>
                    {paymentMode === "credit"
                      ? "Bill on Credit"
                      : `Checkout`}
                  </span>
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
                <p className="text-sm font-semibold text-indigo-600 mt-1">₹{getProductPrice(quickAddProduct).toLocaleString()} / unit</p>
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
