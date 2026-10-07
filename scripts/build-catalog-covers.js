#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets/storybook/cover-series/minimal-concepts");
const printFrontDir = path.join(root, "assets/storybook/cover-series/lulu-fronts");
const logoPath = path.join(root, "assets/brand/monstersnow-primary-v1.png");

const CATALOG_SIZE = 1254;
const PRINT_FRONT_SIZE = 2625;
const LOGO = {
  width: 300,
  top: 126,
};

const covers = {
  "halloween-monster-night": {
    source: "assets/storybook/halloween-monster-night/covers/cover-title-scene-cinematic-muted-v4.png",
    output: "halloween-monster-night-v5",
  },
  "big-adventure": {
    source: "assets/storybook/cover-series/logo-free-sources/big-adventure-v4.png",
    output: "big-adventure-v4",
  },
  "bedtime-monster": {
    source: "assets/storybook/cover-series/logo-free-sources/bedtime-monster-v5.png",
    output: "bedtime-monster-v5",
  },
  "abc-monster-book": {
    source: "assets/storybook/cover-series/logo-free-sources/abc-monster-book-v4.png",
    output: "abc-monster-book-v4",
  },
  "counting-with-my-monster": {
    source: "assets/storybook/cover-series/logo-free-sources/counting-with-my-monster-v4.png",
    output: "counting-with-my-monster-v4",
  },
  "the-monster-who-lost-their-glow": {
    source: "assets/storybook/cover-series/logo-free-sources/the-monster-who-lost-their-glow-v5.png",
    output: "the-monster-who-lost-their-glow-v5",
  },
  "birthday-monster-adventure": {
    source: "assets/storybook/cover-series/logo-free-sources/birthday-monster-adventure-v4.png",
    output: "birthday-monster-adventure-v4",
  },
};

async function buildCatalogCover(slug, definition, logo) {
  const source = await loadImage(path.join(root, definition.source));
  if (source.width !== CATALOG_SIZE || source.height !== CATALOG_SIZE) {
    throw new Error(`${slug} source must be ${CATALOG_SIZE} x ${CATALOG_SIZE}.`);
  }

  const canvas = createCanvas(CATALOG_SIZE, CATALOG_SIZE);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);

  const logoHeight = LOGO.width * logo.height / logo.width;
  context.drawImage(
    logo,
    (CATALOG_SIZE - LOGO.width) / 2,
    LOGO.top,
    LOGO.width,
    logoHeight,
  );

  const preview = createCanvas(640, 640);
  preview.getContext("2d").drawImage(canvas, 0, 0, 640, 640);

  const printFront = createCanvas(PRINT_FRONT_SIZE, PRINT_FRONT_SIZE);
  printFront.getContext("2d").drawImage(canvas, 0, 0, PRINT_FRONT_SIZE, PRINT_FRONT_SIZE);

  await Promise.all([
    fs.writeFile(path.join(outputDir, `${definition.output}.png`), await canvas.encode("png")),
    fs.writeFile(path.join(outputDir, `${definition.output}-web.jpg`), await canvas.encode("jpeg", 91)),
    fs.writeFile(path.join(outputDir, `${definition.output}-640.webp`), await preview.encode("webp", 88)),
    fs.writeFile(
      path.join(printFrontDir, `${definition.output}-front-8.5x8.5-300ppi.png`),
      await printFront.encode("png"),
    ),
  ]);
}

async function main(selectedSlugs = process.argv.slice(2)) {
  const slugs = selectedSlugs.length ? selectedSlugs : Object.keys(covers);
  const unknown = slugs.filter((slug) => !covers[slug]);
  if (unknown.length) throw new Error(`Unknown cover slug: ${unknown.join(", ")}`);

  await fs.mkdir(printFrontDir, { recursive: true });
  const logo = await loadImage(logoPath);
  for (const slug of slugs) await buildCatalogCover(slug, covers[slug], logo);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  CATALOG_SIZE,
  LOGO,
  PRINT_FRONT_SIZE,
  covers,
  main,
};
