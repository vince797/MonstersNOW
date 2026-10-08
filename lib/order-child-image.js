const { requireSubmission, saveCheckoutChildImage } = require("./monster-submissions");
const { createPrintChildImage } = require("./child-renders");

const PRINT_MASTER_TIMEOUT_MS = 25 * 1000;

/**
 * Stores the child image for a new order and returns its private path.
 *
 * Prefers the 2x print master made from the stored lossless render named in
 * the signed proof (proof.childRenderId), after re-checking the monster
 * submission token. Falls back to the approved display image (the previous
 * behavior) if the stored render is unavailable, so checkout never fails
 * because of it.
 */
async function saveOrderChildImage(submission, proof, body = {}, { timeoutMs = PRINT_MASTER_TIMEOUT_MS } = {}) {
  if (proof.childRenderId && submission.monsterSubmissionId && typeof body.monsterSubmissionToken === "string") {
    try {
      await requireSubmission(submission.monsterSubmissionId, body.monsterSubmissionToken);
      return await withTimeout(createPrintChildImage({ submissionId: submission.monsterSubmissionId, renderId: proof.childRenderId }), timeoutMs);
    } catch (error) {
      console.warn("Print child master unavailable; storing the approved display image instead.", { code: error.code, message: error.message });
    }
  }
  return saveCheckoutChildImage({ submissionId: submission.submissionId, monsterSubmissionId: submission.monsterSubmissionId, childImage: proof.childImage });
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Print master timed out."), { code: "print_master_timeout" })), ms); }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = { saveOrderChildImage };
