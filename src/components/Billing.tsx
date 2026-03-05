import {
  Check,
  ChevronDown,
  CreditCard,
  Edit2,
  Keyboard,
  Layers,
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
import { v4 as uuidv4 } from "uuid";
import { invoiceManagementService } from "../db/invoiceManagementService";
import { invoiceService } from "../db/invoiceService";
import { wholesaleStoreService } from "../db/wholesaleStoreService";
import { useDebounce, useKeyboardShortcut, useProducts } from "../hooks";
import { CartItem, InvoiceItem, PaymentMode, Product, SaleType, WholesaleStore } from "../types";
import { shareInvoiceOnWhatsApp, shareWholesaleInvoiceOnWhatsApp } from "../utils/shareWhatsApp";
import { Button, ConfirmModal, useToast } from "./ui";

interface BillingProps {
  onNavigate?: (tab: string) => void;
}

export const Billing: React.FC<BillingProps> = ({ onNavigate }) => {
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

  // Search dropdown visibility & keyboard navigation
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [dropdownHighlight, setDropdownHighlight] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);

  // Custom prices for wholesale items (biller-decided per-item pricing)
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // Materials used & service charge (retail only)
  const [materialItems, setMaterialItems] = useState<{ id: string; description: string; qty: string; price: string }[]>([]);
  const [serviceChargeAmount, setServiceChargeAmount] = useState("");

  // Material history for autocomplete (persisted in localStorage)
  const [matHistory, setMatHistory] = useState<{ name: string; price: number }[]>([]);
  const [activeSuggestId, setActiveSuggestId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string; price: number }[]>([]);
  const suggestRef = useRef<HTMLDivElement>(null);

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
    setShowSearchDropdown(false);
    setDropdownHighlight(-1);
    searchInputRef.current?.blur();
  });

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load material history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("motor_material_history");
      if (stored) setMatHistory(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Close material suggestion dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setActiveSuggestId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    setMaterialItems([]);
    setServiceChargeAmount("");
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

  const materialsTotal = useMemo(() =>
    materialItems.reduce((sum, m) => {
      const qty = parseFloat(m.qty) || 0;
      const price = parseFloat(m.price) || 0;
      return sum + qty * price;
    }, 0),
    [materialItems]
  );

  const serviceTotal = useMemo(() => {
    const parsed = parseFloat(serviceChargeAmount);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [serviceChargeAmount]);

  const grandTotal = useMemo(
    () => Math.max(0, totalAmount + materialsTotal + serviceTotal),
    [totalAmount, materialsTotal, serviceTotal]
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
    setMaterialItems([]);
    setServiceChargeAmount("");
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
          `This bill (â‚¹${totalAmount.toLocaleString()}) exceeds the per-sale credit limit of â‚¹${selectedStore.credit_limit.toLocaleString()} for ${selectedStore.store_name}`
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
          total_amount: grandTotal,
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
          grandTotal: grandTotal,
          discountAmount: discountAmount,
          items: [
            ...cart.map((item) => ({
              name: item.name,
              qty: item.cartQuantity,
              rate: getProductPrice(item),
              total: item.cartQuantity * getProductPrice(item),
              item_type: 'product' as const,
            })),
            ...materialItems
              .filter((m) => m.description.trim() && (parseFloat(m.qty) || 0) > 0 && (parseFloat(m.price) || 0) >= 0)
              .map((m) => {
                const qty = parseFloat(m.qty) || 0;
                const price = parseFloat(m.price) || 0;
                return {
                  name: m.description.trim(),
                  qty,
                  rate: price,
                  total: qty * price,
                  item_type: 'material' as const,
                };
              }),
            ...(serviceTotal > 0
              ? [{
                  name: "Service Charge",
                  qty: 1,
                  rate: serviceTotal,
                  total: serviceTotal,
                  item_type: 'service' as const,
                }]
              : []),
          ],
          status: invoiceStatus,
          paymentMode: paymentMode,
          saleType: saleType,
          storeId: saleType === "wholesale" ? selectedStoreId : null,
          storeName: saleType === "wholesale" && selectedStore ? selectedStore.store_name : null,
          storeContactPerson: saleType === "wholesale" && selectedStore ? selectedStore.contact_person : null,
          storeContactNumber: saleType === "wholesale" && selectedStore ? selectedStore.contact_number : null,
          storeAddress: saleType === "wholesale" && selectedStore ? selectedStore.store_address : null,
          paidAmount: invoiceStatus === "pending" ? 0 : grandTotal,
          outstandingAmount: invoiceStatus === "pending" ? grandTotal : 0,
          createdAt: new Date().toISOString(),
        });
        invoiceNumberLabel = record.invoice_number;

        // Send invoice via WhatsApp after invoice record is saved.
        if (saleType === "wholesale" && selectedStore) {
          const pendingAmount = invoiceStatus === "pending" ? totalAmount : 0;
          void shareWholesaleInvoiceOnWhatsApp(record, selectedStore, pendingAmount).catch((whatsappError) => {
            console.error("WhatsApp share failed:", whatsappError);
            toast.warning("WhatsApp Failed", "Invoice saved but WhatsApp could not be opened");
          });
        } else if (saleType === "retail") {
          if (record.customer_phone) {
            void shareInvoiceOnWhatsApp(record).catch((whatsappError) => {
              console.error("WhatsApp share failed:", whatsappError);
              toast.warning("WhatsApp Failed", "Invoice saved but WhatsApp could not be opened");
            });
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
        `${saleType === "wholesale" ? "Wholesale " : ""}Invoice #${invoiceNumberLabel} for â‚¹${grandTotal.toLocaleString()}${invoiceStatus === "pending" ? " (Credit)" : ""}`
      );

      // Clear cart and UI immediately
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("");
      setPaymentMode("cash");
      setCustomPrices({});
      // Save used materials to history for autocomplete
      const usedMats = materialItems.filter(m => m.description.trim() && parseFloat(m.price) > 0);
      if (usedMats.length > 0) {
        const stored = localStorage.getItem("motor_material_history");
        const existing: { name: string; price: number }[] = stored ? JSON.parse(stored) : [];
        const updated = [...existing];
        for (const mat of usedMats) {
          const idx = updated.findIndex(h => h.name.toLowerCase() === mat.description.trim().toLowerCase());
          if (idx >= 0) { updated[idx].price = parseFloat(mat.price); }
          else { updated.push({ name: mat.description.trim(), price: parseFloat(mat.price) }); }
        }
        localStorage.setItem("motor_material_history", JSON.stringify(updated));
        setMatHistory(updated);
      }

      setMaterialItems([]);
      setServiceChargeAmount("");
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
    <div className="flex flex-col h-[calc(100vh-7rem)] animate-in fade-in duration-500">

      {/* Top Bar: Sale toggle + Search + All Products button */}
      <div className="flex items-center gap-4 mb-4 shrink-0">
        {/* Sale Type Toggle */}
        <div className="flex bg-slate-200 rounded-xl p-1 shrink-0">
          <button
            onClick={() => handleSaleTypeChange("retail")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              saleType === "wholesale"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Store size={16} />
            Wholesale
          </button>
        </div>

        {/* Search Bar */}
        <div ref={searchContainerRef} className="flex-1 relative">
          <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 transition-shadow focus-within:shadow-md focus-within:border-indigo-300">
            <div className="pl-3 text-slate-600">
              <Search size={20} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search products by name or SKU to add..."
              className="flex-1 outline-none text-slate-900 placeholder:text-slate-500 bg-transparent text-base h-10"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSearchDropdown(true);
                setDropdownHighlight(-1);
              }}
              onFocus={() => { if (search) setShowSearchDropdown(true); }}
              onKeyDown={(e) => {
                const visibleProducts = filteredProducts.slice(0, 20);
                if (!showSearchDropdown || visibleProducts.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setDropdownHighlight(prev => {
                    const next = prev < visibleProducts.length - 1 ? prev + 1 : 0;
                    const el = dropdownListRef.current?.children[next] as HTMLElement | undefined;
                    el?.scrollIntoView({ block: "nearest" });
                    return next;
                  });
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setDropdownHighlight(prev => {
                    const next = prev > 0 ? prev - 1 : visibleProducts.length - 1;
                    const el = dropdownListRef.current?.children[next] as HTMLElement | undefined;
                    el?.scrollIntoView({ block: "nearest" });
                    return next;
                  });
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const idx = dropdownHighlight >= 0 ? dropdownHighlight : 0;
                  const p = visibleProducts[idx];
                  if (p && p.quantity > 0) {
                    const inCart = cart.find(c => c.id === p.id);
                    const available = p.quantity - (inCart?.cartQuantity || 0);
                    if (available > 0) {
                      handleProductClick(p);
                      setDropdownHighlight(-1);
                    }
                  }
                }
              }}
            />
            <div className="flex items-center gap-1 text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 mr-2">
              <Keyboard size={12} />
              <span className="font-mono">Ctrl+F</span>
            </div>
            {search && (
              <button
                onClick={() => { setSearch(""); setShowSearchDropdown(false); }}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors mr-1"
              >
                <X size={18} className="text-slate-700" />
              </button>
            )}
          </div>

          {/* Search Dropdown */}
          {showSearchDropdown && search && (
            <div ref={dropdownListRef} className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-80 overflow-y-auto custom-scrollbar">
              {filteredProducts.length === 0 ? (
                <div className="p-6 text-center text-slate-600 text-sm font-semibold">
                  No products found for &ldquo;{search}&rdquo;
                </div>
              ) : (
                filteredProducts.slice(0, 20).map((p, idx) => {
                  const inCartItem = cart.find((item) => item.id === p.id);
                  const available = p.quantity - (inCartItem?.cartQuantity || 0);
                  const displayPrice = getProductPrice(p);
                  const isDisabled = p.quantity <= 0 || available <= 0;
                  const isHighlighted = idx === dropdownHighlight;

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (!isDisabled) {
                          handleProductClick(p);
                          setDropdownHighlight(-1);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isDisabled) {
                          setQuickAddProduct(p);
                          setQuickAddQty("1");
                          setShowSearchDropdown(false);
                          setDropdownHighlight(-1);
                        }
                      }}
                      disabled={isDisabled}
                      className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors border-b border-slate-50 last:border-b-0 ${
                        isDisabled
                          ? "opacity-50 cursor-not-allowed bg-slate-50"
                          : isHighlighted
                            ? "bg-indigo-100 cursor-pointer"
                            : "hover:bg-indigo-50/60 cursor-pointer"
                      } ${inCartItem && !isHighlighted ? "bg-indigo-50/30" : ""}`}
                    >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${inCartItem ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                        <Package size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.sku || "NO SKU"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900">{"\u20B9"}{displayPrice.toLocaleString()}</p>
                        <p className={`text-xs ${available <= 0 ? "text-red-500" : available <= 5 ? "text-amber-500" : "text-slate-400"}`}>
                          {p.quantity <= 0 ? "Out of stock" : available <= 0 ? "All in cart" : `${available} available`}
                        </p>
                      </div>
                      {inCartItem && (
                        <span className="bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                          {inCartItem.cartQuantity}
                        </span>
                      )}
                      {!isDisabled && !inCartItem && (
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <Plus size={14} className="text-slate-700" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* All Products Button */}
        {onNavigate && (
          <button
            onClick={() => onNavigate("stock")}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all shadow-sm shrink-0"
          >
            <Layers size={16} />
            All Products
          </button>
        )}
      </div>

      {/* Main Content (two-column: cart left, form/totals right) */}
      <div className="flex-1 flex gap-5 min-h-0 overflow-hidden">

        {/* LEFT: Cart Items */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          {/* Cart Header */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ShoppingCart size={16} className="text-indigo-600" />
              {saleType === "wholesale" ? "Wholesale Order" : "Cart"}
            </h2>
            <div className="flex items-center gap-3">
              {cart.length > 0 && (
                <>
                  <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                    {totalItems} items
                  </span>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                    title="Clear Cart"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <ShoppingCart size={48} className="text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">Cart is empty</p>
                <p className="text-sm text-slate-400 mt-1">Search and add products above</p>
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
                    <div className="flex gap-4 items-center">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Package size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                        {saleType === "wholesale" ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
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
                                {"\u20B9"}{price.toLocaleString()}
                              </span>
                            </button>
                            {hasCustomPrice && (
                              <span className="text-[10px] text-slate-400 line-through">{"\u20B9"}{item.price.toLocaleString()}</span>
                            )}
                            <span className="text-[10px] text-slate-400">/ unit</span>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 mt-0.5">{"\u20B9"}{price.toLocaleString()} / unit</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
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
                            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white hover:shadow-sm text-slate-700 transition-all"
                          >
                            {item.cartQuantity === 1 ? <Trash2 size={13} className="text-red-600" /> : <Minus size={13} />}
                          </button>
                          <span className="text-sm font-bold w-8 text-center text-slate-700">{item.cartQuantity}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateCartQuantity(item.id, 1);
                            }}
                            disabled={item.cartQuantity >= item.quantity}
                            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white hover:shadow-sm text-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-slate-900 w-24 text-right">
                          {"\u20B9"}{(price * item.cartQuantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Service & Materials --- retail only, at bottom of cart panel */}
          {saleType === "retail" && (
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/60">
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Service &amp; Materials</span>
              </div>
              <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-80 custom-scrollbar">
                {/* Service Charge row */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-2">Service Charge</label>
                  <input
                      type="number"
                      placeholder="Enter amount"
                      min="0"
                      value={serviceChargeAmount}
                      onChange={(e) => setServiceChargeAmount(e.target.value)}
                      className="w-full max-w-[180px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-slate-800 placeholder:text-slate-400 transition-all"
                    />
                </div>

                {/* Materials Used */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-600">Materials Used</label>
                    <button
                      onClick={() => setMaterialItems(prev => [...prev, { id: uuidv4(), description: "", qty: "1", price: "" }])}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
                    >
                      <Plus size={12} strokeWidth={2.5} />
                      Add Row
                    </button>
                  </div>

                  {materialItems.length === 0 ? (
                    <p className="text-sm text-slate-400 italic py-1">Tap &quot;Add Row&quot; to record materials used in this fitting.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_60px_96px_32px] gap-1.5 px-0.5">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Description</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-center">Qty</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-right">Unit Price</span>
                        <span></span>
                      </div>
                      {materialItems.map((mat) => (
                        <div key={mat.id} className="grid grid-cols-[1fr_60px_96px_32px] gap-1.5 items-center">
                          <div className="relative" ref={activeSuggestId === mat.id ? suggestRef : null}>
                            <input
                              type="text"
                              placeholder="e.g. Wire 2m"
                              value={mat.description}
                              autoComplete="off"
                              onChange={(e) => {
                                const val = e.target.value;
                                setMaterialItems(prev => prev.map(m => m.id === mat.id ? { ...m, description: val } : m));
                                if (val.trim().length > 0) {
                                  const filtered = matHistory.filter(h =>
                                    h.name.toLowerCase().includes(val.toLowerCase())
                                  );
                                  setSuggestions(filtered);
                                  setActiveSuggestId(filtered.length > 0 ? mat.id : null);
                                } else {
                                  setSuggestions([]);
                                  setActiveSuggestId(null);
                                }
                              }}
                              onFocus={() => {
                                if (mat.description.trim().length > 0) {
                                  const filtered = matHistory.filter(h =>
                                    h.name.toLowerCase().includes(mat.description.toLowerCase())
                                  );
                                  if (filtered.length > 0) {
                                    setSuggestions(filtered);
                                    setActiveSuggestId(mat.id);
                                  }
                                } else if (matHistory.length > 0) {
                                  setSuggestions(matHistory.slice(0, 8));
                                  setActiveSuggestId(mat.id);
                                }
                              }}
                              className="w-full px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 text-slate-800 placeholder:text-slate-400 transition-all"
                            />
                            {activeSuggestId === mat.id && suggestions.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-50 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-md overflow-hidden">
                                {suggestions.map((s) => (
                                  <button
                                    key={s.name}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setMaterialItems(prev => prev.map(m =>
                                        m.id === mat.id ? { ...m, description: s.name, price: String(s.price) } : m
                                      ));
                                      setActiveSuggestId(null);
                                      setSuggestions([]);
                                    }}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-indigo-50 text-left"
                                  >
                                    <span className="text-slate-700 truncate">{s.name}</span>
                                    <span className="text-xs text-slate-400 ml-2 shrink-0">{"\u20B9"}{s.price.toLocaleString()}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <input
                            type="number"
                            placeholder="1"
                            min="0"
                            value={mat.qty}
                            onChange={(e) => setMaterialItems(prev => prev.map(m => m.id === mat.id ? { ...m, qty: e.target.value } : m))}
                            className="px-2 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 text-center text-slate-800 transition-all"
                          />
                          <input
                              type="number"
                              placeholder="Price"
                              min="0"
                              value={mat.price}
                              onChange={(e) => setMaterialItems(prev => prev.map(m => m.id === mat.id ? { ...m, price: e.target.value } : m))}
                              className="w-full px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 text-slate-800 placeholder:text-slate-400 transition-all"
                            />
                          <button
                            onClick={() => setMaterialItems(prev => prev.filter(m => m.id !== mat.id))}
                            className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {materialItems.some(m => m.qty && m.price) && (
                        <div className="grid grid-cols-[1fr_60px_96px_32px] gap-1.5 px-0.5 pt-1 border-t border-slate-100">
                          <span className="text-xs text-slate-400 col-span-2">Line totals</span>
                          <div className="text-right">
                            {materialItems.map((mat) => {
                              const amt = (parseFloat(mat.qty) || 0) * (parseFloat(mat.price) || 0);
                              return amt > 0 ? (
                                <div key={mat.id} className="text-xs font-medium text-slate-700">{"\u20B9"}{amt.toLocaleString()}</div>
                              ) : null;
                            })}
                          </div>
                          <span></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Customer Details + Totals + Checkout */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4">

          {/* Customer / Store + Payment */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3 shrink-0">
            {saleType === "wholesale" ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 ml-1">Select Store *</label>
                <div className="relative">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <Store size={16} className="text-slate-600" />
                    {selectedStore ? (
                      <div className="flex-1 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-slate-800">{selectedStore.store_name}</span>
                          <span className="text-xs text-slate-500 ml-2">({selectedStore.contact_person})</span>
                        </div>
                        <button
                          onClick={() => setSelectedStoreId("")}
                          className="p-1 hover:bg-slate-200 rounded-lg"
                        >
                          <X size={14} className="text-slate-600" />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={selectedStoreId}
                        onChange={(e) => setSelectedStoreId(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                      >
                        <option value="">Choose a store...</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.store_name} {"\u2014"} {s.contact_person}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                {selectedStore && selectedStore.credit_limit > 0 && (
                  <p className="text-xs text-slate-500 px-1">
                    Credit limit: {"\u20B9"}{selectedStore.credit_limit.toLocaleString()} / sale
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 ml-1">Customer (optional)</label>
                  <input
                    type="text"
                    placeholder="Walking Customer"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 ml-1">Phone (optional)</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 ml-1">Payment Mode</label>
              <div className="relative">
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className={`w-full appearance-none px-3 py-2.5 text-sm font-medium border rounded-xl outline-none cursor-pointer transition-all pr-10 ${
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
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Totals + Checkout */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 shrink-0">
            {cart.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-medium text-slate-700">{"\u20B9"}{subtotalAmount.toLocaleString()}</span>
                </div>

                {saleType === "retail" && (
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                    <span>Discount</span>
                    <div className="flex items-center gap-1 border-b border-slate-300 focus-within:border-indigo-500 transition-colors">
                      <span className="text-slate-400">{"\u20B9"}</span>
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

                {saleType === "retail" && materialsTotal > 0 && (
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Materials</span>
                    <span className="font-medium text-slate-700">{"\u20B9"}{materialsTotal.toLocaleString()}</span>
                  </div>
                )}

                {saleType === "retail" && serviceTotal > 0 && (
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Service</span>
                    <span className="font-medium text-slate-700">{"\u20B9"}{serviceTotal.toLocaleString()}</span>
                  </div>
                )}

                {paymentMode === "credit" && (
                  <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 px-3 py-2 rounded-lg border border-amber-200">
                    <CreditCard size={14} />
                    <span>This will be recorded as credit (pending payment)</span>
                  </div>
                )}

                <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between items-end">
                  <span className="text-sm font-semibold text-slate-700">Total</span>
                  <span className="text-xl font-bold text-indigo-600 leading-none">{"\u20B9"}{grandTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            <button
              className={`
                w-full h-12 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all text-sm
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
                      : "Checkout"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      {quickAddProduct && (
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
              <p className="text-sm font-semibold text-indigo-600 mt-1">{"\u20B9"}{getProductPrice(quickAddProduct).toLocaleString()} / unit</p>
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
      )}

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
    </div>
  );
};