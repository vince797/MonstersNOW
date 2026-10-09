// Layout assertions run inside the page (Playwright). Each returns a list of
// human-readable problems; an empty list means the layout is clean.
//
// - horizontalOverflow: the document scrolls sideways, or any visible element
//   (after clipping by its scroll/overflow ancestors) extends past the viewport,
//   or an overflow-hidden box has been scrolled sideways (content shifted/cut).
// - stickyOverlap: the phone mini preview bar must span the full width, sit
//   flush under the site header, be opaque, cover (not show) controls behind
//   it, leave every control below it tappable, and never hide the focused one.
// - blockedControls: every visible control below the header/bar is hit-testable
//   at its center (nothing overlaps it).
// - clippedContent: no text or control in the editor is partly cut off by an
//   overflow-hidden/clip/scroll box (vertically by any such box; sideways by a
//   hidden/clip box; swipe rows are meant to scroll sideways).
// - collapsedControls: no displayed control in the editor has collapsed to
//   (near) zero size, which renders as an empty area (e.g. swipe-row cards
//   squeezed to 0px wide).

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const problems = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`document scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;
    const clipCache = new Map();
    const clipFor = (el) => {
      // Horizontal visible range after every clipping ancestor.
      if (!el || el === document.documentElement) return [-Infinity, Infinity];
      if (clipCache.has(el)) return clipCache.get(el);
      let range = clipFor(el.parentElement);
      const style = getComputedStyle(el);
      if (style.position === "fixed") range = [-Infinity, Infinity];
      if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX) && el !== document.body) {
        const rect = el.getBoundingClientRect();
        range = [Math.max(range[0], rect.left), Math.min(range[1], rect.right)];
      }
      clipCache.set(el, range);
      return range;
    };
    for (const el of document.body.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest("[hidden]")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.bottom < 0 || rect.top > innerHeight * 3) continue;
      const [lo, hi] = clipFor(el.parentElement);
      const left = Math.max(rect.left, lo);
      const right = Math.min(rect.right, hi);
      if (right <= left) continue; // fully clipped away (e.g. scrolled out of a swipe row)
      if (left < -1 || right > vw + 1) problems.push(`${describe(el)} overflows the viewport (${Math.round(left)}–${Math.round(right)} of ${vw})`);
      if (["hidden", "clip"].includes(style.overflowX) && el.scrollLeft > 0) problems.push(`${describe(el)} is scrolled sideways by ${el.scrollLeft}px inside overflow:${style.overflowX}`);
    }
    return [...new Set(problems)].slice(0, 25);
  });
}

async function stickyOverlap(page, { focus = true } = {}) {
  return page.evaluate((checkFocus) => {
    const problems = [];
    const bar = document.querySelector("#child-mini-preview");
    if (!bar || bar.hidden || getComputedStyle(bar).display === "none") return problems;
    const vw = document.documentElement.clientWidth;
    const r = bar.getBoundingClientRect();
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    if (r.left > 0.5 || r.right < vw - 0.5) problems.push(`mini preview is not full width (${Math.round(r.left)}–${Math.round(r.right)} of ${vw})`);
    if (header && Math.abs(r.top - Math.max(0, header.bottom)) > 1.5) problems.push(`mini preview is not flush under the header (top ${Math.round(r.top)}, header bottom ${Math.round(header.bottom)})`);
    const bg = getComputedStyle(bar).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
    if (bg.length === 4 && bg[3] < 0.98) problems.push("mini preview background is see-through");
    const controls = [...document.querySelectorAll("#child-editor-start :is(button, a[href], [role=tab], select, textarea, input:not([type=radio]):not([type=hidden]), label:has(> input[type=radio]))")]
      .filter((el) => !el.closest("[hidden], #child-mini-preview") && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length);
    for (const el of controls) {
      const c = el.getBoundingClientRect();
      if (c.width < 2 || c.height < 2) continue;
      const cx = Math.min(Math.max(c.left + c.width / 2, 1), vw - 1);
      const cy = c.top + c.height / 2;
      if (cy < r.top || cy > innerHeight - 1) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (cy <= r.bottom) {
        if (hit && el.contains(hit)) problems.push(`control shows through the mini preview: ${el.textContent.trim().slice(0, 30) || el.id}`);
      }
    }
    const focused = checkFocus ? document.activeElement : null;
    if (focused && focused.matches("button, a[href], input, select, textarea, [role=tab]") && focused.closest("#child-editor-start")) {
      const target = focused.matches("input[type=radio]") ? focused.closest("label") : focused;
      const f = target.getBoundingClientRect();
      if (f.height && f.top < r.bottom - 1 && f.bottom > r.top) problems.push(`focused control is under the mini preview: ${target.textContent.trim().slice(0, 30) || target.id}`);
    }
    return problems;
  }, focus);
}

async function blockedControls(page) {
  return page.evaluate(() => {
    const problems = [];
    const vw = document.documentElement.clientWidth;
    const bar = document.querySelector("#child-mini-preview");
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    let top = header ? Math.max(0, header.bottom) : 0;
    if (bar && !bar.hidden && getComputedStyle(bar).display !== "none") top = Math.max(top, bar.getBoundingClientRect().bottom);
    const clipped = (el) => {
      let [l, rgt, t, b] = [-Infinity, Infinity, -Infinity, Infinity];
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(p).overflowX)) {
          const pr = p.getBoundingClientRect();
          [l, rgt, t, b] = [Math.max(l, pr.left), Math.min(rgt, pr.right), Math.max(t, pr.top), Math.min(b, pr.bottom)];
        }
      }
      const r = el.getBoundingClientRect();
      return { left: Math.max(r.left, l, 0), right: Math.min(r.right, rgt, vw), top: Math.max(r.top, t), bottom: Math.min(r.bottom, b) };
    };
    const controls = [...document.querySelectorAll("#child-editor-start :is(button, a[href], [role=tab], select, textarea, input:not([type=radio]):not([type=hidden]), label:has(> input[type=radio])), #child-mini-jump")]
      .filter((el) => !el.closest("[hidden]") && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length);
    for (const el of controls) {
      const c = clipped(el);
      if (c.right - c.left < 12 || c.bottom - c.top < 12) continue; // mostly scrolled out of its row
      const cx = (c.left + c.right) / 2;
      const cy = (c.top + c.bottom) / 2;
      if (cy < top + 2 || cy > innerHeight - 2) continue;
      if (el.closest("#child-mini-preview") && cy < top + 2) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(el.contains(hit) || hit.contains(el))) {
        problems.push(`control is covered: "${(el.textContent.trim() || el.id || el.getAttribute("aria-label") || "").slice(0, 30)}" by ${hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ""}.${String(hit.className).split(" ")[0]}` : "nothing"}`);
      }
    }
    return problems.slice(0, 20);
  });
}

async function clippedContent(page) {
  return page.evaluate(() => {
    const problems = [];
    const root = document.querySelector("#child-editor-start");
    if (!root) return problems;
    const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ""}`;
    const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const items = [...root.querySelectorAll("*"), ...document.querySelectorAll("#child-mini-preview *")]
      .filter((el) => (ownText(el) || el.matches("button, a[href], input:not([type=radio]):not([type=hidden]), select, textarea")) && !el.closest("[hidden], [aria-hidden=true]") && el.getClientRects().length);
    for (const el of items) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      // Sideways-scrolling rows legitimately hide part of a chip; measure what
      // is left after them.
      const r = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const clipY = ["hidden", "clip", "auto", "scroll"].includes(ps.overflowY);
        const clipX = ["hidden", "clip"].includes(ps.overflowX);
        const pr = p.getBoundingClientRect();
        if (["auto", "scroll"].includes(ps.overflowX)) { r.left = Math.max(r.left, pr.left); r.right = Math.min(r.right, pr.right); }
        if (!clipY && !clipX) continue;
        const visibleX = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
        const visibleY = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
        if (visibleX <= 0 || visibleY <= 0) break; // scrolled fully out of view (e.g. a swipe row)
        if (clipY && (r.top < pr.top - 2 || r.bottom > pr.bottom + 2)) {
          problems.push(`${describe(el)} "${(el.textContent.trim() || el.id).slice(0, 30)}" is cut off vertically by ${describe(p)} (${Math.round(r.top)}–${Math.round(r.bottom)} vs ${Math.round(pr.top)}–${Math.round(pr.bottom)})`);
          break;
        }
        if (clipX && (r.left < pr.left - 2 || r.right > pr.right + 2)) {
          problems.push(`${describe(el)} "${(el.textContent.trim() || el.id).slice(0, 30)}" is cut off sideways by ${describe(p)} (${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(pr.left)}–${Math.round(pr.right)})`);
          break;
        }
      }
    }
    return [...new Set(problems)].slice(0, 20);
  });
}

async function collapsedControls(page) {
  return page.evaluate(() => {
    const problems = [];
    const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ""}`;
    const controls = [...document.querySelectorAll("#child-editor-start :is(button, a[href], [role=tab], select, textarea, input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=file]), label:has(> input[type=radio]))")]
      .filter((el) => !el.closest("[hidden]") && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.parentElement.getClientRects().length && el.parentElement.getBoundingClientRect().width > 0);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) problems.push(`${describe(el)} "${(el.textContent.trim() || el.id || el.getAttribute("aria-label") || "").slice(0, 30)}" has collapsed to ${Math.round(r.width)}×${Math.round(r.height)}px`);
    }
    return problems.slice(0, 20);
  });
}

// `focus: false` when the page was scrolled after the last tap (a user scroll
// may legitimately move the focused chip under the bar).
async function assertCleanLayout(page, label, { focus = true } = {}) {
  const problems = [
    ...(await horizontalOverflow(page)),
    ...(await stickyOverlap(page, { focus })),
    ...(await blockedControls(page)),
    ...(await clippedContent(page)),
    ...(await collapsedControls(page)),
  ];
  if (problems.length) throw new Error(`Layout problems at "${label}":\n  - ${problems.join("\n  - ")}`);
}

module.exports = { assertCleanLayout, blockedControls, clippedContent, collapsedControls, horizontalOverflow, stickyOverlap };
