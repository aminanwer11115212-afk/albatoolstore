import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import ToolbarSettingsMenu from "@/components/toolbar/ToolbarSettingsMenu";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";

// Mock sonner toast — we only care about whether it was called.
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const SCREEN_KEY = "test-screen";
const LOCK_KEY = `neobilling:toolbar-lock:v1:${SCREEN_KEY}`;
const LONG_PRESS_MS = 500;

function renderMenu() {
  return render(
    <ToolbarCustomizationProvider>
      <ToolbarSettingsMenu screenKey={SCREEN_KEY} />
    </ToolbarCustomizationProvider>,
  );
}

function getTrigger(): HTMLButtonElement {
  const btns = screen.getAllByRole("button");
  const t = btns.find((b) => /إعدادات|مقفلة|التخصيص/.test(b.getAttribute("aria-label") ?? ""));
  if (!t) throw new Error("trigger not found");
  return t as HTMLButtonElement;
}

/** يحاكي ضغطة-إفلات للماوس مع تقدّم زمن داخلها.
 *  jsdom لا يطلق click تلقائياً بعد pointerUp، لذا نطلقه يدوياً. */
function holdPointer(el: Element, ms: number) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  fireEvent.pointerUp(el, { button: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.click(el, { button: 0 });
}

function pressEnter(el: Element) {
  fireEvent.keyDown(el, { key: "Enter" });
  fireEvent.keyUp(el, { key: "Enter" });
}

function holdSpace(el: Element, ms: number) {
  fireEvent.keyDown(el, { key: " " });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  fireEvent.keyUp(el, { key: " " });
}

function holdEnter(el: Element, ms: number) {
  fireEvent.keyDown(el, { key: "Enter" });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  fireEvent.keyUp(el, { key: "Enter" });
}

describe("ToolbarSettingsMenu — long-press model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    toastSuccess.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("١. نقرة عادية بالماوس: تفتح القائمة فوراً ولا تقفل", () => {
    renderMenu();
    holdPointer(getTrigger(), 50); // أقل بكثير من 500ms
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    expect(screen.getByText("تخصيص ترتيب الأزرار")).toBeInTheDocument();
  });

  it("٢. نقرة عادية على إعدادات مقفلة: تفتح القائمة وتُظهر بند فك القفل", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ values: {}, lockedAt: 1 }));
    renderMenu();
    holdPointer(getTrigger(), 50);
    expect(screen.getByText("فك قفل الإعدادات")).toBeInTheDocument();
    // القفل لا يزال قائماً
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
  });

  it("٣. ضغط مطوّل ≥500ms: يقفل ويُظهر toast", () => {
    renderMenu();
    const trigger = getTrigger();
    fireEvent.pointerDown(trigger, { button: 0, pointerId: 1, pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    fireEvent.pointerUp(trigger, { button: 0, pointerId: 1, pointerType: "mouse" });

    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/قفل/));
    // والقائمة لم تُفتح
    expect(screen.queryByText("تخصيص ترتيب الأزرار")).toBeNull();
  });

  it("٤. ضغط مطوّل ثم ضغط مطوّل ثانٍ: يقفل ثم يفك القفل", () => {
    renderMenu();
    const trigger = getTrigger();

    // قفل
    fireEvent.pointerDown(trigger, { pointerId: 1, pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });
    fireEvent.pointerUp(trigger, { pointerId: 1, pointerType: "mouse" });
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();

    // فك قفل
    fireEvent.pointerDown(trigger, { pointerId: 1, pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });
    fireEvent.pointerUp(trigger, { pointerId: 1, pointerType: "mouse" });
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });

  it("٥. إفلات قبل اكتمال الـ 500ms: لا قفل، تُفتح القائمة كنقرة عادية", () => {
    renderMenu();
    holdPointer(getTrigger(), 300);
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("تخصيص ترتيب الأزرار")).toBeInTheDocument();
  });

  it("٦. pointerLeave قبل 500ms: لا قفل ولا فتح للقائمة", () => {
    renderMenu();
    const trigger = getTrigger();
    fireEvent.pointerDown(trigger, { pointerId: 1, pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerLeave(trigger, { pointerId: 1, pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS); });

    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText("تخصيص ترتيب الأزرار")).toBeNull();
  });

  it("٧. ضغط مطوّل في وضع التخصيص: ينهي التخصيص ويقفل في خطوة واحدة", () => {
    localStorage.setItem("neobilling:toolbar-customizing:global:v1", "1");
    renderMenu();

    const trigger = getTrigger();
    fireEvent.pointerDown(trigger, { pointerId: 1, pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });
    fireEvent.pointerUp(trigger, { pointerId: 1, pointerType: "mouse" });
    // setTimeout(0) الداخلي
    act(() => { vi.advanceTimersByTime(10); });

    expect(localStorage.getItem("neobilling:toolbar-customizing:global:v1")).toBe("0");
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("٨. لوحة المفاتيح Enter قصير (إفلات قبل 500ms): يفتح القائمة دون قفل", () => {
    renderMenu();
    pressEnter(getTrigger());
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("تخصيص ترتيب الأزرار")).toBeInTheDocument();
  });

  it("٨ب. لوحة المفاتيح Enter مطوّل (≥500ms): يقفل ويُظهر toast", () => {
    renderMenu();
    holdEnter(getTrigger(), LONG_PRESS_MS + 10);
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.queryByText("تخصيص ترتيب الأزرار")).toBeNull();
  });

  it("٨ج. Enter مع autoRepeat لا يُعيد تشغيل المؤقت ولا يُلغي القفل", () => {
    renderMenu();
    const trigger = getTrigger();
    fireEvent.keyDown(trigger, { key: "Enter" });
    // محاكاة autoRepeat: keydown يتكرر دون keyup
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.keyDown(trigger, { key: "Enter", repeat: true });
    fireEvent.keyDown(trigger, { key: "Enter", repeat: true });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS); });
    fireEvent.keyUp(trigger, { key: "Enter" });
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
  });

  it("٩. لوحة المفاتيح Space مطوّلة ≥500ms: تقفل", () => {
    renderMenu();
    holdSpace(getTrigger(), LONG_PRESS_MS + 10);
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("١٠. لوحة المفاتيح Space قصيرة (<500ms): تفتح القائمة دون قفل", () => {
    renderMenu();
    holdSpace(getTrigger(), 200);
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    expect(screen.getByText("تخصيص ترتيب الأزرار")).toBeInTheDocument();
  });

  it("١٠ب. Space مع autoRepeat لا يُعيد تشغيل المؤقت", () => {
    renderMenu();
    const trigger = getTrigger();
    fireEvent.keyDown(trigger, { key: " " });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.keyDown(trigger, { key: " ", repeat: true });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS); });
    fireEvent.keyUp(trigger, { key: " " });
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
  });

  it("١١. بند القائمة 'قفل الإعدادات' يعمل كبديل دائم", () => {
    renderMenu();
    holdPointer(getTrigger(), 30);
    const lockItem = screen.getByText("قفل الإعدادات");
    fireEvent.click(lockItem);
    expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/قفل/));
  });

  it("١٢. ARIA: aria-haspopup, aria-pressed يعكس isLocked, aria-label موجود", () => {
    renderMenu();
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("١٣. ARIA: aria-pressed=true عندما تكون الإعدادات مقفلة", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ values: {}, lockedAt: 1 }));
    renderMenu();
    expect(getTrigger().getAttribute("aria-pressed")).toBe("true");
  });

  it("١٤. ARIA ديناميكياً: aria-expanded يصبح true بعد فتح القائمة بـ Enter قصير", () => {
    renderMenu();
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    pressEnter(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("١٥. ARIA ديناميكياً: aria-pressed يتحول true بعد ضغط مطوّل بالماوس", () => {
    renderMenu();
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    fireEvent.pointerDown(trigger, { pointerId: 1, pointerType: "mouse" });
    // أثناء الضغط — قبل اكتمال المهلة — لا يزال غير مقفل
    act(() => { vi.advanceTimersByTime(300); });
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    // اكتمال الضغط
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS); });
    fireEvent.pointerUp(trigger, { pointerId: 1, pointerType: "mouse" });
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    // والقائمة لم تُفتح
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("١٦. ARIA ديناميكياً: aria-pressed يتحول true بعد Space مطوّل، ثم false بعد ضغط مطوّل آخر", () => {
    renderMenu();
    const trigger = getTrigger();
    holdSpace(trigger, LONG_PRESS_MS + 10);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    holdSpace(trigger, LONG_PRESS_MS + 10);
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
  });
});
