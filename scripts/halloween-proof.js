const proofStorageKey = "monstersnow_halloween_test_proof";
const proofStatus = document.querySelector("#proof-status");
const proofCheckout = document.querySelector("#proof-checkout");
let savedProof;
try {
  savedProof = JSON.parse(sessionStorage.getItem(proofStorageKey));
  if (!savedProof?.proof?.pages || savedProof.proof.pages.length !== 32) throw new Error("Missing proof");
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
  status.textContent = "Opening test checkout…";
  try {
    const response = await fetch("/api/halloween-test-checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedProof.submission, proofToken: savedProof.proofToken, proofApproved: document.querySelector("#proof-approved").checked }),
    });
    const result = await response.json();
    if (!response.ok || !result.checkoutUrl) throw new Error(result.error || "Test checkout could not start.");
    window.location.assign(result.checkoutUrl);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
