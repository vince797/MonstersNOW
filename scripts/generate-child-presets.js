#!/usr/bin/env node
// Paints the Character Studio quick-start looks (lib/child-presets.js) once,
// using the site's own OpenAI key on the server. Run by an admin:
//
//   SITE_URL=https://<preview-or-production-host> ADMIN_PASSWORD=... node scripts/generate-child-presets.js
//   node scripts/generate-child-presets.js --only=finn,zuri   # just these
//   node scripts/generate-child-presets.js --force            # repaint existing ones
//   node scripts/generate-child-presets.js --dry-run          # list what would run
//
// Each look is one request to POST /api/render-child-character?resource=presets
// (admin password + the "preset" rate limit; about 1-2 minutes and one image
// generation each). Looks that already have art are skipped, so it is safe to
// re-run after a failure. Nothing here stores or prints the password.
const { CHILD_PRESETS } = require("../lib/child-presets");

const REQUEST_TIMEOUT_MS = 170 * 1000;

function parseArgs(argv) {
  const options = { force: false, dryRun: false, only: null };
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--only=")) options.only = new Set(arg.slice(7).split(",").map((id) => id.trim()).filter(Boolean));
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: SITE_URL=https://... ADMIN_PASSWORD=... node scripts/generate-child-presets.js [--only=id,id] [--force] [--dry-run]");
    console.log(`Looks: ${CHILD_PRESETS.map((preset) => preset.id).join(", ")}`);
    return;
  }
  const site = String(process.env.SITE_URL || "").replace(/\/+$/, "");
  const password = process.env.ADMIN_PASSWORD || "";
  if (!/^https?:\/\//.test(site)) throw new Error("Set SITE_URL to the site to generate on, e.g. https://monstersnow.com");
  if (!password && !options.dryRun) throw new Error("Set ADMIN_PASSWORD (the same password used for /admin).");
  if (options.only) {
    const unknown = [...options.only].filter((id) => !CHILD_PRESETS.some((preset) => preset.id === id));
    if (unknown.length) throw new Error(`Unknown look id(s): ${unknown.join(", ")}`);
  }

  const manifestResponse = await fetch(`${site}/api/render-child-character?resource=presets`);
  if (!manifestResponse.ok) throw new Error(`Could not read the preset list (${manifestResponse.status}).`);
  const manifest = await manifestResponse.json();
  const painted = new Set((manifest.presets || []).filter((preset) => preset.imageUrl).map((preset) => preset.id));

  const queue = CHILD_PRESETS.filter((preset) => (!options.only || options.only.has(preset.id)) && (options.force || !painted.has(preset.id)));
  console.log(`${painted.size}/${CHILD_PRESETS.length} looks already painted; ${queue.length} to paint on ${site}.`);
  if (options.dryRun || !queue.length) {
    for (const preset of queue) console.log(`  would paint ${preset.id} (${preset.label})`);
    return;
  }

  const failures = [];
  for (const [index, preset] of queue.entries()) {
    const started = Date.now();
    process.stdout.write(`[${index + 1}/${queue.length}] ${preset.id} (${preset.label})… `);
    try {
      const response = await fetch(`${site}/api/render-child-character?resource=presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ presetId: preset.id }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        throw Object.assign(new Error(`${response.status} ${body.code || ""} ${body.error || ""}`.trim()), { status: response.status, retryAfter });
      }
      const note = body.transparentBackground === false ? " (check: background not fully transparent)" : "";
      console.log(`done in ${Math.round((Date.now() - started) / 1000)}s${note}`);
    } catch (error) {
      console.log(`failed: ${error.name === "TimeoutError" ? "timed out" : error.message}`);
      failures.push(preset.id);
      if (error.status === 401 || error.status === 503) break; // wrong password / not configured: stop early
      if (error.status === 429) {
        console.log(`Rate limit reached${error.retryAfter ? ` (retry after ${error.retryAfter}s)` : ""}; re-run later to continue.`);
        break;
      }
    }
  }
  if (failures.length) {
    console.log(`Not painted: ${failures.join(", ")}. Re-run the same command to retry (finished looks are skipped).`);
    process.exitCode = 1;
  } else {
    console.log(`Painted ${queue.length} look(s). The editor shows new art within about 5 minutes (manifest cache).`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
