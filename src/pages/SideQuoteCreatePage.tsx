import { Navigate, useLocation, useParams } from "react-router-dom";
import QuoteCreatePage from "./QuoteCreatePage";

/**
 * صفحة عرض سعر جانبي مستقلة بمسار خاص بها.
 * تعيد استخدام نفس منطق إنشاء عرض السعر، لكنها تُجبر وضع side=1
 * **قبل** أول render حتى لا يومض شريط "آخر العروض" بالعروض العادية.
 */
export default function SideQuoteCreatePage() {
  const location = useLocation();
  const { id } = useParams();

  // تأكيد ?side=1 قبل أول render — وإلا سيقرأ QuoteCreatePage searchParams
  // بدون side=1 ويمرّر sideOnly=false للوحة "آخر العروض" فتظهر العروض العادية
  // لجزء من الثانية قبل أن يُصحَّح الـ effect.
  const params = new URLSearchParams(location.search);
  if (params.get("side") !== "1") {
    params.set("side", "1");
    return (
      <Navigate
        to={{ pathname: location.pathname, search: `?${params.toString()}` }}
        replace
      />
    );
  }


  return (
    <div className="side-quote-shell">
      <style>{`
        /* خلفية الصفحة بتدرّج بنفسجي خفيف */
        .side-quote-shell {
          background: linear-gradient(180deg, #f5f3ff 0%, #faf5ff 60%, #ffffff 100%);
          min-height: 100%;
          padding: 0;
        }

        /* شريط العنوان العلوي المميّز */
        .side-quote-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 16px;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 60%, #5b21b6 100%);
          color: #fff;
          border-bottom: 3px solid #4c1d95;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }
        .side-quote-banner .title {
          display: flex; align-items: center; gap: 10px;
          font-size: 15px; font-weight: 800; letter-spacing: 0.2px;
        }
        .side-quote-banner .badge {
          background: rgba(255,255,255,0.18);
          padding: 3px 10px; border-radius: 999px;
          font-size: 11px; font-weight: 700;
          border: 1px solid rgba(255,255,255,0.35);
        }
        .side-quote-banner .mode {
          font-size: 11px; opacity: 0.9;
        }

        /* تخصيصات داخل QuoteCreatePage */
        .side-quote-shell .neo-quote-scope {
          background: transparent !important;
        }
        /* بطاقات داخلية بحدود بنفسجية خفيفة */
        .side-quote-shell .neo-quote-scope .legacy-card,
        .side-quote-shell .neo-quote-scope .card,
        .side-quote-shell .neo-quote-scope [class*="rounded"] > .bg-card {
          border-color: #ddd6fe !important;
        }
        /* أي زر primary أزرق يصبح بنفسجي للاتساق */
        .side-quote-shell .neo-quote-scope .btn-primary {
          background: #7c3aed !important;
          border-color: #6d28d9 !important;
          color: #fff !important;
        }
        .side-quote-shell .neo-quote-scope .btn-primary:hover {
          background: #6d28d9 !important;
        }
        /* خط فاصل أيمن للوحة الجانبية بلون بنفسجي */
        .side-quote-shell .recent-quotes-scope {
          border-right: 2px solid #ede9fe;
        }
      `}</style>

      <QuoteCreatePage key={id || "side-new"} />
    </div>
  );
}
