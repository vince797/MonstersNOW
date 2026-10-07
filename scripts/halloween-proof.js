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
    : "Continue only when the names and selected monster are correct. Stripe will collect payment and the shipping address securely.";
  document.querySelector("#proof-approval-copy").textContent = testMode
    ? "I reviewed the names, child profile, selected monster, and all 32 pages. I approve this review copy for test checkout."
    : "I reviewed the names, child profile, selected monster, and all 32 pages and want to continue to secure checkout.";
  proofCheckout.querySelector("button").textContent = testMode ? "Continue to Stripe test checkout" : "Continue to secure checkout";
  const childProfile = savedProof.proof.childCharacter;
  if (childProfile?.included) {
    const profileSection = document.querySelector("#proof-child-profile");
    document.querySelector("#proof-child-profile-title").textContent = childProfile.label;
    const customDetails = childProfile.id === "custom" ? [
      childProfile.presentationLabel,
      childProfile.skinToneLabel,
      `${childProfile.hairColorLabel} ${childProfile.hairStyleLabel}`,
      `${childProfile.eyeColorLabel} eyes`,
      `${childProfile.outfitColorLabel} ${childProfile.outfitStyleLabel}`,
    ] : [];
    document.querySelector("#proof-child-profile-copy").textContent = [
      ...customDetails,
      childProfile.ageBandLabel,
      childProfile.relativeHeightLabel,
      childProfile.mobilityAid !== "none" ? childProfile.mobilityAidLabel : "",
      "Custom character settings saved with this proof.",
    ].filter(Boolean).join(" · ");
    window.MonstersNowChildSelector?.renderProfile(
      document.querySelector("#proof-child-preview-stage"),
      document.querySelector("#proof-child-preview-avatar"),
      childProfile,
    );
    profileSection.hidden = false;
  }
  for (const page of savedProof.proof.pages) {
    const article = document.createElement("article");
    article.className = "book-proof-page";
    const title = document.createElement("h2");
    title.textContent = page.title;
    article.append(title);
    if (page.art) {
      const image = document.createElement("img");
      image.src = savedProof.proof.monsterImage;
      image.alt = savedProof.proof.monsterName;
      article.append(image);
    }
    const text = document.createElement("p");
    text.textContent = page.text;
    const number = document.createElement("span");
    number.className = "proof-page-number";
    number.textContent = `${page.number} · Layout proof — not for print production`;
    article.append(text, number);
    document.querySelector("#proof-pages").append(article);
  }
  proofCheckout.hidden = false;
  const fitProofPages = () => {
    for (const article of document.querySelectorAll(".book-proof-page")) {
      article.style.minHeight = "";
      const text = article.querySelector("p");
      text.style.fontSize = "";
      if (window.innerWidth > 650) {
        let size = Number.parseFloat(getComputedStyle(text).fontSize);
        while (article.scrollHeight > article.clientHeight + 2 && size > 12) {
          size -= 0.5;
          text.style.fontSize = `${size}px`;
        }
        // Never clip a long name or paragraph just to preserve a square on
        // screen. The print stylesheet restores physical page dimensions.
        if (article.scrollHeight > article.clientHeight + 2) article.style.minHeight = `${article.scrollHeight + 24}px`;
      }
    }
  };
  fitProofPages();
  window.addEventListener("resize", fitProofPages);
} catch {
  proofStatus.textContent = "No book proof is saved in this tab. Return to Create, choose your monster, and build a new proof.";
}
document.querySelector("#print-proof").addEventListener("click", () => window.print());
proofCheckout.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#checkout-status");
  const button = proofCheckout.querySelector("button");
  button.disabled = true;
  const testMode = savedProof.submission?.testMode === true;
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
