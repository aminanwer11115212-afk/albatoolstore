/**
 * اختبار تكاملٍ للعرض: كل شاشةٍ رئيسية **تُرسَم** بلا سقوط.
 *
 * طلبه صاحب المستودع: «اختبارات تكامل للعرض في كل الشاشات».
 *
 * ## ما يمسكه هذا الملف ولا يمسكه غيره
 * `tsc` يمسك الأنواع، و`allScreensLoad` يمسك سقوط **التحميل**. ويبقى أخطرُ
 * الثلاثة بلا حارس: **السقوط عند الرسم**. مثاله في هذا المشروع نداءٌ يتيم
 * لدالّة `setNotes` محذوفة — صحيحٌ نوعياً، ويُحمَّل الملف بلا شكوى، ثم ينفجر
 * في وجه المستخدم عند فتح النافذة.
 *
 * وهذا النوع لا يظهر إلا بتركيب الشاشة فعلاً: قراءةُ حقلٍ من كائنٍ فارغ،
 * و`.map` على `undefined` قبل وصول البيانات، وسياقٌ ناقص.
 *
 * ## البيئة: قاعدةٌ فارغة لا قاعدةَ مزيّفة
 * تُحاكى Supabase بردٍّ فارغٍ لكل جدول. والفراغ مقصود: **أوّل رسمةٍ للشاشة
 * تحدث دائماً قبل وصول البيانات**، فهي الحالة التي يراها كل مستخدم في كل
 * فتحة — وأكثر ما ينكسر فيها هو الافتراض بأن القائمة موجودة.
 *
 * ## لماذا هذه الشاشات
 * كل شاشةٍ يفتحها المستخدم في يومه: الإدخال، والإدارة، والكشوف، والتقارير،
 * والمخزون. والقائمة مذكورة صراحةً — إضافةُ شاشةٍ جديدة تُضاف إليها.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDeleteProvider } from "@/components/common/ConfirmDeleteProvider";

/* ─────────── قاعدةٌ فارغة، وحلقةٌ تقبل أي ترتيب للنداءات ─────────── */

/**
 * الباني المُحاكى يقبل أيّ سلسلة (`select().eq().order().range()`…) ويعود
 * دائماً بفراغ. فلا شاشةَ تسقط لأنها استعملت مُرشِّحاً لم نتوقّعه.
 */
function emptyBuilder(): any {
  const result = Promise.resolve({ data: [], error: null, count: 0 });
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return result.then.bind(result);
        if (prop === "catch") return result.catch.bind(result);
        if (prop === "finally") return result.finally.bind(result);
        return () => chain;
      },
    },
  );
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => emptyBuilder(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: function () { return this; }, subscribe: () => ({}) }),
    removeChannel: () => {},
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1" } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {}, success: () => {}, info: () => {}, warning: () => {},
    dismiss: () => {}, loading: () => {}, message: () => {}, custom: () => {}, promise: () => {},
  }),
  Toaster: () => null,
}));

/* ─────────── الغلاف ─────────── */

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/"]}>
          {/* نفس مزوّدي `App.tsx` — شاشةٌ تسقط لغياب سياقٍ ليست عطلاً فيها */}
          <ConfirmDeleteProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </ConfirmDeleteProvider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/**
 * الشاشات المفحوصة — كلٌّ باسمه العربي كما يقرؤه صاحب المستودع في القائمة.
 * الإدخالُ منها يُفحص بشاشته المشتركة: فاتورة الكاش والعرض الجانبي غلافان.
 */
const SCREENS: Array<[string, () => Promise<any>]> = [
  ["الفواتير — إنشاء", () => import("@/screens/InvoiceCreateScreen")],
  ["الفواتير — إدارة", () => import("@/pages/InvoicesPage")],
  ["فاتورة كاش", () => import("@/pages/CashInvoiceCreatePage")],
  ["عروض الأسعار — إنشاء", () => import("@/pages/QuoteCreatePage")],
  ["عروض الأسعار — إدارة", () => import("@/pages/QuotesPage")],
  ["العروض الجانبية", () => import("@/pages/SideQuotesPage")],
  ["المشتريات — إنشاء", () => import("@/pages/PurchaseCreatePage")],
  ["المرتجعات — إنشاء", () => import("@/pages/StockReturnCreatePage")],
  ["المرتجعات — إدارة", () => import("@/pages/StockReturnPage")],
  ["المنتجات", () => import("@/pages/ProductsPage")],
  ["كميات المنتجات", () => import("@/pages/ProductQuantitiesPage")],
  ["العملاء", () => import("@/pages/CustomersPage")],
  ["كشوفات الحسابات", () => import("@/pages/CustomerStatementsPage")],
  ["المعاملات", () => import("@/pages/TransactionsPage")],
  ["الحسابات", () => import("@/pages/AccountsPage")],
  ["كشوفات الموردين", () => import("@/pages/SupplierStatementsPage")],
  ["تتبّع المخزون", () => import("@/pages/StockTrackingPage")],
  ["تحويل مخزون", () => import("@/pages/StockTransferPage")],
  ["الترحيلات", () => import("@/pages/DispatchPage")],
  ["لوحة التحكّم", () => import("@/pages/Dashboard")],
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("كل شاشة تُرسَم على قاعدةٍ فارغة بلا سقوط", () => {
  it.each(SCREENS)("%s", async (_name, load) => {
    const mod: any = await load();
    const Screen = mod.default;
    expect(typeof Screen).toBe("function");
    // السقوط عند الرسم يرمي هنا فيسقط الاختبار برسالته الأصلية
    const { container } = render(
      <Wrapper>
        <Screen />
      </Wrapper>,
    );
    expect(container).toBeTruthy();
  });
});

describe("وكلٌّ منها يرسم محتوى فعلاً — لا شاشةً بيضاء", () => {
  it.each(SCREENS)("%s", async (_name, load) => {
    const mod: any = await load();
    const Screen = mod.default;
    const { container } = render(
      <Wrapper>
        <Screen />
      </Wrapper>,
    );
    // عنصرٌ واحد على الأقل: الشاشة البيضاء عطلٌ حتى لو لم تَرمِ
    expect(container.querySelectorAll("*").length).toBeGreaterThan(0);
  });
});

/**
 * الحارس يبقى نافعاً ما دام يغطّي الشاشات الجديدة.
 * فأيّ شاشةٍ تُضاف إلى السايدبار تُضاف إلى هذه القائمة.
 */
describe("القائمة تغطّي ما يفتحه المستخدم", () => {
  it("ثماني عشرة شاشةً على الأقل", () => {
    expect(SCREENS.length).toBeGreaterThanOrEqual(18);
  });

  it("وتشمل شاشات الإدخال الستّ التي تُدخَل فيها البنود", () => {
    const names = SCREENS.map(([n]) => n).join(" | ");
    for (const s of ["الفواتير — إنشاء", "فاتورة كاش", "عروض الأسعار — إنشاء", "المشتريات — إنشاء", "المرتجعات — إنشاء"]) {
      expect(names).toContain(s);
    }
  });
});
