const checkoutQuery = new URLSearchParams(window.location.search);
const checkoutFragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const checkoutSessionId = checkoutFragment.get("session_id") || checkoutQuery.get("session_id");
const orderTokenFromUrl = checkoutFragment.get("order_token") || checkoutQuery.get("order_token");
if (orderTokenFromUrl) {
  try { sessionStorage.setItem("monstersnow_order_access", orderTokenFromUrl); } catch {}
  const orderLink = document.querySelector("#view-order-status");
  orderLink.href = `order.html#token=${encodeURIComponent(orderTokenFromUrl)}`;
  orderLink.hidden = false;
  history.replaceState({}, "", window.location.pathname);
}
if (checkoutSessionId?.startsWith("cs_test_")) {
  const title = document.querySelector("#checkout-success-title");
  const message = document.querySelector("#checkout-confirmation-message");
  title.textContent = "Checking your test checkout…";
  message.textContent = "No physical book will be printed or shipped.";
  fetch(`/api/halloween-checkout-status?session_id=${encodeURIComponent(checkoutSessionId)}`, { cache: "no-store" })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error("Could not verify payment");
      title.textContent = result.paymentStatus === "paid" ? "Your test checkout is complete." : "Your test payment is not confirmed yet.";
      message.textContent = "This was a Stripe test order. No real payment, shipping, or Lulu print order occurred. Keep your saved layout proof for review.";
    })
    .catch(() => {
      title.textContent = "We couldn’t verify this test checkout.";
      message.textContent = "Check the test session in Stripe before treating the order as paid. No print order was submitted.";
    });
} else {
  const title = document.querySelector("#checkout-success-title");
  const message = document.querySelector("#checkout-confirmation-message");
  title.textContent = "Checking your order…";
  if (!orderTokenFromUrl) {
    title.textContent = "Check your payment confirmation.";
  } else {
    fetch("/api/customer-order", { headers: { Authorization: `Bearer ${orderTokenFromUrl}` }, cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result.order; })
      .then((order) => {
        title.textContent = order.status === "paid" || order.paidAt ? "Payment confirmed. Your book is next." : "Your checkout was received.";
        message.textContent = order.status === "paid" || order.paidAt
          ? "We’ll prepare a private cover-and-interior proof for your approval before anything goes to print."
          : "Stripe confirmation can take a moment. Your private order page will update automatically after payment is verified.";
      })
      .catch(() => { title.textContent = "Your checkout was received."; message.textContent = "Use your private order link to check payment and proof status."; });
  }
}
