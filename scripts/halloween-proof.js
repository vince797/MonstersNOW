const proofStorageKey = "monstersnow_halloween_test_proof";
const proofStatus = document.querySelector("#proof-status");
const proofCheckout = document.querySelector("#proof-checkout");
let savedProof;
try {
  savedProof = JSON.parse(sessionStorage.getItem(proofStorageKey));
  if (!savedProof?.proof?.pages || savedProof.proof.pages.length !== 32) throw new Error("Missing proof");
  const testMode = savedProof.submission?.testMode === true;
  document.querySelector("#proof-mode-message").textContent = testMode
    ? "This checkout is in test mode: no real payment, shipping, or print order occurs. Your proof is saved in this browser tab until checkout; keep a PDF if you want a copy."
    : "Review only. Paid checkout and printing remain closed until final artwork and both Lulu files have passed approval.";
  document.querySelector("#proof-approval-copy").textContent = testMode
    ? "I reviewed the names, selected monster, and all 32 pages. I approve this review copy for test checkout."
    : "I reviewed the names, selected monster, and all 32 pages and want to continue to secure checkout.";
  proofCheckout.querySelector("button").textContent = testMode ? "Continue to Stripe test checkout" : "Continue to secure checkout";
  if (savedProof.proof.rendererVersion !== "layered-review-v1" || !savedProof.proof.pages.every((page) => Array.isArray(page.layers))) {
    throw new Error("This saved proof predates the layered review. Build a new proof.");
  }
  window.MonstersNOWPageCompositor.renderReviewBook(document.querySelector("#proof-pages"), savedProof.proof);
  const notice = document.querySelector("#proof-composition-notice");
  const summary = document.createElement("strong");
  summary.textContent = `${savedProof.proof.childCharacter.label} · ${savedProof.proof.format === "hardcover" ? "Hardcover" : "Softcover"} · ${savedProof.proof.rendererVersion}`;
  const list = document.createElement("ul");
  for (const warning of savedProof.proof.warnings || []) { const li = document.createElement("li"); li.textContent = warning; list.append(li); }
  notice.replaceChildren(summary, list);
  // Sample review artwork can never enter live payment. Test checkout remains explicit.
  proofCheckout.hidden = !testMode;

} catch (error) {
  proofCheckout.hidden = true;
  proofStatus.textContent = "No book proof is saved in this tab. Return to Create, choose your monster, and build a new proof.";
}
document.querySelector("#print-proof").addEventListener("click", () => window.print());
proofCheckout.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#checkout-status");
  const button = proofCheckout.querySelector("button");
  button.disabled = true;
  const testMode = savedProof.submission?.testMode === true;
  if (!testMode) { status.textContent = "Paid checkout is closed for this review copy."; button.disabled = false; return; }
  status.textContent = testMode ? "Opening test checkout…" : "Opening secure checkout…";
  try {
    const response = await fetch(testMode ? "/api/halloween-test-checkout" : "/api/storybook-checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedProof.submission, proofToken: savedProof.proofToken, proofApproved: document.querySelector("#proof-approved").checked }),
    });
    const result = await response.json();
    if (!response.ok || !result.checkoutUrl) throw new Error(result.error || "Checkout could not start.");
    window.location.assign(result.checkoutUrl);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
