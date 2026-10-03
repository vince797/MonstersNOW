/* Shared, deterministic REVIEW composition. No print certification or AI calls. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./child-characters"), require("./halloween-review-layouts"), require("./monster-geometry"));
  else root.MonstersNOWComposition = factory(root.MonstersNOWCharacters, root.MonstersNOWHalloweenLayouts);
})(typeof globalThis !== "undefined" ? globalThis : this, function (characters, layouts, serverGeometry) {
  "use strict";
  const VERSION = "layered-review-v1";
  const own = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key);
  function monsterGeometry(assets, source, selectedPreviewId) {
    const record = own(assets, "monsterGeometry") ? assets.monsterGeometry : null;
    if (serverGeometry) return serverGeometry.trustedMonsterGeometry(record, { source, selectedPreviewId });
    // Browser metadata comes from the authenticated server response and affects
    // display only. Server exports never accept this serialized record as trust.
    if (!record || Object.getPrototypeOf(record) !== Object.prototype || !["version","available","alphaThreshold","selectedPreviewId","width","height","bounds","sourceSha256"].every(key => own(record, key)) || !own(assets, "selectedPreviewSha256")) return null;
    if (record.version !== "monster-alpha128-geometry-v1" || record.available !== true || record.alphaThreshold !== 128 || record.selectedPreviewId !== selectedPreviewId || !/^[a-f0-9]{64}$/.test(record.sourceSha256) || record.sourceSha256 !== assets.selectedPreviewSha256) return null;
    const b = record.bounds;
    if (!b || Object.getPrototypeOf(b) !== Object.prototype || !["left","top","right","bottom"].every(k => own(b,k) && Number.isInteger(b[k])) || !Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width <= 0 || record.height <= 0 || record.width * record.height > 16*1024*1024 || b.left < 0 || b.top < 0 || b.right <= b.left || b.bottom <= b.top || b.right > record.width || b.bottom > record.height) return null;
    return { ...record, anchor: { x: 0.5, y: b.bottom / record.height } };
  }
  function safeImageSource(value) {
    const source = typeof value === "string" ? value : "";
    if (/^\/assets\/[a-zA-Z0-9_./-]+$/.test(source) && !source.includes("..")) return source;
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source)) return source;
    try { const url = new URL(source); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; }
  }
  function placement(value = {}, defaults = {}) {
    const number = (key, min, max, fallback) => Number.isFinite(Number(value[key])) ? Math.max(min, Math.min(max, Number(value[key]))) : fallback;
    return {
      x: number("x", 5, 95, defaults.x || 68), y: number("y", 10, 97, defaults.y || 88),
      scale: number("scale", 15, 70, defaults.scale || 34),
      facing: ["left", "right", "neutral"].includes(value.facing) ? value.facing : "neutral",
      layer: value.layer === "behind" ? "behind" : "front",
    };
  }
  function personalize(value, childName, monsterName) {
    return String(value || "").replaceAll("{child_name}", childName).replaceAll("{monster_name}", monsterName).trim();
  }
  function composeReviewBook(story, selection = {}, assets = {}) {
    if (!Array.isArray(story?.pages) || story.pages.length !== 32) throw new Error("A 32-page saved story is required for review.");
    const childName = String(selection.childName || selection.child_name || "").trim().slice(0, 40);
    const monsterName = String(selection.monsterName || selection.monster_name || "").trim().slice(0, 40);
    const childCharacter = characters.resolveChildCharacter(selection.childCharacter || selection.child_character);
    const selectedPreviewId = selection.selectedPreviewId || selection.selected_preview_id || "";
    const resolvedPreviewId = assets.selectedPreviewId || assets.selected_preview_id || selectedPreviewId;
    if (resolvedPreviewId !== selectedPreviewId) throw new Error("The monster asset does not match the selected preview.");
    const monsterSource = safeImageSource(assets.selectedPreviewUrl || assets.selected_preview_url || assets.monsterImage);
    if (!monsterSource) throw new Error("The selected monster image is unavailable.");
    const geometry = monsterGeometry(assets, monsterSource, selectedPreviewId);
    const warnings = [
      "Review layout only. Not an approved customer PDF or a Lulu print file.",
      "Monster identity is preserved by reusing the exact selected image without mirroring or redrawing. Scene-specific poses and transparent cutouts still need art review.",
      "Background plates and all typography still require full-resolution prepress approval. Browser PDF export is for review only.",
    ];
    if (!geometry) warnings.push("Monster transparency baseline is unavailable. The canvas baseline is shown; review its ground contact before approval.");
    if (childCharacter.included) warnings.push(childCharacter.asset?.status === "candidate"
      ? `The selected child uses candidate art awaiting approval. Available poses: ${childCharacter.availablePoses.join(", ")}. Missing scene poses use a labeled fallback and remain blocked for print.`
      : "Child artwork is a labeled sample fixture. Final matching storybook character masters are still required.");
    const pages = story.pages.map((page, index) => {
      const background = safeImageSource(page.artworkUrl || page.backgroundUrl);
      const hasChild = page.childRequired === true && childCharacter.included;
      const childPose = page.childPose || ((story.slug || story.id) === "halloween-monster-night" ? (index === 30 ? "seated-home" : index >= 21 && index <= 23 ? "garden-quiet" : index >= 5 ? "garden" : "porch") : "porch");
      const childAsset = characters.resolveChildRenderAsset(childCharacter, childPose);
      const halloween = (story.slug || story.id) === "halloween-monster-night";
      const actualPose = childAsset?.pose || "standing";
      const childAnchor = halloween && index === 30 && actualPose === "seated-home" ? { x: 0.5, y: 0.7 } : childAsset?.anchor || { x: 0.5, y: 1 };
      const childPosition = placement(page.childPlacement, { x: 30 });
      // A standing-only candidate cannot use a seated sofa contact anchor.
      // Preserve explicit nondefault admin positions, but ground the default fallback on the rug.
      if (halloween && index === 30 && actualPose !== "seated-home" && childPosition.x === layouts.placementsForPage(31).child.x && childPosition.y === 63) Object.assign(childPosition, { x: 23, y: 95, scale: 34 });
      const layers = [];
      if (background) layers.push({ type: "background", src: background, crop: ["left", "right"].includes(page.backgroundCrop) ? page.backgroundCrop : "full" });
      if (halloween) layers.push(...layouts.propsForPage(index + 1));
      if (page.monsterRequired !== false) layers.push({ type: "monster", src: monsterSource, assetId: selectedPreviewId, ...placement(page.monsterPlacement), anchor: geometry?.anchor || { x: 0.5, y: 1 }, ...(geometry ? { alphaGeometry: geometry } : {}), mirror: false });
      if (hasChild) layers.push({ type: "child", src: safeImageSource(childAsset?.src), assetId: childAsset?.id || childCharacter.id, assetVersion: childAsset?.version, status: childAsset?.status || "missing", pose: actualPose, requestedPose: childPose, anchor: childAnchor, ...childPosition, mirror: false });
      return {
        number: index + 1,
        title: page.title || `Page ${index + 1}`,
        text: personalize(page.text, childName, monsterName),
        layers,
        renderLayout: halloween ? layouts.layoutForPage(index + 1) : null,
        reviewNotes: [hasChild && actualPose !== childPose ? `Scene pose pending: ${childPose}; ${actualPose} candidate shown` : "", !background ? "Background artwork pending" : "", layers.some((layer) => layer.layer === "behind") ? "Foreground occlusion mask pending" : ""].filter(Boolean),
      };
    });
    return {
      rendererVersion: VERSION, reviewOnly: true, productionReady: false,
      storyId: story.id || story.slug, masterVersion: story.version || null,
      title: personalize(story.title_template || story.title, childName, monsterName),
      childName, monsterName, childCharacter, selectedPreviewId,
      format: selection.format_id || selection.format || "softcover", pages, warnings,
    };
  }
  return { VERSION, composeReviewBook, safeImageSource };
});
