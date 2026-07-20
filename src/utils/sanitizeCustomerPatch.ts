/**
 * قائمة بيضاء للأعمدة المسموح تحديثها في جدول customers من الواجهة.
 * balance / credit_balance / net_balance تُحسب حصراً عبر
 * recompute_customer_balance في قاعدة البيانات.
 */
export const CUSTOMER_UPDATABLE_COLUMNS = new Set<string>([
  "name", "phone", "email", "address", "city", "state", "country",
  "group_id", "notes", "tax_number", "commercial_registration",
  "contact_person", "whatsapp", "website", "code", "opening_balance",
  "credit_limit", "payment_terms", "is_active", "tags",
  "billing_address", "shipping_address", "preferred_transporter_id",
  "customer_type", "discount_percentage",
  // الحقول الجغرافية للتحرير المباشر من جدول العملاء (الاتجاه/الولاية/المدينة/المحلية)
  "region_id", "state_id", "city_id", "locality_id",
]);

export function sanitizeCustomerPatch(patch: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (CUSTOMER_UPDATABLE_COLUMNS.has(k)) clean[k] = v;
  }
  return clean;
}
