import { describe, it, expect, beforeEach } from "vitest";
import { findDropTargetFromStack } from "@/utils/toolbarDropTarget";

function el(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild as HTMLElement;
}

describe("findDropTargetFromStack", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null for an empty stack", () => {
    expect(findDropTargetFromStack([], null, "bar-a")).toBeNull();
  });

  it("returns null when no element has toolbar data attributes", () => {
    const div = el(`<div><span>plain</span></div>`);
    document.body.appendChild(div);
    expect(findDropTargetFromStack([div, div.firstElementChild as Element], null, "bar-a")).toBeNull();
  });

  it("returns a normal item target", () => {
    const wrapper = el(`<div data-toolbar-item-id="btn-1" data-toolbar-bar-key="bar-a"><span>x</span></div>`);
    document.body.appendChild(wrapper);
    const inner = wrapper.firstElementChild as Element;
    const result = findDropTargetFromStack([inner, wrapper], null, "bar-a");
    expect(result).toEqual({ barKey: "bar-a", beforeId: "btn-1" });
  });

  it("skips the dragged item within the same bar and picks the next valid target", () => {
    const dragged = el(`<div data-toolbar-item-id="btn-1" data-toolbar-bar-key="bar-a"></div>`);
    const next = el(`<div data-toolbar-item-id="btn-2" data-toolbar-bar-key="bar-a"></div>`);
    document.body.append(dragged, next);
    const result = findDropTargetFromStack([dragged, next], "btn-1", "bar-a");
    expect(result).toEqual({ barKey: "bar-a", beforeId: "btn-2" });
  });

  it("does NOT skip an item with the same id when it lives in another bar", () => {
    const sameIdOtherBar = el(`<div data-toolbar-item-id="btn-1" data-toolbar-bar-key="bar-b"></div>`);
    document.body.appendChild(sameIdOtherBar);
    const result = findDropTargetFromStack([sameIdOtherBar], "btn-1", "bar-a");
    expect(result).toEqual({ barKey: "bar-b", beforeId: "btn-1" });
  });

  it("prefers an end-zone over item targets in the same stack", () => {
    const item = el(`<div data-toolbar-item-id="btn-2" data-toolbar-bar-key="bar-a"></div>`);
    const endZone = el(`<div data-toolbar-end-zone data-toolbar-bar-key="bar-a"></div>`);
    document.body.append(item, endZone);
    // item appears first, end-zone later — should still win.
    const result = findDropTargetFromStack([item, endZone], "btn-1", "bar-a");
    expect(result).toEqual({ barKey: "bar-a", isEnd: true });
  });

  it("ignores items missing required data attributes", () => {
    const noBar = el(`<div data-toolbar-item-id="btn-1"></div>`);
    const valid = el(`<div data-toolbar-item-id="btn-2" data-toolbar-bar-key="bar-a"></div>`);
    document.body.append(noBar, valid);
    const result = findDropTargetFromStack([noBar, valid], null, "bar-a");
    expect(result).toEqual({ barKey: "bar-a", beforeId: "btn-2" });
  });

  it("walks up the DOM via closest() to find the toolbar item ancestor (edge near border)", () => {
    const wrapper = el(`
      <div data-toolbar-item-id="btn-3" data-toolbar-bar-key="bar-a">
        <button><svg><path></path></svg></button>
      </div>
    `);
    document.body.appendChild(wrapper);
    const path = wrapper.querySelector("path") as Element;
    // Simulate elementsFromPoint returning the deepest element first.
    const result = findDropTargetFromStack([path], null, "bar-a");
    expect(result).toEqual({ barKey: "bar-a", beforeId: "btn-3" });
  });
});
