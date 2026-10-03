// Review previews never reach production API handlers. Keep this global so API
// aliases, extensions, and future endpoints also fail closed before rewrites.
import preview from './lib/review-preview-handler.js';
export const config = { runtime: 'nodejs' };
export default async function middleware(request: Request) {
  if (['production', 'development'].includes(process.env.VERCEL_ENV || '')) return;
  const rawPath = new URL(request.url).pathname;
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname).replace(/\\/g, '/').replace(/\/+/g, '/'); }
  catch { return preview.blockedResponse(); }
  if (!/^\/api(?:\/|$)/i.test(pathname)) return;
  if (pathname !== rawPath) return preview.blockedResponse();
  // No fall-through, including after a fixture exception. Credentials are never
  // consulted; the same behavior applies even when real service keys are set.
  try { return await preview.handlePreviewRequest(request, pathname); }
  catch { return preview.blockedResponse('The synthetic review fixture could not be loaded.', 503); }
}
