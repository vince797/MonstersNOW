const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const STORY_ID = "halloween-monster-night";
const TITLE = "Halloween Monster Night";

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function buildHalloweenProof(payload) {
  const childName = String(payload.personalization?.childName || "").trim();
  const monsterName = String(payload.personalization?.monsterName || "").trim();
  if (!childName || !monsterName || childName.length > 40 || monsterName.length > 40) {
    throw fail("Enter child and monster names of 1–40 characters.");
  }
  const monsterImage = payload.monsterImage;
  if (typeof monsterImage !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(monsterImage) || monsterImage.length > 4 * 1024 * 1024) {
    throw fail("Select a monster preview under 3 MB before making your book proof.");
  }
  const manuscript = fs.readFileSync(path.join(__dirname, "story-data", "halloween-monster-night.md"), "utf8");
  const substitute = (text) => text.replace(/[`*]/g, "").replace(/\{(child_name|monster_name)\}/g, (_, token) => token === "child_name" ? childName : monsterName);
  const spreads = [...manuscript.matchAll(/## Pages (\d+)–(\d+) — Spread \d+: ([^\n]+)\n\n\*\*Final story text:\*\*\s+([\s\S]*?)\n\n\*\*Illustration direction:/g)];
  if (spreads.length !== 14) throw fail("The Halloween manuscript needs a production review.", 503);
  const pages = [
    { number: 1, title: TITLE, text: "A Halloween adventure", art: false },
    { number: 2, title: TITLE, text: `Starring ${childName} and ${monsterName}\n\nThis book belongs to a one-of-a-kind monster maker.`, art: true },
    { number: 3, title: "Made from imagination", text: "MonstersNOW\nLayout proof for review only. Not a print-ready edition.\n\nThe selected monster is shown as a character vignette. Scene illustrations and the original-drawing pages are still pending.", art: false },
  ];
  for (const spread of spreads) {
    const paragraphs = substitute(spread[4]).trim().split(/\n\s*\n/);
    const total = paragraphs.join(" ").length;
    let split = 1;
    while (split < paragraphs.length - 1 && paragraphs.slice(0, split).join(" ").length < total / 2) split++;
    pages.push({ number: Number(spread[1]), title: spread[3], text: paragraphs.slice(0, split).join("\n\n"), art: true });
    pages.push({ number: Number(spread[2]), title: spread[3], text: paragraphs.slice(split).join("\n\n"), art: true });
  }
  pages.push({ number: 32, title: `Meet ${monsterName}!`, text: `Created by ${childName}\n\nEvery great monster begins with a great imagination.`, art: true });
  const format = payload.format === "hardcover" ? "hardcover" : "softcover";
  const proof = { storyId: STORY_ID, title: TITLE, childName, monsterName, monsterImage, format, pages, manuscriptVersion: crypto.createHash("sha256").update(manuscript).digest("hex") };
  return { ...proof, proofHash: crypto.createHash("sha256").update(JSON.stringify(proof)).digest("hex") };
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

module.exports = { buildHalloweenProof, signProof, verifyProof, STORY_ID, TITLE };
