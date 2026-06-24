import React from "react";

/** أنواع وأدوات مساعدة مستخرجة من InvoiceCreatePage — منطق نقي بدون closure. */

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balance: number | null;
  company: string | null;
}

export interface Product {
  id: string;
  name: string;
  sale_price: number | null;
  foreign_price: number | null;
  unit: string | null;
  stock_quantity: number | null;
  warehouse_id?: string | null;
}

export interface InvRow {
  uid: string;
  dbId?: string | null;
  product_id: string | null;
  product_name: string;
  productSearch: string;
  quantity: number;
  foreign_price: number;
  exchange_rate: number;
  unit_price: number;
  discount: number;
  total: number;
  unit: string | null;
  showSuggestions: boolean;
  selected: boolean;
  note: string;
}

export function newRow(rate: number = 1): InvRow {
  return {
    uid: crypto.randomUUID(),
    dbId: null,
    product_id: null,
    product_name: "",
    productSearch: "",
    quantity: 1,
    foreign_price: 0,
    exchange_rate: rate,
    unit_price: 0,
    discount: 0,
    total: 0,
    unit: null,
    showSuggestions: false,
    selected: false,
    note: "",
  };
}

export function calcTotal(r: InvRow): number {
  const sub = r.quantity * r.unit_price;
  const afterDisc = sub - sub * (r.discount / 100);
  return Math.round(afterDisc * 100) / 100;
}

export const btnStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
  background: bg, color: "#fff", border: "none",
  borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", height: 26, lineHeight: 1.1, whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
});

// بصمة مختصرة لبنود الفاتورة لاكتشاف ما إن تغيّرت قبل الحفظ
export function invoiceItemsHash(items: Array<{ product_id?: string | null; quantity?: any; unit_price?: any; foreign_price?: any; discount?: any; unit?: any; product_name?: any }>): string {
  return items
    .map((it) => [
      it.product_id || "",
      Number(it.quantity) || 0,
      Number(it.unit_price) || 0,
      Number(it.foreign_price) || 0,
      Number(it.discount) || 0,
      it.unit || "",
      it.product_name || "",
    ].join("|"))
    .join("§");
}
