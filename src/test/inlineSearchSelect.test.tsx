import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import InlineSearchSelect from "@/components/InlineSearchSelect";

/**
 * يضمن هذا الاختبار:
 * 1) القائمة المنسدلة تفتح وتعرض البحث.
 * 2) البحث (typing) يُصفّي الخيارات بـ startsWith.
 * 3) الاختيار بالماوس يستدعي onChange ويُغلق القائمة (لا إغلاق مفاجئ قبل التثبيت).
 * 4) الاختيار بالكيبورد (ArrowDown + Enter) يستدعي onChange.
 * 5) أحداث pointerdown/mousedown داخل قائمة الـ portal لا تتسرّب لـ document
 *    (الإصلاح الذي يمنع Radix Dialog من الإغلاق قبل تثبيت الاختيار).
 */

const opts = [
  { value: "1", label: "زويتش" },
  { value: "2", label: "بي ام دبليو" },
  { value: "3", label: "مرسيدس" },
];

describe("InlineSearchSelect", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it("يفتح القائمة عند الضغط على الزر", () => {
    render(<InlineSearchSelect value="" options={opts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByPlaceholderText("ابحث أو اكتب اسم جديد...")).toBeInTheDocument();
    expect(screen.getByText("زويتش")).toBeInTheDocument();
    expect(screen.getByText("بي ام دبليو")).toBeInTheDocument();
  });

  it("يُصفّي بـ startsWith بعد الكتابة في حقل البحث", () => {
    render(<InlineSearchSelect value="" options={opts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("ابحث أو اكتب اسم جديد...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "بي" } });
    expect(screen.getByText("بي ام دبليو")).toBeInTheDocument();
    expect(screen.queryByText("زويتش")).not.toBeInTheDocument();
    expect(screen.queryByText("مرسيدس")).not.toBeInTheDocument();
  });

  it("يستدعي onChange ويُغلق القائمة عند النقر بالماوس على خيار", () => {
    render(<InlineSearchSelect value="" options={opts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const itemBtn = screen.getByText("مرسيدس").closest("button")!;
    fireEvent.click(itemBtn);
    expect(onChange).toHaveBeenCalledWith("3");
    expect(screen.queryByPlaceholderText("ابحث أو اكتب اسم جديد...")).not.toBeInTheDocument();
  });

  it("يدعم الاختيار بالكيبورد (ArrowDown + Enter)", () => {
    render(<InlineSearchSelect value="" options={opts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("ابحث أو اكتب اسم جديد...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2"); // الخيار الثاني (highlight بدأ من 0 ثم +1)
  });

  it("القائمة تُرسم داخل شجرة DOM للـ wrapper (وليس portal خارجي) — يمنع إغلاق Radix Dialog قبل التثبيت", () => {
    const { container } = render(
      <InlineSearchSelect value="" options={opts} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const item = screen.getByText("زويتش").closest("button")!;
    // العنصر يجب أن يكون داخل container (شجرة المكوّن)، لا خارجها عبر portal لـ body.
    expect(container.contains(item)).toBe(true);
  });
});
