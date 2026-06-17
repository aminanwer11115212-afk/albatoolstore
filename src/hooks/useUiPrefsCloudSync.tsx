/**
 * Cloud sync layer for UI preferences — **DISABLED by owner request**.
 *
 * Decision (2026-06-17):
 *   التخصيص (ترتيب الأزرار، عرض الأعمدة، أحجام الـ dialogs، إلخ) يجب أن يبقى
 *   محلياً على كل جهاز/متصفح فقط. لا مزامنة سحابية بين أجهزة المستخدم نفسه.
 *   كل laptop / تليفون / متصفح يحفظ ضبطه الخاص في localStorage.
 *
 * هذا الـ hook يبقى موجوداً (ومُستدعى من App.tsx) لتفادي كسر الواجهة،
 * لكنه أصبح no-op كاملاً — لا pull ولا push.
 *
 * إذا أردنا لاحقاً إعادة المزامنة، يمكن استعادة المنطق من تاريخ Git.
 */
export function useUiPrefsCloudSync() {
  // intentionally empty — local-only persistence
}
