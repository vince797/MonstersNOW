const assert = require("node:assert/strict");
const test = require("node:test");
const { adminDataErrorContext, shouldLogAdminDataError } = require("../lib/admin-errors");
const { listStories } = require("../lib/story-library");
const handler = require("../api/storybook-interest");

test("downstream Supabase authentication failures are returned and safely logged", async () => {
  const originalFetch = global.fetch;
  const previousEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };

  process.env.SUPABASE_URL = "https://database.example.com";
  process.env.SUPABASE_SECRET_KEY = "server-secret-never-logged";
  process.env.ADMIN_PASSWORD = "admin-test-password";
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ code: "PGRST301", message: "JWT issued at future" }),
  });

  try {
    await assert.rejects(listStories(), (error) => {
      assert.equal(shouldLogAdminDataError(error), true);
      const context = adminDataErrorContext(error, { method: "GET" }, "stories");
      assert.deepEqual(context, {
        method: "GET",
        resource: "stories",
        status: 401,
        code: "PGRST301",
        service: "supabase",
        message: "JWT issued at future",
      });
      assert.doesNotMatch(JSON.stringify(context), /server-secret-never-logged/);
      return true;
    });

    assert.equal(shouldLogAdminDataError({ code: "invalid_admin_password" }), false);

    const response = {
      body: null,
      statusCode: null,
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await handler({ method: "GET", query: {}, url: "/api/storybook-interest", headers: { "x-admin-password": "admin-test-password" } }, response);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, "PGRST301");
    assert.equal(response.body.error, "JWT issued at future");
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
