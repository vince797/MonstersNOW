(function (root) {
  "use strict";
  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
  }
  function renderReviewPage(page, book) {
    const article = element("article", "book-proof-page composed-proof-page");
    article.dataset.pageNumber = String(page.number);
    const stage = element("div", "composition-stage");
    stage.setAttribute("role", "img");
    stage.setAttribute("aria-label", `Page ${page.number}: ${book.monsterName}${page.layers.some((layer) => layer.type === "child") ? ` with ${book.childCharacter.label} review child` : ""}. Review composition.`);
    for (const layer of page.layers) {
      const source = root.MonstersNOWComposition.safeImageSource(layer.src);
      if (!source) continue;
      const frame = element("div", `composition-layer composition-${layer.type}${layer.type === "background" ? ` crop-${layer.crop}` : ""}`);
      const img = element("img");
      img.src = source;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.loading = page.number > 4 ? "lazy" : "eager";
      if (layer.type !== "background") {
        frame.style.left = `${layer.x}%`; frame.style.top = `${layer.y}%`; frame.style.width = `${layer.scale}%`;
        frame.dataset.assetId = layer.assetId || "";
        if (layer.anchor) {
          const anchorX = Math.max(0, Math.min(1, Number(layer.anchor.x)));
          const anchorY = Math.max(0, Math.min(1, Number(layer.anchor.y)));
          img.style.transform = `translate(${(0.5 - anchorX) * 100}%, ${(1 - anchorY) * 100}%)`;
        }
      }
      img.addEventListener("error", () => {
        img.hidden = true;
        frame.append(element("span", "composition-missing", `${layer.type} image unavailable`));
        article.classList.add("has-missing-art");
      }, { once: true });
      frame.append(img); stage.append(frame);
    }
    if (!page.layers.some((layer) => layer.type === "background")) stage.classList.add("composition-background-pending");
    stage.append(element("span", "composition-sample-mark", "REVIEW ART · NOT FOR PRINT"));
    const copy = element("div", "composition-copy");
    copy.append(element("h2", "", page.title), element("p", "", page.text));
    const foot = element("div", "composition-footer");
    foot.append(element("span", "proof-page-number", `${page.number} / 32`));
    if (page.reviewNotes.length) foot.append(element("span", "composition-page-notes", page.reviewNotes.join(" · ")));
    article.append(stage, copy, foot);
    return article;
  }
  function renderReviewBook(container, book) {
    container.replaceChildren(...book.pages.map((page) => renderReviewPage(page, book)));
  }
  root.MonstersNOWPageCompositor = { renderReviewBook, renderReviewPage };
})(globalThis);
