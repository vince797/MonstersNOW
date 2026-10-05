const assert = require("node:assert/strict");
const test = require("node:test");
const { isOpaqueSupabaseKey, supabaseKeyHeaders } = require("../lib/supabase-headers");

test("opaque Supabase keys use only the apikey header", () => {
  const headers = supabaseKeyHeaders("sb_secret_example", { "Content-Type": "application/json" });
  assert.equal(isOpaqueSupabaseKey("sb_secret_example"), true);
  assert.equal(headers.apikey, "sb_secret_example");
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers["Content-Type"], "application/json");
});

test("legacy JWT service-role keys keep the bearer header", () => {
  const headers = supabaseKeyHeaders("eyJlegacy-service-role");
  assert.equal(isOpaqueSupabaseKey("eyJlegacy-service-role"), false);
  assert.equal(headers.apikey, "eyJlegacy-service-role");
  assert.equal(headers.Authorization, "Bearer eyJlegacy-service-role");
});
