function isOpaqueSupabaseKey(key) {
  return /^sb_(?:secret|publishable)_/.test(String(key || ""));
}

function supabaseKeyHeaders(key, extra = {}) {
  return {
    apikey: key,
    ...(isOpaqueSupabaseKey(key) ? {} : { Authorization: `Bearer ${key}` }),
    ...extra,
  };
}

module.exports = { isOpaqueSupabaseKey, supabaseKeyHeaders };
