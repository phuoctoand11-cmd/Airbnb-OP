import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";

import type { Booking, Expense, Listing, Payment, Revenue } from "./supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExportListingRow {
  listing: Listing;
  revenue: number;
  expenses: number;
  profit: number;
  bookingCount: number;
  avgRevPerBooking: number;
  expenseRatio: number;
}

export interface ExportData {
  startDate: Date;
  endDate: Date;
  listings: Listing[];
  bookings: Booking[];
  revenues: Revenue[];    // P&L revenues (cashflow-only already excluded)
  expenses: Expense[];    // filtered by listing + category
  payments: Payment[];    // cashflow payments (filtered by listing)
  listingPnL: ExportListingRow[];
  summary: {
    revenue: number;
    expense: number;
    profit: number;
    completedBookings: number;
    cashIn: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

function listingName(listings: Listing[], id: string | null): string {
  if (!id) return "—";
  return listings.find((l) => l.id === id)?.title ?? id.slice(0, 8);
}

function guestName(bookings: Booking[], bookingId: string | null): string {
  if (!bookingId) return "—";
  return bookings.find((b) => b.id === bookingId)?.guest_name ?? "—";
}

function paymentTypeLabel(pt: string): string {
  const map: Record<string, string> = {
    deposit: "Đặt cọc",
    balance: "Thanh toán đủ",
    refund: "Hoàn tiền",
    cancellation_fee: "Phí hủy phòng",
  };
  return map[pt] ?? pt;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    paid: "Đã thanh toán",
    refunded: "Đã hoàn tiền",
    completed: "Hoàn thành",
    confirmed: "Đã xác nhận",
    cancelled: "Đã hủy",
    pending: "Chờ xử lý",
  };
  return map[s] ?? s;
}

function buildFileName(prefix: string, ext: string, start: Date, end: Date): string {
  return `${prefix}_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.${ext}`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Excel export ───────────────────────────────────────────────────────────────

export function exportExcel(data: ExportData): void {
  const wb = XLSX.utils.book_new();
  const generated = format(new Date(), "dd/MM/yyyy HH:mm");
  const dateRange = `${format(data.startDate, "dd/MM/yyyy")} → ${format(data.endDate, "dd/MM/yyyy")}`;

  // ── Sheet 1: Tóm tắt ────────────────────────────────────────────────────────
  const ws1 = XLSX.utils.aoa_to_sheet([
    ["BÁO CÁO TÀI CHÍNH"],
    ["Khoảng thời gian", dateRange],
    ["Tạo lúc", generated],
    [],
    ["CHỈ SỐ", "GIÁ TRỊ (₫)"],
    ["Tổng doanh thu", data.summary.revenue],
    ["Tổng chi phí", data.summary.expense],
    ["Lợi nhuận ròng", data.summary.profit],
    ["Tiền thực thu", data.summary.cashIn],
    ["Số booking hoàn thành", data.summary.completedBookings],
  ]);
  ws1["!cols"] = [{ wch: 26 }, { wch: 32 }];
  ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, ws1, "Tóm tắt");

  // ── Sheet 2: Theo căn hộ ────────────────────────────────────────────────────
  const pnlHeader = [
    "Căn hộ",
    "Doanh thu (₫)",
    "Chi phí (₫)",
    "Lợi nhuận (₫)",
    "Số booking",
    "DT trung bình/booking (₫)",
    "Tỷ lệ chi phí (%)",
  ];
  const pnlRows = data.listingPnL.map((row) => [
    row.listing.title,
    row.revenue,
    row.expenses,
    row.profit,
    row.bookingCount,
    Math.round(row.avgRevPerBooking),
    parseFloat(row.expenseRatio.toFixed(1)),
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([pnlHeader, ...pnlRows]);
  ws2["!cols"] = [
    { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 24 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Theo căn hộ");

  // ── Sheet 3: Doanh thu ──────────────────────────────────────────────────────
  const revHeader = ["Ngày", "Căn hộ", "Danh mục", "Khách", "Số tiền (₫)", "Ghi chú"];
  const revRows = [...data.revenues]
    .sort((a, b) => b.received_at.localeCompare(a.received_at))
    .map((r) => [
      fmtDate(r.received_at),
      listingName(data.listings, r.listing_id),
      r.category.replace(/_/g, " "),
      guestName(data.bookings, r.booking_id),
      Number(r.amount),
      r.description ?? "",
    ]);
  const ws3 = XLSX.utils.aoa_to_sheet([revHeader, ...revRows]);
  ws3["!cols"] = [
    { wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, "Doanh thu");

  // ── Sheet 4: Chi phí ────────────────────────────────────────────────────────
  const expHeader = ["Ngày", "Căn hộ", "Danh mục", "Nhà cung cấp", "Số tiền (₫)", "Ghi chú"];
  const expRows = [...data.expenses]
    .sort((a, b) => b.spent_at.localeCompare(a.spent_at))
    .map((e) => [
      fmtDate(e.spent_at),
      listingName(data.listings, e.listing_id),
      e.category.replace(/_/g, " "),
      e.vendor ?? "—",
      Number(e.amount),
      e.description ?? "",
    ]);
  const ws4 = XLSX.utils.aoa_to_sheet([expHeader, ...expRows]);
  ws4["!cols"] = [
    { wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, "Chi phí");

  // ── Sheet 5: Dòng tiền ──────────────────────────────────────────────────────
  const cashHeader = [
    "Ngày",
    "Căn hộ",
    "Khách",
    "Loại thanh toán",
    "Số tiền (₫)",
    "Trạng thái",
    "Ghi chú",
  ];
  const cashRows = [...data.payments]
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .map((p) => [
      fmtDate(p.paid_at),
      listingName(data.listings, p.listing_id),
      guestName(data.bookings, p.booking_id),
      paymentTypeLabel(p.payment_type),
      Number(p.amount),
      statusLabel(p.status),
      p.note ?? "",
    ]);
  const ws5 = XLSX.utils.aoa_to_sheet([cashHeader, ...cashRows]);
  ws5["!cols"] = [
    { wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(wb, ws5, "Dòng tiền");

  // ── Write & download ──────────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    buildFileName("reports", "xlsx", data.startDate, data.endDate)
  );
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

function toCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return "\uFEFF" + lines.join("\r\n"); // BOM for Excel UTF-8 compatibility
}

function downloadCSV(content: string, name: string) {
  triggerDownload(new Blob([content], { type: "text/csv;charset=utf-8;" }), name);
}

// ── CSV: Main listing financial report ────────────────────────────────────────

export function exportCSVMain(data: ExportData): void {
  const headers = [
    "Căn hộ",
    "Doanh thu (₫)",
    "Chi phí (₫)",
    "Lợi nhuận (₫)",
    "Số booking",
    "DT trung bình/booking (₫)",
    "Tỷ lệ chi phí (%)",
  ];
  const rows = data.listingPnL.map((row) => [
    row.listing.title,
    row.revenue,
    row.expenses,
    row.profit,
    row.bookingCount,
    Math.round(row.avgRevPerBooking),
    parseFloat(row.expenseRatio.toFixed(1)),
  ]);
  downloadCSV(toCSV(headers, rows), buildFileName("reports", "csv", data.startDate, data.endDate));
}

// ── CSV: Revenue detail ────────────────────────────────────────────────────────

export function exportCSVRevenue(data: ExportData): void {
  const headers = ["Ngày", "Căn hộ", "Danh mục", "Khách", "Số tiền (₫)", "Ghi chú"];
  const rows = [...data.revenues]
    .sort((a, b) => b.received_at.localeCompare(a.received_at))
    .map((r) => [
      fmtDate(r.received_at),
      listingName(data.listings, r.listing_id),
      r.category.replace(/_/g, " "),
      guestName(data.bookings, r.booking_id),
      Number(r.amount),
      r.description ?? "",
    ]);
  downloadCSV(toCSV(headers, rows), buildFileName("revenues", "csv", data.startDate, data.endDate));
}

// ── CSV: Expense detail ────────────────────────────────────────────────────────

export function exportCSVExpense(data: ExportData): void {
  const headers = ["Ngày", "Căn hộ", "Danh mục", "Nhà cung cấp", "Số tiền (₫)", "Ghi chú"];
  const rows = [...data.expenses]
    .sort((a, b) => b.spent_at.localeCompare(a.spent_at))
    .map((e) => [
      fmtDate(e.spent_at),
      listingName(data.listings, e.listing_id),
      e.category.replace(/_/g, " "),
      e.vendor ?? "—",
      Number(e.amount),
      e.description ?? "",
    ]);
  downloadCSV(toCSV(headers, rows), buildFileName("expenses", "csv", data.startDate, data.endDate));
}

// ── CSV: Cashflow detail ───────────────────────────────────────────────────────

export function exportCSVCashflow(data: ExportData): void {
  const headers = [
    "Ngày",
    "Căn hộ",
    "Khách",
    "Loại thanh toán",
    "Số tiền (₫)",
    "Trạng thái",
    "Ghi chú",
  ];
  const rows = [...data.payments]
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .map((p) => [
      fmtDate(p.paid_at),
      listingName(data.listings, p.listing_id),
      guestName(data.bookings, p.booking_id),
      paymentTypeLabel(p.payment_type),
      Number(p.amount),
      statusLabel(p.status),
      p.note ?? "",
    ]);
  downloadCSV(toCSV(headers, rows), buildFileName("cashflow", "csv", data.startDate, data.endDate));
}
