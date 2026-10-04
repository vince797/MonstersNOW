#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const root = path.resolve(__dirname, "..");
const base = path.join(root, "output/wheelchair-customization-v1");
const examples = [
  { source: "warm-curly-dark-5-6-average/pages/20.png", title: "Curly dark", detail: "Ages 5–6 · Average height" },
  { source: "deep-braids-black-7-8-taller/pages/20.png", title: "Braids", detail: "Ages 7–8 · Taller" },
];

async function main() {
  const width = 1840;
  const height = 1120;
  const margin = 70;
  const gap = 50;
  const cardWidth = (width - margin * 2 - gap) / 2;
  const artSize = cardWidth - 36;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5efe5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#18364c";
  ctx.font = "900 58px sans-serif";
  ctx.fillText("Editable wheelchair character examples", margin, 76);
  ctx.fillStyle = "#5c6670";
  ctx.font = "500 28px sans-serif";
  ctx.fillText("Two supported profiles · same wheelchair · seated proportions preserved", margin, 122);

  for (let index = 0; index < examples.length; index += 1) {
    const item = examples[index];
    const x = margin + index * (cardWidth + gap);
    const y = 165;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x, y, cardWidth, 875, 24);
    ctx.fill();
    const image = await loadImage(path.join(base, item.source));
    ctx.drawImage(image, x + 18, y + 18, artSize, artSize);
    ctx.fillStyle = "#18364c";
    ctx.font = "800 38px sans-serif";
    ctx.fillText(item.title, x + 28, y + artSize + 68);
    ctx.fillStyle = "#a14e26";
    ctx.font = "700 25px sans-serif";
    ctx.fillText(item.detail, x + 28, y + artSize + 108);
  }
  ctx.fillStyle = "#18364c";
  ctx.font = "700 24px sans-serif";
  ctx.fillText("Preview/editing enabled · Print ordering remains pending final composition approval and physical proof", margin, 1090);
  const output = path.join(base, "wheelchair-customization-comparison.png");
  fs.writeFileSync(output, canvas.toBuffer("image/png"));
  process.stdout.write(`${output}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
