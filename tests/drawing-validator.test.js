const test = require("node:test");
const assert = require("node:assert/strict");
const { validateMonsterDrawing } = require("../lib/drawing-validator");

const drawing = "data:image/png;base64,iVBORw0KGgo=";

function response(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "request-id" },
    json: async () => ({ output_text: JSON.stringify(result) }),
  };
}

function rawResponse(result) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "request-id" },
    json: async () => ({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
    }),
  };
}

test("drawing validator accepts clear handmade monster artwork", async () => {
  const calls = [];
  const result = await validateMonsterDrawing(drawing, {
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return rawResponse({ accepted: true, reason: "A hand-drawn creature fills the image." });
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(calls.length, 1);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.store, false);
  assert.equal(request.input[0].content[1].image_url, drawing);
});

test("drawing validator rejects unrelated room photos before generation", async () => {
  await assert.rejects(
    validateMonsterDrawing(drawing, {
      apiKey: "test-key",
      fetchImpl: async () => response({ accepted: false, reason: "The image is a bedroom with no visible drawing." }),
    }),
    (error) => error.code === "monster_drawing_not_found" && error.status === 422,
  );
});

test("drawing validator fails closed when the image check is unavailable", async () => {
  await assert.rejects(
    validateMonsterDrawing(drawing, {
      apiKey: "test-key",
      fetchImpl: async () => response({}, 500),
    }),
    (error) => error.code === "drawing_validation_unavailable" && error.status === 502,
  );
});
