// ============================================
// PRODUCT TYPES
// ============================================

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  quantity: number;
  barcode: string | null;
  purchase_price: number;
  reorder_level: number;
  max_stock: number | null;
  last_sale_date: string | null;
  fsn_classification: FSNClassification | null;
  updated_at: string;
}

export type FSNClassification = 'F' | 'S' | 'N';

// ============================================
// INVOICE TYPES
// ============================================

export interface Invoice {
  id: string;
  customer_name: string | null;
  customer_phone?: string | null;
  discount_amount: number;
  total_amount: number;
  payment_mode?: PaymentMode;
  is_return?: boolean;
  original_invoice_id?: string | null;
  return_reason?: string | null;
  created_at: string;
}

export type PaymentMode = 'cash' | 'card' | 'upi' | 'cheque' | 'credit';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  price: number;
  cost_price: number;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

// ============================================
// SALES RETURN TYPES
// ============================================

export interface SalesReturn {
  id: string;
  return_no: string;
  invoice_id: string;
  return_date: string;
  reason: ReturnReason;
  total_amount: number;
  notes: string | null;
  status: 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  // Joined fields
  customer_name?: string;
  original_invoice_total?: number;
}

export interface ReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  rate: number;
  line_total: number;
}

export interface SalesReturnWithItems extends SalesReturn {
  items: ReturnItem[];
}

export type ReturnReason =
  | 'damage'
  | 'wrong_part'
  | 'customer_request'
  | 'defective'
  | 'other';

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  damage: 'Damage',
  wrong_part: 'Wrong Part',
  customer_request: 'Customer Request',
  defective: 'Defective',
  other: 'Other',
};

// ============================================
// STOCK ADJUSTMENT TYPES
// ============================================

export interface StockAdjustment {
  id: string;
  product_id: string;
  product_name?: string;
  adjustment_type: AdjustmentType;
  quantity: number;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export type AdjustmentType =
  | 'opening_stock'
  | 'manual_add'
  | 'manual_deduction'
  | 'supplier_return'
  | 'damage_write_off'
  | 'sale'
  | 'return'
  | 'other';

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  opening_stock: 'Opening Stock',
  manual_add: 'Manual Add',
  manual_deduction: 'Manual Deduction',
  supplier_return: 'Supplier Return',
  damage_write_off: 'Damage Write-off',
  sale: 'Sale',
  return: 'Return',
  other: 'Other',
};

// ============================================
// BACKUP TYPES
// ============================================

export interface BackupLog {
  id: number;
  backup_file: string;
  backup_date: string;
  backup_type: 'auto' | 'manual';
  file_size: number | null;
  status: 'success' | 'failed';
  notes: string | null;
  created_at: string;
}

// ============================================
// SETTINGS TYPES
// ============================================

export type LowStockMethod = 'reorder_level' | 'percentage' | 'days_supply';

export interface AppSettings {
  low_stock_method: LowStockMethod;
  low_stock_percentage: number;
  low_stock_days_supply: number;
  non_moving_threshold_days: number;
  auto_backup_enabled: boolean;
  auto_backup_time: string;
  backup_retention_days: number;
}

// ============================================
// CART & SESSION TYPES
// ============================================

export interface CartItem extends Product {
  cartQuantity: number;
}

export type UserRole = "admin" | "staff";

export interface UserSession {
  role: UserRole;
  name: string;
}

// ============================================
// FORM TYPES
// ============================================

export interface ProductFormData {
  name: string;
  sku: string;
  category: string;
  price: string;
  quantity: string;
  barcode: string;
  purchase_price: string;
  reorder_level: string;
  max_stock: string;
}

export const emptyProductForm: ProductFormData = {
  name: "",
  sku: "",
  category: "",
  price: "",
  quantity: "",
  barcode: "",
  purchase_price: "",
  reorder_level: "5",
  max_stock: "",
};
