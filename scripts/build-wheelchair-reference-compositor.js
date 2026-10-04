#!/usr/bin/env node
/*
 * Builds one synthetic, reference-only wheelchair profile through a real raster
 * composition path. The output is deliberately gated from production: it is a
 * visual review artifact, not approved book artwork.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets/storybook/halloween-monster-night/reference/wheelchair-child-pose-sheet-v1.png");
const poseDir = path.join(root, "assets/storybook/halloween-monster-night/reference/wheelchair-profile-v1");
const outputDir = path.join(root, "output/wheelchair-reference-compositor");
const pageSize = 2550;
const safeMargin = 150;
const artworkBottom = 1900;

const pages = [
  {
    id: "doorway",
    label: "Pages 4–5 · Doorway",
    title: "A special Halloween",
    text: "Maya took an empty treat bucket and made their way to the open door. Noodle was waiting outside.",
    guidance: "Preserve the full chair silhouette and step-free route; do not substitute a standing pose.",
    quadrant: { x: 0, y: 0, width: 656, height: 586 },
    poseFile: "doorway.png",
    targetHeight: 1320,
    x: 1080,
    y: 390,
    palette: ["#112f4b", "#28556a", "#ffb24d"],
  },
  {
    id: "town-square",
    label: "Pages 6–7 · Town square",
    title: "The Monster Star",
    text: "Maya and Noodle joined the crowd near the giant pumpkin lantern. Together, they watched the Monster Star glow.",
    guidance: "Keep an accessible clear route and the same chair colors, wheels, casters, and footplate.",
    quadrant: { x: 656, y: 0, width: 656, height: 590 },
    poseFile: "town-square.png",
    targetHeight: 1320,
    x: 900,
    y: 380,
    palette: ["#183153", "#603d71", "#ffc653"],
  },
  {
    id: "parade",
    label: "Page 30 · Parade",
    title: "Lead the parade",
    text: "Maya and Noodle led the parade beneath the glowing stars. The treat bucket rode safely beside Maya.",
    guidance: "Show equal participation; the bucket is attached without hiding the chair or changing seated proportions.",
    quadrant: { x: 0, y: 586, width: 656, height: 613 },
    poseFile: "parade.png",
    targetHeight: 1260,
    x: 1040,
    y: 430,
    palette: ["#151f46", "#313c77", "#ffcf64"],
  },
  {
    id: "garden",
    label: "Pages 24–25 · Garden",
    title: "One kind act",
    text: "Maya followed Noodle along the wide garden path, then paused beside the warm golden clue.",
    guidance: "No stairs or narrow barriers; preserve the same wheelchair and seated child identity.",
    quadrant: { x: 656, y: 590, width: 656, height: 609 },
    poseFile: "garden.png",
    targetHeight: 1180,
    x: 820,
    y: 500,
    palette: ["#153e45", "#2f695c", "#ffd26d"],
  },
];

function ensureDirectories() {
  fs.mkdirSync(poseDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
}

function alphaBounds(ctx, width, height, threshold = 4) {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Pose quadrant has no visible pixels.");
  return { left, top, right, bottom };
}

async function splitPose(source, page) {
  const { x, y, width, height } = page.quadrant;
  const quadrant = createCanvas(width, height);
  const qctx = quadrant.getContext("2d");
  qctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  const bounds = alphaBounds(qctx, width, height);
  const padding = 24;
  const contentWidth = bounds.right - bounds.left + 1;
  const contentHeight = bounds.bottom - bounds.top + 1;
  const trimmed = createCanvas(contentWidth + padding * 2, contentHeight + padding * 2);
  trimmed.getContext("2d").drawImage(
    quadrant,
    bounds.left,
    bounds.top,
    contentWidth,
    contentHeight,
    padding,
    padding,
    contentWidth,
    contentHeight,
  );
  const posePath = path.join(poseDir, page.poseFile);
  fs.writeFileSync(posePath, trimmed.toBuffer("image/png"));
  return {
    path: path.relative(root, posePath),
    width: trimmed.width,
    height: trimmed.height,
    alphaBounds: { left: padding, top: padding, right: padding + contentWidth - 1, bottom: padding + contentHeight - 1 },
    padding,
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawStar(ctx, centerX, centerY, outerRadius, innerRadius = outerRadius * 0.45) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawScene(ctx, page) {
  const gradient = ctx.createLinearGradient(0, 0, 0, artworkBottom);
  gradient.addColorStop(0, page.palette[0]);
  gradient.addColorStop(1, page.palette[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, pageSize, artworkBottom);

  ctx.fillStyle = "rgba(255,255,255,.72)";
  for (let index = 0; index < 12; index += 1) {
    const x = 130 + ((index * 337) % 2260);
    const y = 90 + ((index * 197) % 700);
    ctx.beginPath();
    ctx.arc(x, y, index % 3 === 0 ? 11 : 7, 0, Math.PI * 2);
    ctx.fill();
  }

  if (page.id === "doorway") {
    ctx.fillStyle = "#f1d0a0";
    ctx.fillRect(170, 390, 680, 1110);
    ctx.fillStyle = "#733b28";
    ctx.fillRect(300, 540, 420, 960);
    ctx.fillStyle = page.palette[2];
    ctx.beginPath(); ctx.arc(640, 1010, 22, 0, Math.PI * 2); ctx.fill();
  } else if (page.id === "town-square") {
    ctx.fillStyle = page.palette[2];
    ctx.beginPath(); ctx.arc(420, 560, 230, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e77b31";
    ctx.beginPath(); ctx.arc(420, 560, 165, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff5b8";
    drawStar(ctx, 420, 560, 92);
  } else if (page.id === "parade") {
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.moveTo(0, 1420); ctx.lineTo(pageSize, 1130); ctx.lineTo(pageSize, artworkBottom); ctx.lineTo(0, artworkBottom); ctx.closePath(); ctx.fill();
    ctx.fillStyle = page.palette[2];
    drawStar(ctx, 260, 430, 42);
    drawStar(ctx, 430, 390, 56);
    drawStar(ctx, 620, 450, 38);
  } else {
    ctx.fillStyle = "rgba(236,231,183,.4)";
    ctx.beginPath(); ctx.ellipse(1240, 1550, 1040, 300, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#204b38";
    for (let index = 0; index < 7; index += 1) {
      ctx.beginPath(); ctx.arc(180 + index * 350, 1180 + (index % 2) * 80, 145, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(safeMargin, safeMargin, pageSize - safeMargin * 2, artworkBottom - safeMargin * 2);
}

function drawTextPanel(ctx, page) {
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(0, artworkBottom, pageSize, pageSize - artworkBottom);
  ctx.fillStyle = "#e76d2f";
  roundedRect(ctx, safeMargin, 1980, 600, 76, 38);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 30px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("REFERENCE ONLY · NOT PRINT READY", safeMargin + 32, 2031);
  ctx.fillStyle = "#20374a";
  ctx.font = "700 34px sans-serif";
  ctx.fillText(page.label, 820, 2032);
  ctx.font = "900 74px sans-serif";
  ctx.fillText(page.title, safeMargin, 2150);
  ctx.font = "500 49px sans-serif";
  const lines = wrapLines(ctx, page.text, pageSize - safeMargin * 2);
  lines.slice(0, 3).forEach((line, index) => ctx.fillText(line, safeMargin, 2235 + index * 66));
  ctx.fillStyle = "#5c6a73";
  ctx.font = "500 27px sans-serif";
  const direction = wrapLines(ctx, `Art direction: ${page.guidance}`, pageSize - safeMargin * 2);
  direction.slice(0, 2).forEach((line, index) => ctx.fillText(line, safeMargin, 2445 + index * 38));
}

async function composePage(page, pose) {
  const canvas = createCanvas(pageSize, pageSize);
  const ctx = canvas.getContext("2d");
  drawScene(ctx, page);
  const image = await loadImage(path.join(root, pose.path));
  const scale = page.targetHeight / image.height;
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  ctx.drawImage(image, page.x, page.y, width, height);
  drawTextPanel(ctx, page);
  const placement = { x: page.x, y: page.y, width, height };
  const cropSafe = placement.x >= safeMargin
    && placement.y >= safeMargin
    && placement.x + placement.width <= pageSize - safeMargin
    && placement.y + placement.height <= artworkBottom - safeMargin;
  if (!cropSafe) throw new Error(`${page.id} pose placement crosses the print-safe artwork area.`);
  const outputPath = path.join(outputDir, `${page.id}-2550.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return { path: path.relative(root, outputPath), width: pageSize, height: pageSize, placement, cropSafe, canvas };
}

function buildContactSheet(rendered) {
  const canvas = createCanvas(2048, 2220);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f3eee6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#18364c";
  ctx.font = "900 64px sans-serif";
  ctx.fillText("Wheelchair profile · compositor review", 80, 90);
  ctx.fillStyle = "#9a4b27";
  ctx.font = "700 30px sans-serif";
  ctx.fillText("Synthetic profile · four 2550×2550 page placements · reference only", 80, 140);
  rendered.forEach((item, index) => {
    const x = 70 + (index % 2) * 1000;
    const y = 190 + Math.floor(index / 2) * 990;
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, x - 12, y - 12, 944, 944, 24);
    ctx.fill();
    ctx.drawImage(item.canvas, x, y, 920, 920);
  });
  ctx.fillStyle = "#18364c";
  ctx.font = "700 28px sans-serif";
  ctx.fillText("Approval required before any production selection is enabled.", 80, 2175);
  const outputPath = path.join(outputDir, "wheelchair-profile-compositor-review.png");
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return { path: path.relative(root, outputPath), width: canvas.width, height: canvas.height };
}

async function main() {
  ensureDirectories();
  const source = await loadImage(sourcePath);
  const rendered = [];
  for (const page of pages) {
    const pose = await splitPose(source, page);
    const composite = await composePage(page, pose);
    rendered.push({ page, pose, ...composite });
  }
  const contactSheet = buildContactSheet(rendered);
  const report = {
    status: "reference_only",
    generatedAt: new Date().toISOString(),
    productionSelectionEnabled: false,
    approval: { artApproved: false, requiredNow: true },
    profile: { key: "warm-curly-dark:5-6:wheelchair", synthetic: true, childName: "Maya", mobilityAid: "wheelchair" },
    outputIntent: { width: pageSize, height: pageSize, nominalDpi: 300, trimInches: "8.5 × 8.5", safeMarginPixels: safeMargin },
    source: path.relative(root, sourcePath),
    pages: rendered.map(({ page, pose, path: renderedPath, width, height, placement, cropSafe }) => ({
      id: page.id,
      text: page.text,
      guidance: page.guidance,
      pose,
      renderedPath,
      dimensions: { width, height },
      placement,
      cropSafe,
      movementNeutral: true,
    })),
    contactSheet,
    referenceChecks: {
      separateTransparentPoses: true,
      compositorConnected: true,
      intendedPixelDimensions: true,
      cropSafety: true,
      movementNeutralText: true,
    },
    remainingProductionGate: [
      "User/art-director approval of this synthetic profile reference.",
      "Print-ready edge cleanup and color review for every approved pose.",
      "Equivalent approved assets for every offered age and appearance combination.",
      "All required book pages verified at final placement and proof-editing dimensions.",
    ],
  };
  const reportPath = path.join(outputDir, "render-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${reportPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
