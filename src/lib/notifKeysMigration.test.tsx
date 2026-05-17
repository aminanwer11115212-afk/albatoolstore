/**
 * يتحقق من ترحيل المفتاحين القديمين (notif_read_ids / notif_snoozed_stock)
 * إلى مفاتيح user-scoped بشكل صحيح لكل مستخدم مختلف، بدون أخطاء وبدون تسريب
 * بيانات بين المستخدمين.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";

type AuthCb = (e: string, s: any) => void;
const mockState = vi.hoisted(() => ({
  listeners: new Set<AuthCb>(),
  session: null as { user: { id: string } } | null,
}));

function setSession(uid: string | null) {
  mockState.session = uid ? { user: { id: uid } } : null;
  mockState.listeners.forEach((cb) => cb("SIGNED_IN", mockState.session));
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockState.session } }),
      onAuthStateChange: (cb: AuthCb) => {
        mockState.listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => mockState.listeners.delete(cb) } } };
      },
    },
  },
}));

import { useUserScopedLegacyKey } from "./userScopedKey";

const READ = "notif_read_ids";
const SNOOZE = "notif_snoozed_stock";
const scoped = (uid: string, k: string) => `lov:u:${uid}:legacy:${k}`;

describe("ترحيل مفاتيح الإشعارات إلى user-scoped", () => {
  beforeEach(() => {
    localStorage.clear();
    setSession(null);
  });
  afterEach(() => cleanup());

  it("يُرحّل القيم القديمة الخام إلى مفتاح المستخدم الأول دون أخطاء", () => {
    localStorage.setItem(READ, JSON.stringify(["a", "b"]));
    localStorage.setItem(SNOOZE, JSON.stringify({ "stock:x": 9999999999999 }));

    setSession("user-a");
    const { result: r1 } = renderHook(() => useUserScopedLegacyKey(READ));
    const { result: r2 } = renderHook(() => useUserScopedLegacyKey(SNOOZE));

    expect(r1.current).toBe(scoped("user-a", READ));
    expect(r2.current).toBe(scoped("user-a", SNOOZE));
    expect(JSON.parse(localStorage.getItem(r1.current)!)).toEqual(["a", "b"]);
    expect(JSON.parse(localStorage.getItem(r2.current)!)).toEqual({ "stock:x": 9999999999999 });
  });

  it("لا يُسرّب قيم مستخدم إلى مستخدم آخر عند التبديل", () => {
    setSession("user-a");
    const { result, rerender } = renderHook(() => useUserScopedLegacyKey(READ));
    const aKey = result.current;
    localStorage.setItem(aKey, JSON.stringify(["only-a"]));

    act(() => setSession("user-b"));
    rerender();

    const bKey = result.current;
    expect(bKey).toBe(scoped("user-b", READ));
    expect(bKey).not.toBe(aKey);
    // لا يوجد أي قيمة سابقة للمستخدم B
    expect(localStorage.getItem(bKey)).toBeNull();
    // قيمة A لم تتأثر
    expect(JSON.parse(localStorage.getItem(aKey)!)).toEqual(["only-a"]);
  });

  it("يُرحّل من نطاق guest إلى uid الحقيقي عند تأخر تأكيد الجلسة", () => {
    // قبل أي جلسة: استخدام الـ hook يكتب تحت guest
    const { result, rerender } = renderHook(() => useUserScopedLegacyKey(SNOOZE));
    expect(result.current).toBe(scoped("guest", SNOOZE));
    localStorage.setItem(result.current, JSON.stringify({ "stock:y": 1 }));

    // عند تأكيد الجلسة، يُعاد حساب المفتاح ويُرحَّل من guest
    act(() => setSession("user-c"));
    rerender();

    expect(result.current).toBe(scoped("user-c", SNOOZE));
    expect(JSON.parse(localStorage.getItem(result.current)!)).toEqual({ "stock:y": 1 });
  });

  it("لا يُعيد الكتابة فوق قيمة موجودة لمستخدم سبق ترحيله", () => {
    localStorage.setItem(READ, JSON.stringify(["legacy"]));
    setSession("user-a");
    const { result } = renderHook(() => useUserScopedLegacyKey(READ));

    // اكتب قيمة جديدة للمستخدم A
    localStorage.setItem(result.current, JSON.stringify(["fresh"]));

    // ارسم hook آخر بنفس المستخدم — يجب ألا يُعيد الترحيل من القيمة القديمة
    renderHook(() => useUserScopedLegacyKey(READ));
    expect(JSON.parse(localStorage.getItem(result.current)!)).toEqual(["fresh"]);
  });

  it("يفصل القيم بين ثلاثة مستخدمين مختلفين بدون أخطاء", () => {
    const users = ["u1", "u2", "u3"];
    users.forEach((u, i) => {
      act(() => setSession(u));
      const { result } = renderHook(() => useUserScopedLegacyKey(READ));
      localStorage.setItem(result.current, JSON.stringify([`val-${i}`]));
    });

    users.forEach((u, i) => {
      expect(JSON.parse(localStorage.getItem(scoped(u, READ))!)).toEqual([`val-${i}`]);
    });
  });
});
