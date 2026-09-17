const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const { buildHalloweenProof, signProof } = require("../lib/halloween-proof");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return rejectUnsupportedMethod(request, response, ["POST"]);
  try {
    const proof = buildHalloweenProof(await readJsonBody(request));
    return sendJson(response, 200, { proof, proofToken: signProof(proof) });
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.status ? error.message : "Could not build the book proof." });
  }
};
