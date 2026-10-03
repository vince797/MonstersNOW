const assert = require("node:assert/strict");
const test = require("node:test");
const { adminDataErrorContext, shouldLogAdminDataError } = require("../lib/admin-errors");
const { listStories } = require("../lib/story-library");

test("downstream Supabase authentication failures are returned and safely logged", async () => {
  const originalFetch = global.fetch;
  const previousEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };

  process.env.SUPABASE_URL = "https://database.example.com";
  process.env.SUPABASE_SECRET_KEY = "server-secret-never-logged";
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
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
