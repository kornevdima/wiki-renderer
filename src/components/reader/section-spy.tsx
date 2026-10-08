"use client";

import { useEffect } from "react";

import { clearPin, getPinnedSection, isAtBottom, noteScroll, pinSection, resolveCurrent, setCurrentSection } from "./section-spy-store";

/**
 * The scroll-spy for the "On this page" list (US-219, FR-053, SA-MOD Reader UI and print E3-D4, E3-2). A client island that
 * renders nothing; `PageShell` mounts it once, only when the list exists. The effect is keyed on the page and on the entry ids, so
 * in-wiki navigation starts it clean: it resolves each id with `document.getElementById`, DROPS any entry whose element is absent
 * (a page that changed under it), and recomputes the current section with `getBoundingClientRect` on mount (so a page opened on a
 * `#fragment` marks that section), on each `IntersectionObserver` callback, on scroll (one animation frame at a time) and on resize.
 * `IntersectionObserver` is the trigger and may be absent in a very old browser: the scroll listener still works, and with
 * neither the list is plain links with nothing marked. Cleanup disconnects everything and clears the mark.
 */
export function SectionSpy({ pageKey, ids }: { pageKey: string; ids: readonly string[] }) {
  const idKey = ids.join("\n");
  useEffect(() => {
    const wanted = idKey === "" ? [] : idKey.split("\n");
    const present = wanted.flatMap((id) => {
      const element = document.getElementById(id);
      return element === null ? [] : [{ id, element }];
    });
    if (present.length === 0) {
      setCurrentSection(null);
      return;
    }
    const compute = () => {
      const tops = present.map(({ element }) => element.getBoundingClientRect().top);
      const atBottom = isAtBottom({
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      });
      setCurrentSection(resolveCurrent(present.map((entry) => entry.id), tops, window.innerHeight / 3, atBottom, getPinnedSection()));
    };
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        compute();
      });
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(compute, { rootMargin: "0px 0px -66% 0px", threshold: [0, 1] });
    for (const { element } of present) observer?.observe(element);
    const onScroll = () => {
      noteScroll();
      schedule();
    };
    // A `#hash` (on load, and on `hashchange`) is an explicit selection of that section, if the list has it.
    const pinHash = () => {
      let id = window.location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // keep the raw fragment
      }
      if (present.some((entry) => entry.id === id)) pinSection(id);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", pinHash);
    pinHash();
    compute();
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", pinHash);
      clearPin();
      if (frame !== 0) cancelAnimationFrame(frame);
      setCurrentSection(null);
    };
  }, [pageKey, idKey]);
  return null;
}
