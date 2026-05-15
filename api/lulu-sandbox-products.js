const {
  getStorybookPricingSummary,
  getStorybookProductVariants,
} = require("../lib/lulu-products");
const { rejectUnsupportedMethod, sendJson } = require("../lib/http");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    return rejectUnsupportedMethod(request, response, ["GET"]);
  }

  return sendJson(response, 200, {
    pricing: getStorybookPricingSummary(),
    products: getStorybookProductVariants(),
  });
};
