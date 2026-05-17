import { useRef } from "react";
import { bumpPageRender } from "@/lib/pagePerf";

/**
 * Hook يزيد عدّاد re-render لصفحة معيّنة في `localStorage` كل render.
 * يستخدم ref لتجنّب أي state، فلا يسبّب re-render بنفسه.
 *
 * Usage:
 *   const Page = () => { usePageRenderCount("/invoices"); ... };
 */
export function usePageRenderCount(path: string) {
  const last = useRef<string>("");
  if (last.current !== path) {
    last.current = path;
  }
  // كل render نزيد العدّاد. لا state، لا effect → لا حلقات.
  bumpPageRender(path);
}
