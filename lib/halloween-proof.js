const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { resolveChildCharacter, childCharacterIds } = require("./child-characters");
const { buildHalloweenMasterPages, splitSpreadText } = require("./halloween-master-pages");
const { composeReviewBook } = require("./review-composition");
const { deriveMonsterGeometry, trustedMonsterGeometry } = require("./monster-geometry");

const STORY_ID = "halloween-monster-night";
const TITLE = "Halloween Monster Night";

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function buildHalloweenProof(payload, trustedAssets = {}) {
  const childName = String(payload.personalization?.childName || "").trim();
  const monsterName = String(payload.personalization?.monsterName || "").trim();
  const requestedChild = payload.personalization?.childCharacter;
  const requestedId = typeof requestedChild === "string" ? requestedChild : requestedChild?.id;
  if (requestedId && !childCharacterIds().includes(requestedId)) throw fail("Choose an available child character.");
  const childCharacter = resolveChildCharacter(requestedChild);
  if (!childName || !monsterName || childName.length > 40 || monsterName.length > 40) {
    throw fail("Enter child and monster names of 1–40 characters.");
  }
  const monsterImage = payload.monsterImage;
  if (typeof monsterImage !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(monsterImage) || monsterImage.length > 4 * 1024 * 1024) {
    throw fail("Select a monster preview under 3 MB before making your book proof.");
  }
  const selectedPreviewId = payload.selectedPreviewId || "review-image";
  const proposedGeometry = trustedAssets && Object.prototype.hasOwnProperty.call(trustedAssets, "monsterGeometry") ? trustedAssets.monsterGeometry : null;
  const geometry = trustedMonsterGeometry(proposedGeometry, { source: monsterImage, selectedPreviewId, bytes: Buffer.from(monsterImage.split(",")[1], "base64") });
  const manuscript = fs.readFileSync(path.join(__dirname, "story-data", "halloween-monster-night.md"), "utf8");
  const substitute = (text) => text.replace(/[`*]/g, "").replace(/\{(child_name|monster_name)\}/g, (_, token) => token === "child_name" ? childName : monsterName);
  const spreads = [...manuscript.matchAll(/## Pages (\d+)–(\d+) — Spread \d+: ([^\n]+)\n\n\*\*Final story text:\*\*\s+([\s\S]*?)\n\n\*\*Illustration direction:/g)];
  if (spreads.length !== 14) throw fail("The Halloween manuscript needs a production review.", 503);
  const pages = [
    { number: 1, title: TITLE, text: "A Halloween adventure", art: false },
    { number: 2, title: TITLE, text: `Starring ${childName} and ${monsterName}\n\nThis book belongs to a one-of-a-kind monster maker.`, art: true },
    { number: 3, title: "Made from imagination", text: "MonstersNOW\nLayout proof for review only. Not a print-ready edition.\n\nLayered review uses existing environment plates and sample child artwork. Final poses, front matter, original-drawing pages, and print artwork are still pending.", art: false },
  ];
  for (const spread of spreads) {
    const halves = splitSpreadText(substitute(spread[4]).trim());
    pages.push({ number: Number(spread[1]), title: spread[3], text: halves[0], art: true });
    pages.push({ number: Number(spread[2]), title: spread[3], text: halves[1], art: true });
  }
  pages.push({ number: 32, title: `Meet ${monsterName}!`, text: `Created by ${childName}\n\nEvery great monster begins with a great imagination.`, art: true });
  const format = payload.format === "hardcover" ? "hardcover" : "softcover";
  const masterPages = buildHalloweenMasterPages(manuscript).map((page, index) => {
    const number = index + 1;
    if (number < 4 || number > 31) return { ...page, ...pages[index] };
    const first = number % 2 === 0 ? number : number - 1;
    const spread = `${String(first).padStart(2, "0")}-${String(first + 1).padStart(2, "0")}`;
    return { ...page, ...pages[index], artworkUrl: `/assets/storybook/${STORY_ID}/pages-${spread}-environment-v1.png`, backgroundCrop: number === 7 ? "center" : number % 2 === 0 ? "left" : "right" };
  });
  const composition = composeReviewBook({ id: STORY_ID, title: TITLE, pages: masterPages }, {
    childName, monsterName, childCharacter, format, selectedPreviewId,
  }, { monsterImage, monsterGeometry: geometry });
  const proof = {
    storyId: STORY_ID, title: TITLE, childName, monsterName, childCharacter, monsterImage, format,
    reviewOnly: true, productionReady: false, rendererVersion: composition.rendererVersion,
    warnings: composition.warnings, pages: composition.pages,
    manuscriptVersion: crypto.createHash("sha256").update(manuscript).digest("hex"),
  };
  return { ...proof, proofHash: crypto.createHash("sha256").update(JSON.stringify(proof)).digest("hex") };
}

async function buildHalloweenProofWithGeometry(payload) {
  const source = payload?.monsterImage;
  if (typeof source !== "string" || source.length > 4 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source)) return buildHalloweenProof(payload);
  const bytes = Buffer.from(source.split(",")[1], "base64");
  const monsterGeometry = await deriveMonsterGeometry(bytes, { source, selectedPreviewId: payload.selectedPreviewId || "review-image" });
  return buildHalloweenProof(payload, { monsterGeometry });
}

function secret() {
  if (!process.env.STORYBOOK_PROOF_SECRET) throw fail("Test proof signing is not configured yet.", 503);
  return process.env.STORYBOOK_PROOF_SECRET;
}

function signProof(proof) {
  const value = Buffer.from(JSON.stringify({ hash: proof.proofHash, expires: Date.now() + 60 * 60 * 1000 })).toString("base64url");
  return `${value}.${crypto.createHmac("sha256", secret()).update(value).digest("hex")}`;
}

function verifyProof(proof, token) {
  const [value, signature] = String(token || "").split(".");
  const expected = crypto.createHmac("sha256", secret()).update(value || "").digest("hex");
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw fail("Rebuild and review your book proof before checkout.");
  let receipt;
  try { receipt = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw fail("Invalid proof receipt."); }
  if (receipt.hash !== proof.proofHash || receipt.expires < Date.now()) throw fail("Your proof changed or expired. Rebuild it before checkout.");
}

module.exports = { buildHalloweenProof, buildHalloweenProofWithGeometry, signProof, verifyProof, STORY_ID, TITLE };
