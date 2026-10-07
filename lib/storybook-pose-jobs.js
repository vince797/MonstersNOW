const crypto = require("node:crypto");
const { listStories, supabaseRequest } = require("./story-library");
const { createSignedUrl, deletePrivateImages, parseImage, uploadPrivateImage } = require("./monster-submissions");
const { inspectPngTransparency } = require("./png-transparency");
const { buildStorybookPosePlan, evaluatePoseJobReadiness, MAX_GENERATION_ATTEMPTS_PER_ASSET } = require("./storybook-pose-plan");
const { loadChildArtwork } = require("./child-artwork");
const { HALLOWEEN_BLUEPRINT_VERSION, isHalloweenStory } = require("./halloween-pose-blueprint");

// GPT Image 1.5 low 1024x1024 output is currently $0.009, before image/text
// input tokens. Reserve 3 cents per edit so the per-job cap remains useful
// even though the provider does not return a final dollar charge per request.
const BUDGETED_COST_CENTS_PER_ASSET = 3;

async function createPoseJob(payload = {}) {
  const submissionId = requireUuid(payload.submissionId, "saved monster");
  const selectedPreviewId = requireUuid(payload.selectedPreviewId, "approved monster portrait");
  const submissions = await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(submissionId)}&select=*`);
  const submission = submissions[0];
  if (!submission || submission.selected_preview_id !== selectedPreviewId) throw poseJobError("Save the exact approved monster portrait before creating its pose plan.", 409, "pose_source_not_selected");
  const previews = await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(selectedPreviewId)}&submission_id=eq.${encodeURIComponent(submissionId)}&status=eq.complete&select=*`);
  if (!previews[0]?.preview_path) throw poseJobError("The approved portrait file is unavailable.", 409, "pose_source_unavailable");
  const stories = await listStories();
  const storyKey = payload.storyId || submission.story_id;
  const story = stories.find((item) => item.id === storyKey || item.slug === storyKey);
  if (!story) throw poseJobError("Choose a saved 32-page story for this pose plan.", 400, "pose_story_missing");
  const childCharacter = payload.childCharacter || await latestChildCharacter(submissionId, story.id, story.slug);
  const plan = buildStorybookPosePlan(story, {
    selectedPreviewId,
    childCharacter,
    monsterIdentity: payload.monsterIdentity,
    scaleContract: payload.scaleContract,
    costCapCents: payload.costCapCents,
  });
  const childProfileKey = plan.identityContract.child.included ? plan.identityContract.child.profileKey : null;
  const childAnchor = plan.identityContract.child.included
    ? loadChildArtwork({
        id: plan.identityContract.child.appearanceId,
        included: true,
        ageBand: plan.identityContract.child.ageBand,
        mobilityAid: plan.identityContract.child.mobilityAid,
      })
    : null;
  const childProfileFilter = childProfileKey
    ? `&child_profile_key=eq.${encodeURIComponent(childProfileKey)}`
    : "&child_profile_key=is.null";
  const existing = await supabaseRequest(
    `/storybook_pose_jobs?submission_id=eq.${encodeURIComponent(submissionId)}&source_preview_id=eq.${encodeURIComponent(selectedPreviewId)}&story_id=eq.${encodeURIComponent(story.id)}&story_version=eq.${plan.storyVersion}${childProfileFilter}&status=not.eq.invalidated&select=*&limit=1`,
  );
  if (existing[0] && posePlansCompatible(existing[0].pose_plan, plan)) return getPoseJob(existing[0].id);

  const id = crypto.randomUUID();
  const childAnchorPath = childAnchor ? `${submissionId}/poses/${id}/child-anchor.webp` : null;
  const estimatedCostCents = plan.baseAssets.length * BUDGETED_COST_CENTS_PER_ASSET;
  if (estimatedCostCents > plan.limits.costCapCents) throw poseJobError("The selected monster and child pose plan exceeds its approved cost cap.", 409, "pose_cost_cap_reached");
  if (existing[0]) {
    await supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: "PATCH",
      body: { status: "invalidated", error_code: "pose_plan_outdated", updated_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
  }
  const rows = await supabaseRequest("/storybook_pose_jobs", {
    method: "POST",
    body: [{
      id,
      submission_id: submissionId,
      source_preview_id: selectedPreviewId,
      story_id: story.id,
      story_version: plan.storyVersion,
      child_profile_key: childProfileKey,
      child_anchor_path: childAnchorPath,
      status: "planned",
      pose_plan: plan,
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
      quality: "low",
      cost_cap_cents: plan.limits.costCapCents,
      estimated_cost_cents: estimatedCostCents,
    }],
    prefer: "return=representation",
  });
  try {
    if (childAnchor) {
      await uploadPrivateImage(childAnchorPath, { contentType: childAnchor.contentType, bytes: childAnchor.bytes });
    }
    await supabaseRequest("/storybook_pose_assets", {
      method: "POST",
      body: plan.baseAssets.map((asset) => ({
        job_id: id,
        asset_key: asset.key,
        subject_type: asset.subjectType,
        asset_kind: asset.kind,
        pose_id: asset.poseId,
        status: "queued",
        max_attempts: asset.maxAttempts,
        model: rows[0].model,
        quality: rows[0].quality,
        estimated_cost_cents: BUDGETED_COST_CENTS_PER_ASSET,
      })),
      prefer: "return=minimal",
    });
    await supabaseRequest("/storybook_scene_mappings", {
      method: "POST",
      body: plan.scenes.map((scene) => ({
        job_id: id,
        page_number: scene.pageNumber,
        status: scene.status,
        monster_asset_key: scene.monster?.assetKey || null,
        child_asset_key: scene.child?.assetKey || null,
        composition: scene,
        qa: scene.qa,
      })),
      prefer: "return=minimal",
    });
  } catch (error) {
    await supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
    if (childAnchorPath) await deletePrivateImages([childAnchorPath]).catch(() => {});
    throw error;
  }
  return getPoseJob(id);
}

async function getPoseJob(id) {
  requireUuid(id, "pose job");
  const [jobs, assets, scenes] = await Promise.all([
    supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(id)}&select=*`),
    supabaseRequest(`/storybook_pose_assets?job_id=eq.${encodeURIComponent(id)}&select=*&order=subject_type.asc,asset_kind.asc,pose_id.asc`),
    supabaseRequest(`/storybook_scene_mappings?job_id=eq.${encodeURIComponent(id)}&select=*&order=page_number.asc`),
  ]);
  if (!jobs[0]) return null;
  return decoratePoseJob(jobs[0], assets, scenes);
}

async function listPoseJobsForAdmin(submissionId = "") {
  const filter = submissionId ? `&submission_id=eq.${encodeURIComponent(requireUuid(submissionId, "saved monster"))}` : "";
  const jobs = await supabaseRequest(`/storybook_pose_jobs?select=*&order=updated_at.desc${filter}`);
  if (!jobs.length) return [];
  const ids = jobs.map((job) => job.id).join(",");
  const [assets, scenes] = await Promise.all([
    supabaseRequest(`/storybook_pose_assets?job_id=in.(${ids})&select=*&order=subject_type.asc,asset_kind.asc,pose_id.asc`),
    supabaseRequest(`/storybook_scene_mappings?job_id=in.(${ids})&select=*&order=page_number.asc`),
  ]);
  return Promise.all(jobs.map((job) => decoratePoseJob(
    job,
    assets.filter((asset) => asset.job_id === job.id),
    scenes.filter((scene) => scene.job_id === job.id),
  )));
}

async function updatePoseJob(id, payload = {}) {
  const job = await getPoseJob(id);
  if (!job) return null;
  const action = payload.action;
  if (action === "record_asset") return recordPoseAsset(job, payload);
  if (action === "approve_asset") return approvePoseAsset(job, payload);
  if (action === "retry_asset") return retryPoseAsset(job, payload);
  if (action === "approve_scene") return approveScene(job, payload);
  if (action === "approve_scale") return approveScale(job, payload);
  if (action === "approve_job") return approveJob(job, payload);
  if (action === "create_adaptation") return createAdaptation(job, payload);
  if (action === "record_child_anchor") return recordChildAnchor(job, payload);
  if (action === "generate_next") return generateNextPoseAsset(job, payload);
  throw poseJobError("Choose a valid pose production action.");
}

async function recordPoseAsset(job, payload) {
  const asset = requireAsset(job, payload.assetKey);
  if (!["queued", "failed", "blocked", "review"].includes(asset.status)) throw poseJobError("This pose asset cannot be replaced in its current state.", 409);
  if (asset.attempts >= asset.maxAttempts) throw poseJobError("This pose reached its two-attempt cap. Review the source portrait before starting a new job.", 409, "pose_attempt_cap_reached");
  const image = parseImage(payload.image, "Upload a transparent PNG pose under 6 MB.");
  if (image.contentType !== "image/png") throw poseJobError("Pose assets must be transparent PNG files.");
  const transparency = inspectPngTransparency(image.bytes);
  if (!transparency.hasTransparentPixels) throw poseJobError("The PNG needs real transparent background pixels before review.", 400, "pose_transparency_required");
  const objectPath = `${job.submissionId}/poses/${job.id}/${asset.id}.png`;
  await uploadPrivateImage(objectPath, image);
  await supabaseRequest(`/storybook_pose_assets?id=eq.${encodeURIComponent(asset.id)}&job_id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: {
      status: "review",
      attempts: asset.attempts + 1,
      asset_path: objectPath,
      has_transparency: true,
      identity_approved: false,
      anatomy_approved: false,
      visual_bounds: payload.visualBounds || null,
      qa: { source: payload.source === "generated" ? "generated" : "manual_upload", transparency },
      error_code: null,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
  await setJobStatus(job.id, "review");
  return getPoseJob(job.id);
}

async function approvePoseAsset(job, payload) {
  const asset = requireAsset(job, payload.assetKey);
  if (asset.status !== "review" || !asset.assetPath || !asset.transparent) throw poseJobError("Upload and inspect a transparent pose before approval.", 409);
  const bounds = normalizeReviewedBounds(payload.visualBounds || asset.visualBounds);
  const reviewer = requiredText(payload.approvedBy, "reviewer name");
  await supabaseRequest(`/storybook_pose_assets?id=eq.${encodeURIComponent(asset.id)}&job_id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: {
      status: "approved",
      identity_approved: true,
      anatomy_approved: true,
      visual_bounds: bounds,
      qa: { ...(asset.qa || {}), identity: true, anatomy: true, cleanEdges: payload.cleanEdges === true, sourcePreviewId: job.sourcePreviewId },
      approved_by: reviewer,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
  return getPoseJob(job.id);
}

async function retryPoseAsset(job, payload) {
  const asset = requireAsset(job, payload.assetKey);
  if (!["failed", "blocked"].includes(asset.status)) throw poseJobError("Only a failed or blocked pose can be retried.", 409);
  if (asset.attempts >= asset.maxAttempts) throw poseJobError("This pose reached its two-attempt cap.", 409, "pose_attempt_cap_reached");
  await supabaseRequest(`/storybook_pose_assets?id=eq.${encodeURIComponent(asset.id)}&job_id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH", body: { status: "queued", error_code: null, updated_at: new Date().toISOString() }, prefer: "return=minimal",
  });
  return getPoseJob(job.id);
}

async function approveScene(job, payload) {
  const pageNumber = Number.parseInt(payload.pageNumber, 10);
  const scene = job.scenes.find((item) => item.pageNumber === pageNumber);
  if (!scene || scene.status === "not_required") throw poseJobError("Choose a required story page.");
  const qa = payload.qa || {};
  const requiredChecks = ["identity", "anatomy", "relativeScale", "cameraDepth", "boundingBoxes", "grounding", "eyeline", "interactionClearance"];
  if (!requiredChecks.every((key) => qa[key] === true)) throw poseJobError("Complete every page continuity check before approval.", 409, "scene_qa_incomplete");
  await supabaseRequest(`/storybook_scene_mappings?id=eq.${encodeURIComponent(scene.id)}&job_id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: { status: "approved", qa: { ...qa, approved: true }, approved_by: requiredText(payload.approvedBy, "reviewer name"), approved_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
  return getPoseJob(job.id);
}

async function approveScale(job, payload) {
  const ratio = Number(payload.monsterHeightToStandingChildHeight);
  if (!Number.isFinite(ratio) || ratio <= 0.2 || ratio >= 3) throw poseJobError("Enter a reviewed monster-to-standing-child height ratio between 0.2 and 3.");
  const plan = structuredClone(job.plan);
  plan.scaleContract = {
    ...plan.scaleContract,
    monsterHeightToStandingChildHeight: Number(ratio.toFixed(4)),
    calibrationStatus: "approved",
    approvedBy: requiredText(payload.approvedBy, "reviewer name"),
    approvedAt: new Date().toISOString(),
  };
  await supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH", body: { pose_plan: plan, updated_at: new Date().toISOString() }, prefer: "return=minimal",
  });
  return getPoseJob(job.id);
}

async function approveJob(job, payload) {
  const readiness = evaluatePoseJobReadiness(job);
  if (!readiness.ready) throw poseJobError(`Pose production is blocked: ${readiness.blockers.join(" ")}`, 409, "pose_job_not_ready");
  await supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: { status: "approved", approved_by: requiredText(payload.approvedBy, "reviewer name"), approved_at: new Date().toISOString(), error_code: null, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
  return getPoseJob(job.id);
}

async function createAdaptation(job, payload) {
  const pageNumber = Number.parseInt(payload.pageNumber, 10);
  const subjectType = ["monster", "child"].includes(payload.subjectType) ? payload.subjectType : "";
  const scene = job.scenes.find((item) => item.pageNumber === pageNumber);
  if (!scene || !subjectType || !scene.composition?.[subjectType]) throw poseJobError("Choose a required character and story page for the adaptation.");
  const existingAdaptations = job.assets.filter((asset) => asset.kind === "scene_adaptation");
  if (existingAdaptations.length >= 64) throw poseJobError("This job reached its bounded scene-adaptation cap.", 409);
  if (job.estimatedCostCents + BUDGETED_COST_CENTS_PER_ASSET > job.costCapCents) throw poseJobError("This adaptation would exceed the approved pose-job cost cap.", 409, "pose_cost_cap_reached");
  const poseId = scene.composition[subjectType].basePoseId;
  const assetKey = `${subjectType}:scene:${pageNumber}:${poseId}`;
  if (job.assets.some((asset) => asset.key === assetKey)) return job;
  await supabaseRequest("/storybook_pose_assets", {
    method: "POST",
    body: [{ job_id: job.id, asset_key: assetKey, subject_type: subjectType, asset_kind: "scene_adaptation", pose_id: poseId, page_number: pageNumber, status: "queued", max_attempts: MAX_GENERATION_ATTEMPTS_PER_ASSET, model: job.model, quality: job.quality, estimated_cost_cents: BUDGETED_COST_CENTS_PER_ASSET }],
    prefer: "return=minimal",
  });
  const composition = structuredClone(scene.composition);
  composition.adaptation = { ...(composition.adaptation || {}), required: true, reason: String(payload.reason || "Page-specific continuity review").slice(0, 240), [`${subjectType}AssetKey`]: assetKey };
  composition[subjectType].assetKey = assetKey;
  await Promise.all([
    supabaseRequest(`/storybook_scene_mappings?id=eq.${encodeURIComponent(scene.id)}`, { method: "PATCH", body: { status: "review", [`${subjectType}_asset_key`]: assetKey, composition, updated_at: new Date().toISOString() }, prefer: "return=minimal" }),
    supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: { estimated_cost_cents: job.estimatedCostCents + BUDGETED_COST_CENTS_PER_ASSET, updated_at: new Date().toISOString() }, prefer: "return=minimal" }),
  ]);
  return getPoseJob(job.id);
}

async function recordChildAnchor(job, payload) {
  if (!job.plan?.identityContract?.child?.included) throw poseJobError("This pose plan does not include a child character.");
  const image = parseImage(payload.image, "Upload the exact approved child appearance PNG under 6 MB.");
  const objectPath = `${job.submissionId}/poses/${job.id}/child-anchor.${image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg"}`;
  await uploadPrivateImage(objectPath, image);
  await supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: { child_anchor_path: objectPath, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
  return getPoseJob(job.id);
}

async function generateNextPoseAsset(job, payload) {
  if (process.env.MONSTERSNOW_POSE_GENERATION_ENABLED !== "true" || !process.env.OPENAI_API_KEY) {
    throw poseJobError("Automated pose generation is spend-disabled. Enable it only after provider access and the per-job budget are approved.", 409, "pose_generation_spend_disabled");
  }
  if (payload.spendApproved !== true) throw poseJobError("Confirm the bounded provider charge before generating one pose.", 409, "pose_generation_approval_required");
  if (["approved", "invalidated"].includes(job.status)) throw poseJobError("This pose job cannot generate more assets.", 409);
  const asset = job.assets.find((item) => item.status === "queued" && item.attempts < item.maxAttempts);
  if (!asset) throw poseJobError("No queued pose asset is ready to generate.", 409);
  const reservedCost = Number(job.actualCostCents || 0) + BUDGETED_COST_CENTS_PER_ASSET;
  if (reservedCost > job.costCapCents) throw poseJobError("The next pose would exceed the approved job cost cap.", 409, "pose_cost_cap_reached");
  const source = await poseSourceImage(job, asset);
  const prompt = buildPosePrompt(job, asset);
  await supabaseRequest(`/storybook_pose_assets?id=eq.${encodeURIComponent(asset.id)}&status=eq.queued`, {
    method: "PATCH",
    body: { status: "generating", attempts: asset.attempts + 1, prompt_text: prompt, model: job.model, quality: job.quality, error_code: null, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
  await setJobStatus(job.id, "generating");
  try {
    const generated = await requestTransparentPoseEdit({ model: job.model, quality: job.quality, prompt, source });
    const transparency = inspectPngTransparency(generated.bytes);
    if (!transparency.hasTransparentPixels) throw poseJobError("The provider returned an opaque image; this attempt is blocked for manual review.", 502, "pose_provider_returned_opaque_image");
    const objectPath = `${job.submissionId}/poses/${job.id}/${asset.id}.png`;
    await uploadPrivateImage(objectPath, { contentType: "image/png", bytes: generated.bytes });
    await Promise.all([
      supabaseRequest(`/storybook_pose_assets?id=eq.${encodeURIComponent(asset.id)}`, {
        method: "PATCH",
        body: { status: "review", asset_path: objectPath, has_transparency: true, provider_request_id: generated.requestId, qa: { source: "generated", transparency }, error_code: null, updated_at: new Date().toISOString() },
        prefer: "return=minimal",
      }),
      supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        body: { status: "review", actual_cost_cents: reservedCost, updated_at: new Date().toISOString() },
        prefer: "return=minimal",
      }),
    ]);
  } catch (error) {
    await Promise.all([
      supabaseRequest(`/storybook_pose_assets?id=eq.${encodeURIComponent(asset.id)}`, { method: "PATCH", body: { status: "failed", error_code: String(error.code || "pose_generation_failed").slice(0, 120), updated_at: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => {}),
      supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: { status: "blocked", actual_cost_cents: reservedCost, error_code: String(error.code || "pose_generation_failed").slice(0, 120), updated_at: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => {}),
    ]);
    throw error;
  }
  return getPoseJob(job.id);
}

async function poseSourceImage(job, asset) {
  let path;
  if (asset.subjectType === "monster") {
    const rows = await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(job.sourcePreviewId)}&submission_id=eq.${encodeURIComponent(job.submissionId)}&select=preview_path`);
    path = rows[0]?.preview_path;
  } else {
    const rows = await supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(job.id)}&select=child_anchor_path`);
    path = rows[0]?.child_anchor_path;
  }
  if (!path) throw poseJobError(asset.subjectType === "child" ? "Attach the exact approved child appearance before generating child poses." : "The pinned monster portrait is unavailable.", 409, "pose_anchor_missing");
  const url = await createSignedUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw poseJobError("The pinned character anchor could not be opened.", 502, "pose_anchor_unavailable");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "image/png", filename: asset.subjectType === "monster" ? "approved-monster.png" : "approved-child.png" };
}

function buildPosePrompt(job, asset) {
  const planAsset = job.plan.baseAssets?.find((item) => item.key === asset.key);
  const identity = asset.subjectType === "monster" ? job.plan.identityContract.monster : job.plan.identityContract.child;
  const scene = asset.pageNumber ? job.scenes.find((item) => item.pageNumber === asset.pageNumber)?.composition : null;
  const anatomy = Array.isArray(identity?.anatomyTraits) && identity.anatomyTraits.length ? identity.anatomyTraits.join("; ") : "preserve every observed limb, eye, horn, marking, proportion, and silhouette exactly";
  return [
    "Create one production character pose from the provided exact approved character anchor.",
    "The input is the identity source of truth. Do not redesign, beautify, simplify, or add/remove anatomy.",
    `Identity lock: ${anatomy}.`,
    asset.subjectType === "child" && identity?.ageBandLabel ? `Story age lock: ${identity.ageBandLabel}. Keep the face and body clearly age-appropriate for this band while preserving the selected identity.` : "",
    planAsset?.direction || `${asset.poseId.replaceAll("_", " ")} pose.`,
    planAsset?.artReference?.status === "visual_direction_approved" ? `This action is mapped to the existing approved Halloween art guide “${planAsset.artReference.spreadLabel}.” Preserve that story beat and eyeline, but do not copy its sample child, sample monster, environment, lighting, or props into this transparent character layer.` : "",
    asset.subjectType === "child" && identity?.mobilityAid === "wheelchair" ? "Keep the child seated in the exact same wheelchair. Preserve chair geometry, wheels, supports, seated proportions, and outfit. Do not show standing, walking, running, or climbing." : "",
    scene ? `Page adaptation: facing ${scene[asset.subjectType]?.facing || "neutral"}, camera depth ${scene[asset.subjectType]?.cameraDepth || "midground"}, perspective ${scene[asset.subjectType]?.perspective || "eye_level"}. Match the paired eyeline and interaction anchors without baking in the environment.` : "",
    "Single complete character only. Tight clean crop with every extremity visible. No environment, floor, shadow, text, logo, prop unless explicitly required, or other characters.",
    "Transparent background with genuinely transparent pixels and clean decontaminated edges.",
  ].filter(Boolean).join(" ");
}

async function requestTransparentPoseEdit({ model, quality, prompt, source }) {
  const form = new FormData();
  form.append("model", model || "gpt-image-1.5");
  form.append("prompt", prompt);
  form.append("image[]", new Blob([source.bytes], { type: source.contentType }), source.filename);
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("quality", quality || "low");
  form.append("background", "transparent");
  form.append("output_format", "png");
  form.append("input_fidelity", "high");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: controller.signal });
  } finally { clearTimeout(timeout); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw poseJobError(body.error?.message || "The image provider rejected this pose request.", response.status >= 500 ? 502 : response.status, body.error?.code || "pose_provider_error");
  const base64 = body.data?.[0]?.b64_json;
  if (!base64) throw poseJobError("The image provider returned no pose image.", 502, "pose_provider_empty");
  return { bytes: Buffer.from(base64, "base64"), requestId: response.headers.get("x-request-id") };
}

async function decoratePoseJob(row, assetRows, sceneRows) {
  const planAssets = new Map((row.pose_plan?.baseAssets || []).map((asset) => [asset.key, asset]));
  const assets = await Promise.all(assetRows.map(async (asset) => ({
    id: asset.id,
    key: asset.asset_key,
    subjectType: asset.subject_type,
    kind: asset.asset_kind,
    poseId: asset.pose_id,
    label: planAssets.get(asset.asset_key)?.label || asset.pose_id.replaceAll("_", " "),
    direction: planAssets.get(asset.asset_key)?.direction || "",
    artReference: planAssets.get(asset.asset_key)?.artReference || null,
    pageNumber: asset.page_number,
    status: asset.status,
    attempts: asset.attempts,
    maxAttempts: asset.max_attempts,
    transparent: asset.has_transparency,
    identityApproved: asset.identity_approved,
    anatomyApproved: asset.anatomy_approved,
    visualBounds: asset.visual_bounds,
    qa: asset.qa || {},
    assetPath: asset.asset_path,
    url: await createSignedUrl(asset.asset_path),
    errorCode: asset.error_code,
    pageNumbers: planAssets.get(asset.asset_key)?.pageNumbers || [],
    pageCount: planAssets.get(asset.asset_key)?.pageCount || 0,
  })));
  const scenes = sceneRows.map((scene) => ({ id: scene.id, pageNumber: scene.page_number, status: scene.status, monsterAssetKey: scene.monster_asset_key, childAssetKey: scene.child_asset_key, composition: scene.composition, qa: scene.qa || {} }));
  const decorated = {
    id: row.id,
    submissionId: row.submission_id,
    sourcePreviewId: row.source_preview_id,
    storyId: row.story_id,
    storyVersion: row.story_version,
    childProfileKey: row.child_profile_key,
    childAnchorAttached: Boolean(row.child_anchor_path),
    childAnchorUrl: await createSignedUrl(row.child_anchor_path),
    status: row.status,
    plan: row.pose_plan,
    model: row.model,
    quality: row.quality,
    costCapCents: row.cost_cap_cents,
    estimatedCostCents: row.estimated_cost_cents,
    actualCostCents: row.actual_cost_cents,
    errorCode: row.error_code,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    blueprintOutdated: posePlanNeedsUpgrade(row.pose_plan),
    generationEnabled: process.env.MONSTERSNOW_POSE_GENERATION_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY),
    updatedAt: row.updated_at,
    assets,
    scenes,
  };
  decorated.readiness = evaluatePoseJobReadiness(decorated);
  decorated.progress = {
    approvedAssets: assets.filter((asset) => asset.status === "approved").length,
    totalAssets: assets.length,
    approvedScenes: scenes.filter((scene) => ["approved", "not_required"].includes(scene.status)).length,
    totalScenes: scenes.length,
  };
  return decorated;
}

async function latestChildCharacter(submissionId, storyId, storySlug) {
  const orders = await supabaseRequest(`/storybook_orders?monster_submission_id=eq.${encodeURIComponent(submissionId)}&story_id=in.(${encodeURIComponent(storyId)},${encodeURIComponent(storySlug || storyId)})&select=child_character&order=created_at.desc&limit=1`);
  return orders[0]?.child_character || { included: false };
}

async function setJobStatus(id, status) {
  return supabaseRequest(`/storybook_pose_jobs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: { status, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
}

function requireAsset(job, assetKey) {
  const asset = job.assets.find((item) => item.key === assetKey);
  if (!asset) throw poseJobError("Choose a valid pose asset.");
  return asset;
}
function posePlansCompatible(savedPlan = {}, nextPlan = {}) {
  if (!savedPlan?.blueprintVersion || savedPlan.blueprintVersion !== nextPlan?.blueprintVersion) return false;
  const savedKeys = (savedPlan.baseAssets || []).map((asset) => asset.key).sort();
  const nextKeys = (nextPlan.baseAssets || []).map((asset) => asset.key).sort();
  return savedKeys.length === nextKeys.length && savedKeys.every((key, index) => key === nextKeys[index]);
}
function posePlanNeedsUpgrade(plan = {}) {
  return isHalloweenStory(plan.storySlug) && plan.blueprintVersion !== HALLOWEEN_BLUEPRINT_VERSION;
}
function normalizeReviewedBounds(value = {}) {
  const keys = ["xPercent", "yPercent", "widthPercent", "heightPercent"];
  const result = {};
  for (const key of keys) {
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < 0 || number > 100) throw poseJobError("Record the reviewed 0–100% pose bounding box before approval.");
    result[key] = number;
  }
  return { ...result, status: "measured" };
}
function requireUuid(value, label) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""))) throw poseJobError(`Choose a valid ${label}.`); return value; }
function requiredText(value, label) { const text = typeof value === "string" ? value.trim().slice(0, 120) : ""; if (!text) throw poseJobError(`Enter the ${label}.`); return text; }
function poseJobError(message, status = 400, code = "invalid_pose_job") { const error = new Error(message); error.status = status; error.code = code; return error; }

module.exports = { createPoseJob, getPoseJob, listPoseJobsForAdmin, posePlanNeedsUpgrade, posePlansCompatible, updatePoseJob };
