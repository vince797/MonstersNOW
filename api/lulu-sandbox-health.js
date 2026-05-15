const {
  assertSandboxEndpointSecret,
  getSafeSandboxConfig,
  getSandboxAccessToken,
  luluErrorToResponse,
  luluSandboxRequest,
} = require("../lib/lulu-sandbox");
const { rejectUnsupportedMethod, sendJson } = require("../lib/http");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    return rejectUnsupportedMethod(request, response, ["GET"]);
  }

  try {
    assertSandboxEndpointSecret(request);

    const config = getSafeSandboxConfig();

    if (!config.hasClientKey || !config.hasClientSecret) {
      return sendJson(response, 200, {
        mode: "sandbox",
        configured: false,
        config,
        missing: [
          !config.hasClientKey ? "LULU_SANDBOX_CLIENT_KEY" : null,
          !config.hasClientSecret ? "LULU_SANDBOX_CLIENT_SECRET" : null,
        ].filter(Boolean),
      });
    }

    const token = await getSandboxAccessToken();
    const printJobs = await luluSandboxRequest("/print-jobs/", {
      query: {
        exclude_line_items: true,
        page_size: 1,
      },
    });

    return sendJson(response, 200, {
      mode: "sandbox",
      configured: true,
      config,
      authenticated: true,
      token: {
        expiresIn: token.expiresIn,
        tokenType: token.tokenType,
      },
      printJobs: {
        reachable: true,
        count: printJobs.data?.count ?? null,
      },
    });
  } catch (error) {
    const { status, payload } = luluErrorToResponse(error);
    return sendJson(response, status, payload);
  }
};
