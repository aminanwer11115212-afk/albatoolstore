/**
 * Discount calculation utility supporting 4 formats from legacy system:
 *  - "percent"      : خصم نسبة مئوية على البند الواحد (السعر × الكمية × النسبة)
 *  - "flat"         : خصم مبلغ ثابت على البند الواحد (السعر × الكمية - مبلغ)
 *  - "bulk_percent" : خصم نسبة على إجمالي الكمية (مرة واحدة) — same as percent but documented separately
 *  - "bulk_flat"    : خصم مبلغ ثابت على إجمالي السطر (مرة واحدة)
 */
export type DiscountFormat = "percent" | "flat" | "bulk_percent" | "bulk_flat";

export interface DiscountInput {
  unitPrice: number;
  quantity: number;
  discountValue: number;
  format: DiscountFormat;
}

export interface DiscountResult {
  /** قيمة الخصم بالفلوس */
  discountAmount: number;
  /** السعر الإجمالي قبل الخصم */
  baseTotal: number;
  /** السعر الإجمالي بعد الخصم */
  netTotal: number;
}

export function calcDiscount({ unitPrice, quantity, discountValue, format }: DiscountInput): DiscountResult {
  const baseTotal = Number(unitPrice) * Number(quantity);
  const dv = Number(discountValue) || 0;
  let discountAmount = 0;

  switch (format) {
    case "percent":
      // نسبة على البند الواحد ثم ضرب الكمية = نفس النسبة على الإجمالي
      discountAmount = (baseTotal * dv) / 100;
      break;
    case "flat":
      // مبلغ ثابت لكل وحدة
      discountAmount = dv * Number(quantity);
      break;
    case "bulk_percent":
      // نسبة على إجمالي السطر (مماثلة لـ percent لكنها واضحة في النية)
      discountAmount = (baseTotal * dv) / 100;
      break;
    case "bulk_flat":
      // مبلغ ثابت على السطر بأكمله (مرة واحدة)
      discountAmount = dv;
      break;
  }

  if (discountAmount > baseTotal) discountAmount = baseTotal;
  if (discountAmount < 0) discountAmount = 0;

  return {
    discountAmount,
    baseTotal,
    netTotal: baseTotal - discountAmount,
  };
}

export const DISCOUNT_FORMAT_LABELS: Record<DiscountFormat, string> = {
  percent: "نسبة % (لكل وحدة)",
  flat: "مبلغ ثابت (لكل وحدة)",
  bulk_percent: "نسبة % (على السطر كاملاً)",
  bulk_flat: "مبلغ ثابت (على السطر كاملاً)",
};

/**
 * Compute item total after discount and tax.
 */
export function calcItemTotal(opts: {
  unitPrice: number;
  quantity: number;
  discountValue?: number;
  discountFormat?: DiscountFormat;
  taxRate?: number;
  taxStatus?: "default" | "inclusive" | "exclusive";
}): { subtotal: number; discount: number; tax: number; total: number } {
  const { discountAmount, netTotal } = calcDiscount({
    unitPrice: opts.unitPrice,
    quantity: opts.quantity,
    discountValue: opts.discountValue || 0,
    format: opts.discountFormat || "percent",
  });
  const taxRate = Number(opts.taxRate) || 0;
  const status = opts.taxStatus || "default";

  let tax = 0;
  let total = netTotal;

  if (status === "inclusive") {
    // الضريبة مضمنة في السعر — نستخرجها
    tax = netTotal - netTotal / (1 + taxRate / 100);
    total = netTotal;
  } else {
    // default / exclusive — نضيف الضريبة فوق
    tax = (netTotal * taxRate) / 100;
    total = netTotal + tax;
  }

  return {
    subtotal: opts.unitPrice * opts.quantity,
    discount: discountAmount,
    tax,
    total,
  };
}
