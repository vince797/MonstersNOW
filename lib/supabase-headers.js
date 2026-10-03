'use strict';
// Opaque Supabase keys are API keys, not JWT bearer tokens. Legacy service-role
// JWTs retain their existing Authorization header. Never log either value.
function supabaseAuthHeaders(key, extra = {}) {
  return { apikey: key, ...(/^sb_(?:secret|publishable)_/.test(key) ? {} : { Authorization: `Bearer ${key}` }), ...extra };
}
module.exports = { supabaseAuthHeaders };
