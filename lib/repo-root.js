const path = require("node:path");

/*
 * Project root for print assets (fonts, local art).
 *
 * This is a function call on purpose. Vercel's file tracer (nft) evaluates
 * constant paths, so `path.join(ROOT, dynamicPath)` with a constant ROOT is
 * treated as a wildcard and bundles the entire repository into the function
 * (over Vercel's 250 MB limit). The files the print route needs are listed
 * explicitly in vercel.json `includeFiles` instead.
 */
function repoRoot() {
  return path.resolve(__dirname, "..");
}

module.exports = { repoRoot };
