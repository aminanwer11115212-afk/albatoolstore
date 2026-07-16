import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LocationChips from "@/components/location/LocationChips";

const items = [
  { id: "1", name: "الخرطوم" },
  { id: "2", name: "أم درمان" },
  { id: "3", name: "بحري" },
  { id: "4", name: "مدني" },
];

describe("LocationChips filter + a11y", () => {
  beforeEach(() => {
    // no-op
  });

  it("يفلتر العناصر حسب نص البحث ويعرض العدد", () => {
    const { rerender } = render(
      <LocationChips label="المدينة" items={items} value={null} onChange={() => {}} filter="" />,
    );
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(4);

    rerender(<LocationChips label="المدينة" items={items} value={null} onChange={() => {}} filter="بحر" />);
    const filtered = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toHaveTextContent("بحري");
    expect(screen.getByRole("status")).toHaveTextContent("(1/4)");
  });

  it("مسح البحث يُعيد كل العناصر", () => {
    const { rerender } = render(
      <LocationChips label="المدينة" items={items} value={null} onChange={() => {}} filter="مدني" />,
    );
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);
    rerender(<LocationChips label="المدينة" items={items} value={null} onChange={() => {}} filter="" />);
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(4);
  });

  it("aria-activedescendant يشير للعنصر النشط ويتغير مع الأسهم", () => {
    render(<LocationChips label="المدينة" items={items} value={null} onChange={() => {}} filter="" />);
    const listbox = screen.getByRole("listbox");
    const first = listbox.getAttribute("aria-activedescendant");
    expect(first).toBeTruthy();
    fireEvent.keyDown(listbox, { key: "ArrowRight" });
    const next = listbox.getAttribute("aria-activedescendant");
    expect(next).toBeTruthy();
    expect(next).not.toBe(first);
  });

  it("رسالة «لا نتائج» تظهر عند فلترة غير مطابقة", () => {
    render(<LocationChips label="المدينة" items={items} value={null} onChange={() => {}} filter="zzzzzz" />);
    expect(screen.getByText("لا نتائج مطابقة")).toBeInTheDocument();
  });
});
