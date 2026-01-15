import React, { useEffect, useMemo, useState } from "react";
import { reportService } from "../../db/reportService";
import { ReportIntent, ReportKind } from "../../types/notifications";
import { FSNClassification } from "../../types";
import { exportTableToCsv, exportTableToPdf, TableColumn } from "../../utils/reportExport";
import { Badge, Button, Card, Input, useToast } from "../ui";
import { ReportTable } from "./ReportTable";

type SortKey = "date" | "quantity" | "amount";

const todayIso = () => new Date().toISOString().slice(0, 10);

export const Reports: React.FC<{ intent?: ReportIntent | null }> = ({ intent }) => {
  const toast = useToast();

  const [active, setActive] = useState<ReportKind>(intent?.report ?? "daily-sales");

  // Filters
  const [from, setFrom] = useState(intent?.from ?? "");
  const [to, setTo] = useState(intent?.to ?? "");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [fsnFilter, setFsnFilter] = useState<FSNClassification | "">("");

  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    if (!intent) return;
    setActive(intent.report);
    setFrom(intent.from ?? "");
    setTo(intent.to ?? "");
    setRows([]);
  }, [intent]);

  const dateRangeText = useMemo(() => {
    if (!from && !to) return "";
    return `Date range: ${from || "(all)"} → ${to || "(all)"}`;
  }, [from, to]);

  const canUseDateRange = active === "daily-sales" || active === "product-sales" || active === "profit-summary";
  const canUseSearch = active === "product-sales" || active === "current-stock" || active === "low-stock";
  const canUseFsnFilter = active === "non-moving";

  const columns: TableColumn[] = useMemo(() => {
    switch (active) {
      case "daily-sales":
        return [
          { key: "date", label: "Date" },
          { key: "invoices", label: "Invoices" },
          { key: "items_sold", label: "Items Sold" },
          { key: "discount_total", label: "Discount" },
          { key: "net_sales", label: "Net Sales" },
        ];
      case "product-sales":
        return [
          { key: "product_name", label: "Product" },
          { key: "sku", label: "Part No / SKU" },
          { key: "quantity_sold", label: "Qty Sold" },
          { key: "sales_amount", label: "Sales Amount" },
        ];
      case "current-stock":
      case "low-stock":
        return [
          { key: "product_name", label: "Product" },
          { key: "sku", label: "Part No / SKU" },
          { key: "category", label: "Category" },
          { key: "quantity", label: "Qty" },
          { key: "price", label: "Unit Price" },
          { key: "stock_value", label: "Stock Value" },
          { key: "status", label: "Status" },
        ];
      case "non-moving":
        return [
          { key: "fsn_badge", label: "FSN" },
          { key: "product_name", label: "Product" },
          { key: "sku", label: "Part No / SKU" },
          { key: "category", label: "Category" },
          { key: "quantity", label: "Qty" },
          { key: "stock_value", label: "Stock Value" },
          { key: "days_since_sale", label: "Days Since Sale" },
        ];
      case "profit-summary":
        return [
          { key: "date", label: "Date" },
          { key: "net_sales", label: "Net Sales" },
          { key: "total_cost", label: "Total Cost" },
          { key: "approx_profit", label: "Profit" },
        ];
      default:
        return [];
    }
  }, [active]);

  const totals = useMemo(() => {
    if (rows.length === 0) return null;

    const sum = (key: string) =>
      rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

    switch (active) {
      case "daily-sales":
        return {
          date: "TOTAL",
          invoices: sum("invoices"),
          items_sold: sum("items_sold"),
          discount_total: `₹${sum("discount_total").toLocaleString()}`,
          net_sales: `₹${sum("net_sales").toLocaleString()}`,
        };
      case "product-sales":
        return {
          product_name: "TOTAL",
          quantity_sold: sum("quantity_sold"),
          sales_amount: `₹${sum("sales_amount").toLocaleString()}`,
        };
      case "current-stock":
      case "low-stock":
        return {
          product_name: "TOTAL",
          quantity: sum("quantity"),
          stock_value: `₹${sum("stock_value").toLocaleString()}`,
        };
      case "non-moving":
        return {
          product_name: "TOTAL",
          quantity: sum("quantity"),
          stock_value: `₹${sum("stock_value").toLocaleString()}`,
        };
      case "profit-summary":
        return {
          date: "TOTAL",
          net_sales: `₹${sum("net_sales").toLocaleString()}`,
          total_cost: `₹${sum("total_cost").toLocaleString()}`,
          approx_profit: `₹${sum("approx_profit").toLocaleString()}`,
        };
      default:
        return null;
    }
  }, [rows, active]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (active === "daily-sales" || active === "profit-summary") {
      if (sortKey === "amount") {
        const k = active === "profit-summary" ? "net_sales" : "net_sales";
        copy.sort((a, b) => (Number(b[k]) || 0) - (Number(a[k]) || 0));
      } else {
        copy.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      }
      return copy;
    }

    if (active === "product-sales") {
      if (sortKey === "quantity") copy.sort((a, b) => (Number(b.quantity_sold) || 0) - (Number(a.quantity_sold) || 0));
      else copy.sort((a, b) => (Number(b.sales_amount) || 0) - (Number(a.sales_amount) || 0));
      return copy;
    }

    if (active === "current-stock" || active === "low-stock") {
      if (sortKey === "quantity") copy.sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0));
      else copy.sort((a, b) => (Number(b.stock_value) || 0) - (Number(a.stock_value) || 0));
      return copy;
    }

    if (active === "non-moving") {
      // Already sorted by FSN order from service
      return copy;
    }

    return copy;
  }, [rows, active, sortKey]);

  const runReport = async () => {
    setIsLoading(true);
    try {
      const range = canUseDateRange ? { from: from || undefined, to: to || undefined } : {};

      if (active === "daily-sales") {
        const data = await reportService.getDailySales(range);
        setRows(
          data.map((r) => ({
            ...r,
            discount_total: Number(r.discount_total ?? 0),
            net_sales: Number(r.net_sales ?? 0),
          }))
        );
        return;
      }

      if (active === "product-sales") {
        const data = await reportService.getProductSales(range, search);
        setRows(data.map((r) => ({ ...r, sales_amount: Number(r.sales_amount ?? 0) })));
        return;
      }

      if (active === "current-stock") {
        const data = await reportService.getCurrentStock(search, false);
        setRows(data.map((r) => ({ ...r, stock_value: Number(r.stock_value ?? 0) })));
        return;
      }

      if (active === "low-stock") {
        const data = await reportService.getCurrentStock(search, true);
        setRows(data.map((r) => ({ ...r, stock_value: Number(r.stock_value ?? 0) })));
        return;
      }

      if (active === "non-moving") {
        const filter = fsnFilter as FSNClassification | undefined;
        const data = await reportService.getNonMovingItems(filter || undefined);
        setRows(data.map((r) => ({
          ...r,
          stock_value: Number(r.stock_value ?? 0),
          fsn_badge: r.fsn_classification,
        })));
        return;
      }

      if (active === "profit-summary") {
        const data = await reportService.getProfitSummary(range);
        setRows(data.map((r) => ({
          ...r,
          net_sales: Number(r.net_sales ?? 0),
          total_cost: Number(r.total_cost ?? 0),
          approx_profit: Number(r.approx_profit ?? 0),
        })));
        return;
      }

      setRows([]);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Report Failed", msg || "Could not generate report");
    } finally {
      setIsLoading(false);
    }
  };

  const formatForExport = (r: Record<string, any>) => {
    const out: Record<string, any> = { ...r };
    if (typeof out.net_sales === "number") out.net_sales = `₹${out.net_sales.toLocaleString()}`;
    if (typeof out.discount_total === "number") out.discount_total = `₹${out.discount_total.toLocaleString()}`;
    if (typeof out.sales_amount === "number") out.sales_amount = `₹${out.sales_amount.toLocaleString()}`;
    if (typeof out.stock_value === "number") out.stock_value = `₹${out.stock_value.toLocaleString()}`;
    if (typeof out.price === "number") out.price = `₹${out.price.toLocaleString()}`;
    if (typeof out.approx_profit === "number") out.approx_profit = `₹${out.approx_profit.toLocaleString()}`;
    if (typeof out.total_cost === "number") out.total_cost = `₹${out.total_cost.toLocaleString()}`;

    // Format FSN badge for export
    if (out.fsn_badge) {
      const fsnLabels: Record<string, string> = { 'F': 'Fast', 'S': 'Slow', 'N': 'Non-moving' };
      out.fsn_badge = fsnLabels[out.fsn_badge] || out.fsn_badge;
    }

    // Format days since sale
    if (out.days_since_sale === null) {
      out.days_since_sale = "Never";
    } else if (typeof out.days_since_sale === "number") {
      out.days_since_sale = `${out.days_since_sale} days`;
    }

    // Format stock status
    if (out.status) {
      const statusLabels: Record<string, string> = {
        'critical': '🔴 Critical',
        'low': '🟠 Low',
        'adequate': '🟢 Adequate'
      };
      out.status = statusLabels[out.status] || out.status;
    }

    return out;
  };

  const exportPdf = () => {
    const titleMap: Record<ReportKind, string> = {
      "daily-sales": "Daily Sales Report",
      "product-sales": "Product-wise Sales Report",
      "current-stock": "Current Stock Report",
      "low-stock": "Low Stock Report",
      "non-moving": "Non-Moving Items Report",
      "profit-summary": "Profit Summary Report",
    };

    exportTableToPdf({
      title: titleMap[active],
      dateRangeText: canUseDateRange ? dateRangeText : undefined,
      columns,
      rows: sortedRows.map(formatForExport),
      totals: totals
        ? Object.fromEntries(
          Object.entries(totals).filter(([k, v]) => k !== "product_name" && k !== "date" && v != null)
        )
        : undefined,
      filename: `motormods_${active}_${todayIso()}.pdf`,
    });
  };

  const exportCsv = () => {
    exportTableToCsv({
      columns,
      rows: sortedRows.map(formatForExport),
      filename: `motormods_${active}_${todayIso()}.csv`,
    });
  };

  const tabs: { id: ReportKind; label: string }[] = [
    { id: "daily-sales", label: "Daily Sales" },
    { id: "product-sales", label: "Product Sales" },
    { id: "current-stock", label: "Current Stock" },
    { id: "low-stock", label: "Low Stock" },
    { id: "non-moving", label: "Non-Moving Items" },
    { id: "profit-summary", label: "Profit Summary" },
  ];

  // Render FSN badge
  const renderFsnBadge = (fsn: string) => {
    const variant = fsn === 'F' ? 'success' : fsn === 'S' ? 'warning' : 'danger';
    const label = fsn === 'F' ? 'Fast' : fsn === 'S' ? 'Slow' : 'Non-moving';
    return <Badge variant={variant} size="sm">{label}</Badge>;
  };

  // Render status badge
  const renderStatusBadge = (status: string) => {
    if (!status) return null;
    const variant = status === 'critical' ? 'danger' : status === 'low' ? 'warning' : 'success';
    const label = status === 'critical' ? 'Critical' : status === 'low' ? 'Low' : 'Adequate';
    return <Badge variant={variant} size="sm">{label}</Badge>;
  };

  // Format rows for display (with badges)
  const displayRows = useMemo(() => {
    return sortedRows.map((r) => {
      const formatted = formatForExport({ ...r });

      // Replace fsn_badge with rendered badge
      if (r.fsn_badge) {
        formatted.fsn_badge = renderFsnBadge(r.fsn_badge);
      }

      // Replace status with rendered badge
      if (r.status) {
        formatted.status = renderStatusBadge(r.status);
      }

      return formatted;
    });
  }, [sortedRows]);

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActive(t.id);
                  setRows([]);
                  setFsnFilter("");
                }}
                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${active === t.id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={rows.length === 0}>
              Download PDF
            </Button>
          </div>
        </div>

        <div className="p-4 bg-white border-b border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">From</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={!canUseDateRange}
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">To</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={!canUseDateRange}
              />
            </div>

            {canUseFsnFilter ? (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Filter by FSN Classification
                </label>
                <select
                  value={fsnFilter}
                  onChange={(e) => setFsnFilter(e.target.value as FSNClassification | "")}
                  className="h-11 w-full px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="">All Items</option>
                  <option value="F">Fast-moving (F)</option>
                  <option value="S">Slow-moving (S)</option>
                  <option value="N">Non-moving (N)</option>
                </select>
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Search (product / part number)
                </label>
                <Input
                  placeholder={canUseSearch ? "Search product name or SKU..." : "Not applicable for this report"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={!canUseSearch}
                />
              </div>
            )}

            <div className="md:col-span-1 flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sort</label>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-11 w-full px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="date">Date</option>
                  <option value="quantity">Quantity</option>
                  <option value="amount">Amount</option>
                </select>
              </div>
              <Button onClick={runReport} isLoading={isLoading} className="h-11" style={{ marginLeft: 8 }}>
                Generate
              </Button>
            </div>
          </div>

          {active === "profit-summary" && (
            <p className="text-xs text-slate-400 mt-2">
              Profit is calculated using actual cost price from invoice items. Items without cost price are treated as zero cost.
            </p>
          )}

          {active === "non-moving" && (
            <p className="text-xs text-slate-400 mt-2">
              FSN Classification: <span className="text-emerald-600 font-medium">Fast</span> = sold in 30 days,
              <span className="text-amber-600 font-medium ml-2">Slow</span> = 31-threshold days,
              <span className="text-red-600 font-medium ml-2">Non-moving</span> = no sale beyond threshold.
              Configure threshold in Settings → Analytics.
            </p>
          )}

          {active === "low-stock" && (
            <p className="text-xs text-slate-400 mt-2">
              Low stock detection uses your configured method from Settings → Inventory.
            </p>
          )}
        </div>
      </Card>

      <ReportTable
        title=""
        columns={columns.map((c) => ({ key: c.key as any, label: c.label }))}
        rows={displayRows}
        totalsRow={totals as any}
      />
    </div>
  );
};
