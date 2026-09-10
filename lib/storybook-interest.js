const { randomUUID } = require("node:crypto");
const {
  getStorybookProductVariant,
} = require("./lulu-products");
const {
  getMonsterStyleLabel,
  normalizeMonsterStyleId,
} = require("./monster-style");

const RESEND_EMAIL_API_URL = "https://api.resend.com/emails";
const DEFAULT_HALLOWEEN_STORY_ID = "halloween-monster-night";
const DEFAULT_HALLOWEEN_STORY_LABEL = "Halloween Monster Night";
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_FIELD_LENGTH = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildStorybookInterestSubmission(payload = {}) {
  const email = normalizeEmail(payload.email);
  const variant = normalizeStorybookFormat(payload.format || payload.coverType || payload.cover_type);
  const style = normalizeMonsterStyleId(payload.style);
  const submittedAt = new Date().toISOString();
  const warnings = [];
  const previewAttachment = normalizePreviewAttachment(payload.monsterImage, warnings);

  return {
    submissionId: normalizeShortText(payload.submissionId, 120) || randomUUID(),
    submittedAt,
    source: normalizeShortText(payload.source, 80) || "create-form",
    email,
    format: {
      id: variant.id,
      label: variant.label,
      priceDisplay: variant.priceDisplay,
    },
    story: {
      id: DEFAULT_HALLOWEEN_STORY_ID,
      label: DEFAULT_HALLOWEEN_STORY_LABEL,
    },
    style,
    styleLabel: getMonsterStyleLabel(style),
    selectedPreviewId: normalizeShortText(payload.selectedPreviewId, 160) || null,
    featurePermission: normalizeFeaturePermission(payload.featurePermission),
    previewAttachment,
    warnings,
  };
}

function normalizeStorybookFormat(value) {
  try {
    return getStorybookProductVariant(value);
  } catch (error) {
    throw createStorybookInterestError(error.message || "Choose a valid storybook format.", {
      code: "invalid_storybook_format",
      status: 400,
    });
  }
}

async function sendStorybookInterestEmail(submission) {
  const config = getStorybookInterestEmailConfig();
  const emailPayload = buildStorybookInterestEmailPayload(submission, config);

  const apiResponse = await fetch(RESEND_EMAIL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": submission.submissionId,
    },
    body: JSON.stringify(emailPayload),
  });
  const body = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok) {
    throw createStorybookInterestError(getResendErrorMessage(body), {
      code: getResendErrorCode(body),
      status: apiResponse.status,
      service: "resend",
    });
  }

  return {
    emailId: body.id || null,
  };
}

function getStorybookInterestEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.STORYBOOK_INTEREST_FROM_EMAIL || "";
  const to = parseEmailList(process.env.STORYBOOK_INTEREST_TO_EMAIL || "");
  const missing = [];

  if (!apiKey) {
    missing.push("RESEND_API_KEY");
  }

  if (!from) {
    missing.push("STORYBOOK_INTEREST_FROM_EMAIL");
  }

  if (to.length === 0) {
    missing.push("STORYBOOK_INTEREST_TO_EMAIL");
  }

  if (missing.length > 0) {
    throw createStorybookInterestError("Storybook interest email is not configured.", {
      code: "storybook_interest_email_not_configured",
      status: 503,
      missing,
    });
  }

  return {
    apiKey,
    from,
    to,
  };
}

function buildStorybookInterestEmailPayload(submission, config) {
  const attachments = submission.previewAttachment
    ? [
        {
          filename: submission.previewAttachment.filename,
          content: submission.previewAttachment.content,
        },
      ]
    : [];

  return {
    from: config.from,
    to: config.to,
    reply_to: submission.email,
    subject: `${submission.story.label} request - ${submission.format.label}`,
    html: renderStorybookInterestHtml(submission),
    text: renderStorybookInterestText(submission),
    attachments,
    tags: [
      { name: "source", value: "create_form" },
      { name: "story", value: "halloween" },
    ],
  };
}

function renderStorybookInterestText(submission) {
  const permission = submission.featurePermission;

  return [
    `${submission.story.label} request`,
    "",
    `Submission ID: ${submission.submissionId}`,
    `Submitted at: ${submission.submittedAt}`,
    `Parent email: ${submission.email}`,
    `Format: ${submission.format.label} (${submission.format.priceDisplay})`,
    `Monster style: ${submission.styleLabel}`,
    `Selected preview ID: ${submission.selectedPreviewId || "Not provided"}`,
    "",
    "Feature permission",
    `Feature finished monster: ${permission.canFeatureMonster ? "Yes" : "No"}`,
    `Feature original drawing: ${permission.canFeatureDrawing ? "Yes" : "No"}`,
    `Display name: ${permission.displayName || "Not provided"}`,
    `Consent recorded at: ${permission.consentRecordedAt || "Not provided"}`,
    "",
    submission.previewAttachment ? "Selected monster preview is attached." : "No monster preview attachment was included.",
    submission.warnings.length ? `Warnings: ${submission.warnings.join("; ")}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function renderStorybookInterestHtml(submission) {
  const permission = submission.featurePermission;
  const rows = [
    ["Submission ID", submission.submissionId],
    ["Submitted at", submission.submittedAt],
    ["Parent email", submission.email],
    ["Story", submission.story.label],
    ["Format", `${submission.format.label} (${submission.format.priceDisplay})`],
    ["Monster style", submission.styleLabel],
    ["Selected preview ID", submission.selectedPreviewId || "Not provided"],
    ["Feature finished monster", permission.canFeatureMonster ? "Yes" : "No"],
    ["Feature original drawing", permission.canFeatureDrawing ? "Yes" : "No"],
    ["Display name", permission.displayName || "Not provided"],
    ["Consent recorded at", permission.consentRecordedAt || "Not provided"],
    ["Preview attachment", submission.previewAttachment ? "Included" : "Not included"],
  ];

  if (submission.warnings.length > 0) {
    rows.push(["Warnings", submission.warnings.join("; ")]);
  }

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<body>",
    `<h1>${escapeHtml(submission.story.label)} request</h1>`,
    "<table>",
    rows
      .map(
        ([label, value]) =>
          `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
      )
      .join(""),
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw createStorybookInterestError("Enter a valid email for storybook updates.", {
      code: "invalid_email",
      status: 400,
    });
  }

  return email;
}

function normalizeFeaturePermission(value = {}) {
  const canFeatureMonster = Boolean(value.canFeatureMonster);
  const canFeatureDrawing = canFeatureMonster && Boolean(value.canFeatureDrawing);

  return {
    canFeatureMonster,
    canFeatureDrawing,
    displayName: canFeatureMonster ? normalizeShortText(value.displayName, 40) : "",
    consentRecordedAt: canFeatureMonster ? normalizeShortText(value.consentRecordedAt, 80) : null,
  };
}

function normalizePreviewAttachment(value, warnings) {
  if (typeof value !== "string" || !value.trim()) {
    warnings.push("No selected monster image was submitted.");
    return null;
  }

  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    warnings.push("Selected monster image was not a supported data URL.");
    return null;
  }

  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const base64 = match[2];
  const byteLength = Buffer.byteLength(base64, "base64");

  if (byteLength > MAX_ATTACHMENT_BYTES) {
    warnings.push("Selected monster image was too large to attach.");
    return null;
  }

  return {
    filename: `monstersnow-${DEFAULT_HALLOWEEN_STORY_ID}.${getImageExtension(mimeType)}`,
    content: base64,
  };
}

function normalizeShortText(value, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseEmailList(value) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function getResendErrorMessage(body) {
  if (typeof body?.message === "string") {
    return body.message;
  }

  if (typeof body?.error === "string") {
    return body.error;
  }

  if (typeof body?.error?.message === "string") {
    return body.error.message;
  }

  return "Storybook interest email could not be sent.";
}

function getResendErrorCode(body) {
  if (typeof body?.name === "string") {
    return body.name;
  }

  if (typeof body?.code === "string") {
    return body.code;
  }

  if (typeof body?.error?.name === "string") {
    return body.error.name;
  }

  if (typeof body?.error?.code === "string") {
    return body.error.code;
  }

  return "resend_email_failed";
}

function getImageExtension(mimeType) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createStorybookInterestError(message, details = {}) {
  const error = new Error(message);

  error.name = "StorybookInterestError";
  Object.assign(error, details);

  return error;
}

function storybookInterestErrorToResponse(error) {
  if (error.name !== "StorybookInterestError") {
    return {
      status: 500,
      payload: {
        code: "storybook_interest_failed",
        error: "Storybook interest could not be submitted.",
      },
    };
  }

  return {
    status: error.status || 500,
    payload: {
      code: error.code || "storybook_interest_failed",
      error: error.status === 503 ? "Storybook interest email is not configured yet." : error.message,
      missing: error.missing,
    },
  };
}

module.exports = {
  buildStorybookInterestSubmission,
  sendStorybookInterestEmail,
  storybookInterestErrorToResponse,
};
