'use strict';
// Defense in depth if an API function is invoked without routing middleware.
const { handlePreviewRequest, blockedResponse } = require('./review-preview-handler');
const { readJsonBody } = require('./http');
async function guardReviewPreview(request, response) {
  const environment = process.env.VERCEL_ENV;
  if (environment !== 'preview' && !(process.env.VERCEL && !['production', 'development'].includes(environment))) return false;
  let result;
  try {
    const url = new URL(request.url || '/api/unknown', 'https://synthetic-review.invalid');
    for (const [key, value] of Object.entries(request.query || {})) if (!url.searchParams.has(key)) url.searchParams.set(key, Array.isArray(value) ? value[0] : String(value));
    const isProof = url.pathname.replace(/\.js$/, '') === '/api/halloween-proof' || url.pathname.replace(/\.js$/, '') === '/api/storybook-interest' && url.searchParams.get('resource') === 'halloween-proof';
    const method = String(request.method || 'GET').toUpperCase();
    const body = isProof && method === 'POST' ? JSON.stringify(await readJsonBody(request, { maxBytes: 3 * 1024 * 1024 })) : undefined;
    result = await handlePreviewRequest(new Request(url, { method, ...(body ? { body, headers: { 'Content-Type':'application/json' } } : {}) }));
  } catch { result = blockedResponse('The synthetic review fixture could not be loaded.', 503); }
  for (const [key, value] of result.headers) response.setHeader(key, value);
  response.status(result.status).json(await result.json());
  return true;
}
module.exports = { guardReviewPreview };
