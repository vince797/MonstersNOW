#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");
const { childProfileKey, isSupportedWheelchairProfile, resolveChildCharacter } = require("../lib/child-characters");

const root = path.resolve(__dirname, "..");
const referenceDir = path.join(root, "assets/storybook/halloween-monster-night/reference");
const appearanceId = argument("--appearance", "warm-curly-dark");
const ageBand = argument("--age-band", "5-6");
const relativeHeight = argument("--relative-height", "average");
const selectedProfile = resolveChildCharacter({ id: appearanceId, ageBand, relativeHeight, mobilityAid: "wheelchair" });
if (!isSupportedWheelchairProfile(selectedProfile)) throw new Error(`Unsupported wheelchair profile: ${appearanceId}:${ageBand}:${relativeHeight}`);
const appearanceConfigs = {
  "warm-curly-dark": {
    label: "Curly dark",
    poseDir: "wheelchair-profile-v1",
    existingPoses: { doorway: "doorway.png", square: "town-square.png", parade: "parade.png", garden: "garden.png" },
    sheets: [
      { source: "wheelchair-child-pose-sheet-v2.png", poses: ["candy-help", "trail-clue", "ribbon-help", "star-look"] },
      { source: "wheelchair-child-pose-sheet-v3.png", poses: ["welcome", "window-clue", "celebrate", "sleepy-home"] },
    ],
  },
  "deep-braids-black": {
    label: "Braids",
    poseDir: "wheelchair-profile-deep-braids-black-v1",
    existingPoses: {},
    sheets: [
      { source: "wheelchair-child-pose-sheet-braids-v1.png", poses: ["doorway", "square", "parade", "garden"] },
      { source: "wheelchair-child-pose-sheet-braids-v2.png", poses: ["candy-help", "trail-clue", "ribbon-help", "star-look"] },
      { source: "wheelchair-child-pose-sheet-braids-v3.png", poses: ["welcome", "window-clue", "celebrate", "sleepy-home"] },
    ],
  },
};
const appearance = appearanceConfigs[appearanceId];
const poseDir = path.join(referenceDir, appearance.poseDir);
const outputSlug = `${appearanceId}-${ageBand}-${relativeHeight}`;
const outputDir = path.join(root, "output/wheelchair-customization-v1", outputSlug);
const pageDir = path.join(outputDir, "pages");
const backgroundDir = path.join(outputDir, "backgrounds");
const fullSize = 2625;
const trim = { x: 38, y: 38, width: 2550, height: 2550 };
const safeInset = 150;
const safe = { x: trim.x + safeInset, y: trim.y + safeInset, right: trim.x + trim.width - safeInset, bottom: trim.y + trim.height - safeInset };
const artBottom = trim.y + 1780;
const sourceDrawingCrop = { x: 119, y: 328, width: 350, height: 350 };
const childRenderScale = ({ "5-6": 0.88, "7-8": 1 }[ageBand]) * ({ average: 0.94, taller: 1 }[relativeHeight]);

const newPoseSheets = appearance.sheets;
const existingPoses = appearance.existingPoses;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const poseByPage = {
  4: "doorway", 5: "square", 6: "square", 7: "star-look",
  8: "star-look", 9: "window-clue", 10: "window-clue", 11: "doorway",
  12: "candy-help", 13: "candy-help", 14: "trail-clue", 15: "star-look",
  16: "doorway", 17: "square", 18: "window-clue", 19: "square",
  20: "ribbon-help", 21: "ribbon-help", 22: "garden", 23: "star-look",
  24: "garden", 25: "garden", 26: "trail-clue", 27: "star-look",
  28: "celebrate", 29: "welcome", 30: "parade", 31: "sleepy-home",
};

const sceneRanges = [
  [4, 5, "doorway"], [6, 7, "square"], [8, 9, "wind"], [10, 11, "trail"],
  [12, 13, "porch"], [14, 15, "gate"], [16, 17, "moon-house"], [18, 19, "window"],
  [20, 21, "banner"], [22, 23, "quiet-garden"], [24, 25, "golden-garden"],
  [26, 27, "return"], [28, 29, "lantern"], [30, 30, "parade"], [31, 31, "home"],
];

const sceneTitles = {
  doorway: "A special Halloween", square: "The Monster Star", wind: "Whoosh!", trail: "The golden trail",
  porch: "Treats everywhere", gate: "One more searcher", "moon-house": "A brave hello", window: "A clue in the window",
  banner: "The tangled sign", "quiet-garden": "The quiet garden", "golden-garden": "One kind act",
  return: "Bringing back the light", lantern: "Monster of the Night", parade: "The Pumpkin Parade", home: "Home again",
};

function ensureDirs() {
  fs.mkdirSync(poseDir, { recursive: true });
  fs.mkdirSync(pageDir, { recursive: true });
  fs.mkdirSync(backgroundDir, { recursive: true });
}

function alphaBounds(ctx, width, height, threshold = 4) {
  const data = ctx.getImageData(0, 0, width, height).data;
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error("Pose quadrant is empty.");
  return { left, top, right, bottom };
}

async function splitSheet(sheet) {
  const source = await loadImage(path.join(referenceDir, sheet.source));
  const quadrants = [
    { x: 0, y: 0, width: 656, height: 590 },
    { x: 656, y: 0, width: 656, height: 590 },
    { x: 0, y: 590, width: 656, height: 609 },
    { x: 656, y: 590, width: 656, height: 609 },
  ];
  const results = {};
  for (let index = 0; index < quadrants.length; index += 1) {
    const q = quadrants[index];
    const quadrant = createCanvas(q.width, q.height);
    const qctx = quadrant.getContext("2d");
    qctx.drawImage(source, q.x, q.y, q.width, q.height, 0, 0, q.width, q.height);
    const bounds = alphaBounds(qctx, q.width, q.height);
    const padding = 24;
    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;
    const canvas = createCanvas(width + padding * 2, height + padding * 2);
    canvas.getContext("2d").drawImage(quadrant, bounds.left, bounds.top, width, height, padding, padding, width, height);
    const name = sheet.poses[index];
    const file = `${name}.png`;
    fs.writeFileSync(path.join(poseDir, file), canvas.toBuffer("image/png"));
    results[name] = { file, width: canvas.width, height: canvas.height, alphaPadding: padding };
  }
  return results;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r); ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function star(ctx, x, y, outer, color = "#ffd35f") {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? outer * 0.44 : outer;
    const px = x + Math.cos(angle) * radius; const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function sceneFor(pageNumber) {
  return sceneRanges.find(([start, end]) => pageNumber >= start && pageNumber <= end)?.[2] || "frontmatter";
}

function drawBackground(ctx, pageNumber) {
  const scene = sceneFor(pageNumber);
  const palettes = {
    frontmatter: ["#241350", "#563283"], doorway: ["#65458e", "#e99443"], square: ["#2c2f69", "#724886"],
    wind: ["#273665", "#75568b"], trail: ["#26395b", "#536d80"], porch: ["#70486c", "#d6813d"],
    gate: ["#384767", "#6d8352"], "moon-house": ["#263d67", "#466f84"], window: ["#19375b", "#416276"],
    banner: ["#173a49", "#4b7153"], "quiet-garden": ["#102c45", "#335a4d"], "golden-garden": ["#19424a", "#977238"],
    return: ["#18364c", "#3e6070"], lantern: ["#39265d", "#c16d2f"], parade: ["#17285c", "#5d4282"], home: ["#33244d", "#9b653e"],
  };
  const [top, bottom] = palettes[scene];
  const gradient = ctx.createLinearGradient(0, 0, 0, fullSize);
  gradient.addColorStop(0, top); gradient.addColorStop(0.75, bottom); gradient.addColorStop(1, "#e8ba73");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, fullSize, fullSize);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  const pageOffset = pageNumber * 83;
  for (let i = 0; i < 14; i += 1) { ctx.beginPath(); ctx.arc(110 + (pageOffset + i * 347) % 2400, 100 + (pageOffset + i * 211) % 740, i % 3 === 0 ? 9 : 5, 0, Math.PI * 2); ctx.fill(); }
  if (["doorway", "porch", "moon-house", "home"].includes(scene)) {
    ctx.fillStyle = "#efd0a2"; ctx.fillRect(110, 380, 650, 1050); ctx.fillStyle = "#653b34"; ctx.fillRect(245, 520, 380, 910);
  }
  if (["square", "lantern"].includes(scene)) {
    ctx.fillStyle = "#ee7c2e"; ctx.beginPath(); ctx.arc(460, 620, 210, 0, Math.PI * 2); ctx.fill(); star(ctx, 460, 620, 90, "#fff2a0");
  }
  if (["wind", "trail", "return"].includes(scene)) {
    ctx.strokeStyle = "rgba(255,210,85,.85)"; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(130, 970); ctx.bezierCurveTo(700, 450, 1320, 1280, 2420, 500); ctx.stroke();
  }
  if (["quiet-garden", "golden-garden", "banner"].includes(scene)) {
    ctx.fillStyle = "rgba(25,70,45,.85)";
    for (let i = 0; i < 8; i += 1) { ctx.beginPath(); ctx.arc(100 + i * 360, 1240 + (i % 2) * 80, 160, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(230,214,165,.55)"; ctx.beginPath(); ctx.ellipse(1320, 1510, 1180, 310, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (scene === "window") {
    ctx.fillStyle = "rgba(235,242,250,.3)"; ctx.fillRect(210, 330, 650, 840); star(ctx, 530, 650, 120, "#ffe28a");
  }
  if (scene === "banner") {
    ctx.fillStyle = "#ef853a"; ctx.fillRect(160, 460, 1030, 120); ctx.fillStyle = "#fff7d5"; ctx.font = "900 46px sans-serif"; ctx.fillText("PUMPKIN PARADE", 230, 540);
  }
  if (["parade", "lantern"].includes(scene)) { star(ctx, 380, 370, 64); star(ctx, 700, 260, 44); star(ctx, 1050, 390, 52); }
  ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(trim.x, trim.y, trim.width, artBottom - trim.y);
}

function renderBackgroundPlate(pageNumber) {
  const canvas = createCanvas(fullSize, fullSize);
  drawBackground(canvas.getContext("2d"), pageNumber);
  const outputPath = path.join(backgroundDir, `${String(pageNumber).padStart(2, "0")}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return {
    path: path.relative(root, outputPath),
    sourcePixels: [fullSize, fullSize],
    placedPixels: [fullSize, fullSize],
    rasterScale: 1,
    effectiveDpi: 300,
    characterFree: true,
  };
}

function wrap(ctx, text, width) {
  const paragraphs = text.split(/\n+/).filter(Boolean); const lines = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) { lines.push(line); line = word; } else line = candidate;
    }
    if (line) lines.push(line); lines.push("");
  }
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function drawText(ctx, pageNumber, text, scene) {
  const panelY = artBottom;
  ctx.fillStyle = "#fffaf2"; ctx.fillRect(0, panelY, fullSize, fullSize - panelY);
  ctx.fillStyle = "#e76d2f"; roundedRect(ctx, safe.x, panelY + 55, 650, 66, 33); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "900 26px sans-serif"; ctx.fillText("DIGITAL CANDIDATE · APPROVAL REQUIRED", safe.x + 28, panelY + 99);
  ctx.fillStyle = "#18364c"; ctx.font = "800 31px sans-serif"; ctx.fillText(`Page ${pageNumber} / 32`, safe.x + 700, panelY + 98);
  const title = sceneTitles[scene] || (pageNumber === 1 ? "Halloween Monster Night" : pageNumber === 32 ? "My Monster" : "Storybook review");
  ctx.font = "900 66px sans-serif"; ctx.fillText(title, safe.x, panelY + 200);
  let size = 43; let lines;
  do { ctx.font = `500 ${size}px sans-serif`; lines = wrap(ctx, text, safe.right - safe.x); size -= 1; } while (lines.length * (size + 15) > 470 && size > 29);
  const lineHeight = size + 17; let y = panelY + 280;
  for (const line of lines) { if (line) ctx.fillText(line, safe.x, y); y += line ? lineHeight : Math.round(lineHeight * 0.45); }
  return { fontSize: size + 1, lineCount: lines.length, bottom: y, fits: y <= trim.y + trim.height - 55 };
}

function clampPlacement(x, y, width, height) {
  const maxBottom = artBottom - 45;
  return {
    x: Math.round(Math.min(Math.max(x, safe.x), safe.right - width)),
    y: Math.round(Math.min(Math.max(y, safe.y), maxBottom - height)),
    width: Math.round(width), height: Math.round(height),
  };
}

async function drawCharacter(ctx, image, placement, kind) {
  const requestedHeight = kind === "child" ? 680 + placement.scale * 17 : 620 + placement.scale * 14;
  const targetHeight = Math.min(requestedHeight * (kind === "child" ? childRenderScale : 1), image.height);
  const ratio = image.width / image.height;
  let height = targetHeight; let width = height * ratio;
  const maxWidth = 980;
  if (width > maxWidth) { const factor = maxWidth / width; width *= factor; height *= factor; }
  const centerX = trim.x + trim.width * placement.x / 100;
  const baseline = trim.y + 1530;
  const box = clampPlacement(centerX - width / 2, baseline - height, width, height);
  ctx.save();
  if (placement.facing === "left") { ctx.translate(box.x + box.width, 0); ctx.scale(-1, 1); ctx.drawImage(image, 0, box.y, box.width, box.height); }
  else ctx.drawImage(image, box.x, box.y, box.width, box.height);
  ctx.restore();
  const rasterScale = Math.max(box.width / image.width, box.height / image.height);
  return {
    ...box,
    sourcePixels: [image.width, image.height],
    placedPixels: [box.width, box.height],
    rasterScale: Number(rasterScale.toFixed(4)),
    effectiveDpi: Number((300 / rasterScale).toFixed(1)),
  };
}

function drawCroppedImage(ctx, image, source, bounds) {
  const rasterScale = Math.min(bounds.width / source.width, bounds.height / source.height, 1);
  const width = Math.round(source.width * rasterScale);
  const height = Math.round(source.height * rasterScale);
  const box = {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2),
    width,
    height,
  };
  ctx.drawImage(image, source.x, source.y, source.width, source.height, box.x, box.y, box.width, box.height);
  return {
    ...box,
    sourcePixels: [source.width, source.height],
    placedPixels: [box.width, box.height],
    rasterScale: Number(rasterScale.toFixed(4)),
    effectiveDpi: Number((300 / rasterScale).toFixed(1)),
    aspectRatioPreserved: true,
    sourceCrop: source,
  };
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

async function composePage(page, pageNumber, assets) {
  const canvas = createCanvas(fullSize, fullSize); const ctx = canvas.getContext("2d");
  const backgroundPlate = renderBackgroundPlate(pageNumber);
  const background = await loadImage(path.join(root, backgroundPlate.path));
  ctx.drawImage(background, 0, 0, fullSize, fullSize);
  const scene = sceneFor(pageNumber);
  const text = page.text.replaceAll("{child_name}", "Maya").replaceAll("{monster_name}", "Larry");
  let childBox = null; let monsterBox = null; let drawingBox = null; let poseName = null;
  if (pageNumber === 2) {
    const drawing = await loadImage(path.join(root, "assets/gallery/red-blue-monster-before-after-source-v1.jpg"));
    drawingBox = drawCroppedImage(ctx, drawing, sourceDrawingCrop, { x: 800, y: 520, width: 1025, height: 700 });
  } else if (pageNumber === 32) {
    const drawing = await loadImage(path.join(root, "assets/gallery/red-blue-monster-before-after-source-v1.jpg"));
    drawingBox = drawCroppedImage(ctx, drawing, sourceDrawingCrop, { x: 370, y: 600, width: 560, height: 560 });
    monsterBox = await drawCharacter(ctx, assets.monster, { x: 73, scale: 36, facing: "right" }, "monster");
  } else if (page.monsterRequired) {
    if (page.monsterPlacement.layer === "behind") monsterBox = await drawCharacter(ctx, assets.monster, page.monsterPlacement, "monster");
    if (page.childRequired) {
      poseName = poseByPage[pageNumber];
      childBox = await drawCharacter(ctx, assets.poses[poseName], page.childPlacement, "child");
    }
    if (page.monsterPlacement.layer !== "behind") monsterBox = await drawCharacter(ctx, assets.monster, page.monsterPlacement, "monster");
  }
  const textResult = drawText(ctx, pageNumber, text, scene);
  const outputPath = path.join(pageDir, `${String(pageNumber).padStart(2, "0")}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  const cropSafe = [childBox, monsterBox, drawingBox].filter(Boolean).every((box) => box.x >= safe.x && box.y >= safe.y && box.x + box.width <= safe.right && box.y + box.height <= artBottom - 40);
  return {
    pageNumber, scene, text, outputPath: path.relative(root, outputPath), poseName,
    backgroundPlate, childBox, monsterBox, drawingBox, cropSafe, textFits: textResult.fits,
    characterOverlapPixels: childBox && monsterBox ? overlapArea(childBox, monsterBox) : 0,
  };
}

async function contactSheet(pageResults) {
  const thumb = 420; const gap = 34; const columns = 4; const rows = 8;
  const canvas = createCanvas(columns * thumb + (columns + 1) * gap, 190 + rows * thumb + (rows + 1) * gap);
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#f2ede5"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#18364c"; ctx.font = "900 56px sans-serif"; ctx.fillText("Halloween Monster Night - editable wheelchair profile", 42, 72);
  ctx.fillStyle = "#a14e26"; ctx.font = "700 27px sans-serif"; ctx.fillText(`${appearance.label} · ${ageBand} · ${relativeHeight} · 32 pages · print approval pending`, 42, 122);
  for (let index = 0; index < pageResults.length; index += 1) {
    const image = await loadImage(path.join(root, pageResults[index].outputPath));
    const x = gap + (index % columns) * (thumb + gap); const y = 170 + gap + Math.floor(index / columns) * (thumb + gap);
    ctx.fillStyle = "#fff"; ctx.fillRect(x - 5, y - 5, thumb + 10, thumb + 10); ctx.drawImage(image, x, y, thumb, thumb);
  }
  const outputPath = path.join(outputDir, "wheelchair-full-review-contact-sheet.png");
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return { path: path.relative(root, outputPath), width: canvas.width, height: canvas.height };
}

async function main() {
  ensureDirs();
  const poseInfo = {};
  for (const [name, file] of Object.entries(existingPoses)) poseInfo[name] = { file };
  for (const sheet of newPoseSheets) Object.assign(poseInfo, await splitSheet(sheet));
  const poses = {};
  for (const [name, info] of Object.entries(poseInfo)) poses[name] = await loadImage(path.join(poseDir, info.file));
  const assets = { poses, monster: await loadImage(path.join(root, "assets/gallery/larry-three-leg-gallery-v1.png")) };
  const masterPages = buildHalloweenMasterPages();
  const results = [];
  for (let index = 0; index < masterPages.length; index += 1) results.push(await composePage(masterPages[index], index + 1, assets));
  const sheet = await contactSheet(results);
  const report = {
    status: "digital_production_candidate_complete",
    editorSelectionEnabled: true,
    productionSelectionEnabled: false,
    approval: { visualDirectionApproved: true, editableVariationsApproved: true, printReadyApproved: false },
    profile: { ...selectedProfile, key: childProfileKey(selectedProfile), synthetic: true, childName: "Maya", renderScale: Number(childRenderScale.toFixed(4)) },
    sourceDrawing: { path: "assets/gallery/red-blue-monster-before-after-source-v1.jpg", nativePixels: [588, 1280], cropPixels: sourceDrawingCrop, cropMatchesApprovedGalleryPresentation: true },
    output: { fullBleedPixels: [fullSize, fullSize], trimPixels: trim, nominalDpi: 300, trimInches: [8.5, 8.5], bleedInchesPerEdge: 0.125, safeInsetPixels: safeInset, colorSpace: "sRGB/RGB", transparencyFlattenedInPdf: true },
    poseAssets: Object.fromEntries(Object.entries(poseInfo).map(([name, info]) => [name, path.relative(root, path.join(poseDir, info.file))])),
    pages: results,
    contactSheet: sheet,
    checks: {
      pageCount: results.length,
      requiredChildPages: results.filter((page) => page.childBox).length,
      distinctPosesUsed: new Set(results.map((page) => page.poseName).filter(Boolean)).size,
      allCropSafe: results.every((page) => page.cropSafe),
      allTextFits: results.every((page) => page.textFits),
      movementNeutral: results.every((page) => !/\bMaya\b[^.!?]{0,48}\b(?:walk|walked|walking|stand|stood|standing|run|ran|running|jump|jumped|jumping|climb|climbed|climbing|march|marched|marching)\b/i.test(page.text)),
      allBackgroundsNative300Dpi: results.every((page) => page.backgroundPlate.rasterScale === 1 && page.backgroundPlate.effectiveDpi === 300),
      allPlacedRasterAssetsAtLeast300EffectiveDpi: results.every((page) => [page.childBox, page.monsterBox, page.drawingBox].filter(Boolean).every((box) => box.rasterScale <= 1 && box.effectiveDpi >= 300)),
      originalDrawingAspectRatioPreserved: results.filter((page) => page.drawingBox).every((page) => page.drawingBox.aspectRatioPreserved),
      supportedWheelchairProfile: isSupportedWheelchairProfile(selectedProfile),
    },
    remainingProductionGate: [
      "Approve the 32 final-size character-free background candidates and all composed pages; digital checks cannot supply human art approval.",
      "Run the provider file-validation endpoint against the exact final interior and cover PDFs once final cover geometry is available.",
      "Order and review a physical proof; no digital preflight can verify paper, binding, trim variance, or printed color.",
      "Record production composition approval for every required child page after the physical-proof corrections are complete.",
      "Do not enable other age, appearance, or accessibility profiles until their own complete assets and verification exist.",
    ],
  };
  if (report.checks.pageCount !== 32 || report.checks.requiredChildPages !== 28 || report.checks.distinctPosesUsed < 10 || !report.checks.allCropSafe || !report.checks.allTextFits || !report.checks.movementNeutral || !report.checks.allBackgroundsNative300Dpi || !report.checks.allPlacedRasterAssetsAtLeast300EffectiveDpi || !report.checks.originalDrawingAspectRatioPreserved) {
    throw new Error(`Full review checks failed: ${JSON.stringify(report.checks)}`);
  }
  const reportPath = path.join(outputDir, "render-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const committedManifest = {
    ...report,
    pages: report.pages.map(({ pageNumber, scene, poseName, backgroundPlate, childBox, monsterBox, drawingBox, cropSafe, textFits, characterOverlapPixels }) => ({
      pageNumber, scene, poseName, backgroundPlate, childBox, monsterBox, drawingBox, cropSafe, textFits, characterOverlapPixels,
    })),
    contactSheet: undefined,
  };
  const manifestDir = path.join(root, "docs/wheelchair-profile-manifests");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, `${outputSlug}.json`), `${JSON.stringify(committedManifest, null, 2)}\n`);
  process.stdout.write(`${reportPath}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
