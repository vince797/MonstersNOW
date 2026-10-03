function shouldLogAdminDataError(error) {
  return error?.code !== "invalid_admin_password";
}

function adminDataErrorContext(error, request, resource) {
  return {
    method: request?.method || "UNKNOWN",
    resource: resource || "stories",
    status: error?.status || 500,
    code: error?.code || "admin_story_failed",
    service: error?.service || null,
    message: error?.message || "Story request failed.",
  };
}

module.exports = { adminDataErrorContext, shouldLogAdminDataError };
