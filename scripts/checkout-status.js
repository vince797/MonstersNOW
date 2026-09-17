const checkoutSessionId = new URLSearchParams(window.location.search).get("session_id");
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
  document.querySelector("#checkout-success-title").textContent = "Check your payment confirmation.";
}
