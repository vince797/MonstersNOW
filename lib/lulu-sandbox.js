const crypto = require("node:crypto");

const SANDBOX_BASE_URL = "https://api.sandbox.lulu.com";
const TOKEN_PATH = "/auth/realms/glasstree/protocol/openid-connect/token";
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

let tokenCache;

class LuluConfigError extends Error {
  constructor(message, missing = []) {
    super(message);
    this.name = "LuluConfigError";
    this.missing = missing;
  }
}

class LuluApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "LuluApiError";
    this.status = status;
    this.details = details;
  }
}

function getSandboxConfig() {
  const baseUrl = stripTrailingSlash(
    process.env.LULU_SANDBOX_API_BASE_URL || SANDBOX_BASE_URL,
  );

  if (!isSandboxBaseUrl(baseUrl)) {
    throw new LuluConfigError("Lulu sandbox routes must point at api.sandbox.lulu.com.");
  }

  return {
    baseUrl,
    clientKey: process.env.LULU_SANDBOX_CLIENT_KEY || "",
    clientSecret: process.env.LULU_SANDBOX_CLIENT_SECRET || "",
    contactEmail: process.env.LULU_SANDBOX_CONTACT_EMAIL || "",
    endpointSecret: process.env.LULU_SANDBOX_ENDPOINT_SECRET || "",
  };
}

function getSafeSandboxConfig() {
  const config = getSandboxConfig();

  return {
    baseUrl: config.baseUrl,
    hasClientKey: Boolean(config.clientKey),
    hasClientSecret: Boolean(config.clientSecret),
    hasContactEmail: Boolean(config.contactEmail),
    protectsWriteEndpoints: Boolean(config.endpointSecret),
  };
}

function assertSandboxCredentials(config = getSandboxConfig()) {
  const missing = [];

  if (!config.clientKey) {
    missing.push("LULU_SANDBOX_CLIENT_KEY");
  }

  if (!config.clientSecret) {
    missing.push("LULU_SANDBOX_CLIENT_SECRET");
  }

  if (missing.length > 0) {
    throw new LuluConfigError("Lulu sandbox credentials are not configured.", missing);
  }
}

function assertSandboxEndpointSecret(request, { required = false } = {}) {
  const expectedSecret = process.env.LULU_SANDBOX_ENDPOINT_SECRET || "";

  if (!expectedSecret && !required) {
    return;
  }

  if (!expectedSecret && required) {
    throw new LuluConfigError("LULU_SANDBOX_ENDPOINT_SECRET must be configured for this endpoint.", [
      "LULU_SANDBOX_ENDPOINT_SECRET",
    ]);
  }

  const receivedSecret = getHeader(request, "x-lulu-sandbox-secret");

  if (!safeEquals(receivedSecret, expectedSecret)) {
    const error = new Error("Invalid Lulu sandbox endpoint secret.");
    error.name = "LuluAuthError";
    error.status = 403;
    throw error;
  }
}

async function getSandboxAccessToken() {
  const config = getSandboxConfig();
  assertSandboxCredentials(config);

  if (tokenCache && tokenCache.cacheKey === getCacheKey(config) && Date.now() < tokenCache.expiresAt) {
    return {
      accessToken: tokenCache.accessToken,
      expiresAt: tokenCache.expiresAt,
      expiresIn: Math.max(0, Math.floor((tokenCache.expiresAt - Date.now()) / 1000)),
      tokenType: tokenCache.tokenType,
    };
  }

  const response = await fetch(`${config.baseUrl}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientKey}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  const body = await parseResponseBody(response);

  if (!response.ok || !body.access_token) {
    throw new LuluApiError(
      "Lulu sandbox token request failed.",
      response.status,
      normalizeErrorDetails(body),
    );
  }

  const expiresIn = Number.parseInt(body.expires_in, 10) || 3600;
  const expiresAt = Date.now() + expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS;
  const tokenType = body.token_type || "bearer";

  tokenCache = {
    accessToken: body.access_token,
    cacheKey: getCacheKey(config),
    expiresAt,
    tokenType,
  };

  return {
    accessToken: body.access_token,
    expiresAt,
    expiresIn,
    tokenType,
  };
}

async function luluSandboxRequest(path, options = {}) {
  const config = getSandboxConfig();
  const token = await getSandboxAccessToken();
  const url = new URL(path, config.baseUrl);

  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new LuluApiError(
      `Lulu sandbox request failed: ${options.method || "GET"} ${path}`,
      response.status,
      normalizeErrorDetails(body),
    );
  }

  return {
    data: body,
    status: response.status,
  };
}

function luluErrorToResponse(error) {
  if (error instanceof LuluConfigError) {
    return {
      status: 500,
      payload: {
        error: error.message,
        missing: error.missing,
      },
    };
  }

  if (error instanceof LuluApiError) {
    return {
      status: error.status || 502,
      payload: {
        error: error.message,
        luluStatus: error.status,
        details: error.details,
      },
    };
  }

  if (error.name === "LuluAuthError") {
    return {
      status: error.status || 403,
      payload: {
        error: error.message,
      },
    };
  }

  return {
    status: 500,
    payload: {
      error: "Lulu sandbox integration failed.",
    },
  };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isSandboxBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.sandbox.lulu.com";
  } catch {
    return false;
  }
}

function getCacheKey(config) {
  return `${config.baseUrl}:${config.clientKey}`;
}

function getHeader(request, name) {
  if (request.headers?.get) {
    return request.headers.get(name) || "";
  }

  return request.headers?.[name.toLowerCase()] || "";
}

function safeEquals(received, expected) {
  if (!received || !expected) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function parseResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeErrorDetails(body) {
  if (!body) {
    return null;
  }

  if (typeof body === "string") {
    return body.slice(0, 1000);
  }

  return body;
}

module.exports = {
  assertSandboxEndpointSecret,
  getSafeSandboxConfig,
  getSandboxAccessToken,
  getSandboxConfig,
  luluErrorToResponse,
  luluSandboxRequest,
};
