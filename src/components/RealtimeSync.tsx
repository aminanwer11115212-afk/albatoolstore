/**
 * تم إيقاف Realtime auto-refresh لصفحات الإدارة (قرار المستخدم).
 * التحديث بعد أي تعديل يتم عبر invalidateQueries + window events
 * التي تُطلقها صفحات الإنشاء/التعديل نفسها ضمن نفس الجلسة.
 * لا اشتراكات postgres_changes، ولا polling.
 */
export default function RealtimeSync() {
  return null;
}

