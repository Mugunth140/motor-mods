import {
    AlertTriangle,
    BarChart3,
    Edit2,
    Package,
    Plus,
    Save,
    Search,
    Trash2,
    TrendingUp,
    X
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { productService } from "../db/productService";
import { stockAdjustmentService } from "../db/stockAdjustmentService";
import { useDebounce, useProducts } from "../hooks";
import { ADJUSTMENT_TYPE_LABELS, AdjustmentType, Product, ProductFormData, emptyProductForm } from "../types";
import { Badge, Button, Card, ConfirmModal, EmptyState, Input, Modal, useToast } from "./ui";

interface StockManagementProps {
  canEdit?: boolean;
}

export const StockManagement: React.FC<StockManagementProps> = ({ canEdit = false }) => {
  const { products, loading, refetch } = useProducts();
  const toast = useToast();

  // Form states
  const [formData, setFormData] = useState<ProductFormData>(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual stock adjustment
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<string>("");
  const [adjustType, setAdjustType] = useState<AdjustmentType>("manual_add");
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  const ensureCanEdit = () => {
    if (!canEdit) {
      toast.warning("Read-only", "Inventory changes are admin only");
      return false;
    }
    return true;
  };

  // Stats calculations
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const inStock = products.filter(p => p.quantity > 0).length;
    const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= 5).length;
    const outOfStock = products.filter(p => p.quantity <= 0).length;
    const totalValue = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);

    return { totalProducts, inStock, lowStock, outOfStock, totalValue };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch = !normalizedSearch
        ? true
        : p.name.toLowerCase().includes(normalizedSearch) ||
        (p.sku && p.sku.toLowerCase().includes(normalizedSearch));

      const pCategory = (p.category || "Uncategorized").trim();
      const matchesCategory =
        categoryFilter === "all" ? true : pCategory === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearch, categoryFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, products.length]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(filteredProducts.length / PAGE_SIZE);
    return Math.max(1, pages);
  }, [filteredProducts.length]);

  const pagedProducts = useMemo(() => {
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, page, totalPages]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const c = (p.category || "Uncategorized").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const openAddModal = () => {
    if (!ensureCanEdit()) return;
    setFormData(emptyProductForm);
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    if (!ensureCanEdit()) return;
    setFormData({
      name: product.name,
      sku: product.sku || "",
      category: product.category || "",
      price: product.price.toString(),
      quantity: product.quantity.toString(),
      barcode: product.barcode || "",
      purchase_price: (product.purchase_price ?? 0).toString(),
      reorder_level: (product.reorder_level ?? 5).toString(),
      max_stock: product.max_stock?.toString() || "",
    });
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyProductForm);
    setEditingProduct(null);
  };

  const openAdjustModal = (product: Product) => {
    if (!ensureCanEdit()) return;
    setAdjustingProduct(product);
    setAdjustDelta("");
    setAdjustReason("");
    setIsAdjustModalOpen(true);
  };

  const closeAdjustModal = () => {
    setIsAdjustModalOpen(false);
    setAdjustingProduct(null);
    setAdjustDelta("");
    setAdjustReason("");
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensureCanEdit()) return;
    if (!adjustingProduct) return;

    const delta = parseInt(adjustDelta, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.warning("Validation Error", "Enter a non-zero adjustment (e.g., +5 or -2)");
      return;
    }

    const nextQty = (adjustingProduct.quantity ?? 0) + delta;
    if (nextQty < 0) {
      toast.warning("Validation Error", "Stock cannot go below 0");
      return;
    }

    setIsAdjusting(true);
    try {
      // Update product quantity
      await productService.updateQuantity(adjustingProduct.id, delta);

      // Log the adjustment for audit trail
      await stockAdjustmentService.create(
        adjustingProduct.id,
        adjustType,
        delta,
        adjustReason.trim() || null,
        'admin' // TODO: Get actual username from session
      );

      toast.success(
        "Stock Adjusted",
        `${adjustingProduct.name}: ${delta > 0 ? "+" : ""}${delta} units (${ADJUSTMENT_TYPE_LABELS[adjustType]})`
      );
      closeAdjustModal();
      refetch();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Operation Failed", message || "Could not adjust stock. Please try again.");
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensureCanEdit()) return;
    if (!formData.name.trim()) {
      toast.warning("Validation Error", "Product name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingProduct) {
        // Update existing product
        await productService.update({
          ...editingProduct,
          name: formData.name.trim(),
          sku: formData.sku.trim() || null,
          category: formData.category.trim() || null,
          price: parseFloat(formData.price) || 0,
          purchase_price: parseFloat(formData.purchase_price) || 0,
          quantity: parseInt(formData.quantity) || 0,
          reorder_level: parseInt(formData.reorder_level) || 5,
        });
        toast.success("Product Updated", `${formData.name} has been updated successfully`);
      } else {
        // Add new product
        await productService.add({
          id: uuidv4(),
          name: formData.name.trim(),
          sku: formData.sku.trim() || null,
          category: formData.category.trim() || null,
          price: parseFloat(formData.price) || 0,
          purchase_price: parseFloat(formData.purchase_price) || 0,
          quantity: parseInt(formData.quantity) || 0,
          reorder_level: parseInt(formData.reorder_level) || 5,
        });
        toast.success("Product Added", `${formData.name} has been added to inventory`);
      }

      closeModal();
      refetch();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Operation Failed", message || "Could not save the product. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!ensureCanEdit()) return;
    if (!deleteConfirm.product) return;

    setIsDeleting(true);
    try {
      await productService.delete(deleteConfirm.product.id);
      toast.success("Product Deleted", `${deleteConfirm.product.name} has been removed`);
      setDeleteConfirm({ open: false, product: null });
      refetch();
    } catch (error) {
      console.error(error);
      toast.error("Delete Failed", "Could not delete the product. It may be referenced in invoices.");
    } finally {
      setIsDeleting(false);
    }
  };

  const getStockBadge = (quantity: number) => {
    if (quantity <= 0) return <Badge variant="danger" dot>Out of Stock</Badge>;
    if (quantity <= 5) return <Badge variant="warning" dot>Low Stock ({quantity})</Badge>;
    if (quantity <= 10) return <Badge variant="info" dot>{quantity} Units</Badge>;
    return <Badge variant="success" dot>{quantity} Units</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      {!canEdit && (
        <Card className="bg-amber-50 border-amber-200 text-amber-800">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} />
            <div>
              <p className="font-semibold">Read-only mode</p>
              <p className="text-sm text-amber-700">Staff logins can view inventory but only admins can add, edit, or delete items.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Package size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Products</p>
            <h3 className="text-2xl font-bold text-slate-800">{stats.totalProducts}</h3>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">In Stock</p>
            <h3 className="text-2xl font-bold text-slate-800">{stats.inStock}</h3>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Low Stock</p>
            <h3 className="text-2xl font-bold text-slate-800">{stats.lowStock}</h3>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Inventory Value</p>
            <h3 className="text-2xl font-bold text-slate-800">₹{stats.totalValue.toLocaleString()}</h3>
          </div>
        </Card>
      </div>

      {/* Inventory Table */}
      <div className="flex flex-col flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">Inventory Management</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 h-10 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-64"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              title="Filter by category"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button
              onClick={openAddModal}
              leftIcon={<Plus size={18} />}
              disabled={!canEdit}
              title={canEdit ? undefined : "Admin only"}
              className="h-10"
            >
              Add Product
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title={searchTerm ? "No products found" : "No products yet"}
              description={searchTerm
                ? "Try adjusting your search terms"
                : "Add your first product to get started"}
              action={!searchTerm && (
                <Button onClick={openAddModal} leftIcon={<Plus size={18} />}>
                  Add Product
                </Button>
              )}
            />
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Price</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedProducts.map((p) => (
                  <tr
                    key={p.id}
                    className={`transition-colors group hover:bg-slate-50/80 ${p.quantity <= 0
                      ? "bg-red-50/30"
                      : p.quantity > 0 && p.quantity <= 5
                        ? "bg-amber-50/30"
                        : ""
                      }`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Package size={18} className="text-slate-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800">{p.name}</div>
                          <div className="text-xs text-slate-400 font-mono">ID: {p.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {(p.category || "Uncategorized").trim() || "Uncategorized"}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm text-slate-600">
                        {p.sku || "—"}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-700">₹{p.price.toLocaleString()}</td>
                    <td className="p-4">{getStockBadge(p.quantity)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAdjustModal(p)}
                          disabled={!canEdit}
                          title={canEdit ? undefined : "Admin only"}
                          leftIcon={<TrendingUp size={14} />}
                          className="hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          Adjust
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(p)}
                          disabled={!canEdit}
                          title={canEdit ? undefined : "Admin only"}
                          leftIcon={<Edit2 size={14} />}
                          className="hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => canEdit && setDeleteConfirm({ open: true, product: p })}
                          leftIcon={<Trash2 size={14} />}
                          className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          disabled={!canEdit}
                          title={canEdit ? undefined : "Admin only"}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredProducts.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
            <div className="text-sm text-slate-500">
              Page <span className="font-semibold text-slate-700">{Math.min(page, totalPages)}</span> of{" "}
              <span className="font-semibold text-slate-700">{totalPages}</span> ({filteredProducts.length} items)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProduct ? "Edit Product" : "Add New Product"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Product Name"
            placeholder="Enter product name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            autoFocus
          />

          <Input
            label="SKU Code"
            placeholder="e.g., OIL-M-7100"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
          />

          <Input
            label="Category"
            placeholder="e.g., Oils, Tyres, Accessories"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cost Price (₹)"
              type="number"
              placeholder="0.00"
              value={formData.purchase_price}
              onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
              step="0.01"
              min="0"
              required
            />

            <Input
              label="Selling Price (₹)"
              type="number"
              placeholder="0.00"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              step="0.01"
              min="0"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Quantity"
              type="number"
              placeholder="0"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              min="0"
              required
            />

            <Input
              label="Reorder Level"
              type="number"
              placeholder="5"
              value={formData.reorder_level}
              onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
              min="0"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
              <X size={18} className="mr-2" /> Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              <Save size={18} className="mr-2" /> {editingProduct ? "Update" : "Add"} Product
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manual Stock Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={closeAdjustModal}
        title="Adjust Stock"
        size="md"
      >
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="font-semibold text-slate-800">Product:</span>{" "}
            {adjustingProduct?.name}
            {typeof adjustingProduct?.quantity === "number" && (
              <span className="text-slate-500"> (Current: {adjustingProduct.quantity})</span>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Adjustment Type
            </label>
            <select
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as AdjustmentType)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="manual_add">Manual Add</option>
              <option value="manual_deduction">Manual Deduction</option>
              <option value="opening_stock">Opening Stock</option>
              <option value="supplier_return">Supplier Return</option>
              <option value="damage_write_off">Damage Write-off</option>
              <option value="other">Other</option>
            </select>
          </div>

          <Input
            label="Adjustment Quantity"
            type="number"
            placeholder="e.g., 5 or -2"
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)}
            required
          />

          <Input
            label="Notes (optional)"
            placeholder="e.g., damaged goods, recount, correction"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
          />

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={closeAdjustModal} className="flex-1">
              <X size={18} className="mr-2" /> Cancel
            </Button>
            <Button type="submit" isLoading={isAdjusting} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              <Save size={18} className="mr-2" /> Apply
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, product: null })}
        onConfirm={handleDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteConfirm.product?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
