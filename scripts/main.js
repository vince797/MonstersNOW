const year = document.querySelector("#year");

if (year) {
  year.textContent = new Date().getFullYear();
}

const monsterUpload = document.querySelector("#monster-upload");
const drawingPreview = document.querySelector("#drawing-preview");
const monsterPreview = document.querySelector("#monster-preview");
const convertButton = document.querySelector("#convert-button");
const regenerateButton = document.querySelector("#regenerate-monster");
const resultPanel = document.querySelector("#monster-result");
const downloadColoringButton = document.querySelector("#download-coloring");
const converterStatus = document.querySelector("#converter-status");
const converterNote = document.querySelector("#converter-note");
const previewCount = document.querySelector("#preview-count");
const uploadActionStatus = document.querySelector("#upload-action-status");
const uploadError = document.querySelector("#upload-error");
const uploadDrop = document.querySelector(".upload-drop");
const uploadTitle = document.querySelector(".upload-drop strong");
const uploadMeta = document.querySelector(".upload-drop small");
const flowSteps = [...document.querySelectorAll(".converter-flow li")];
const styleButtons = [...document.querySelectorAll("[data-monster-style]")];
const previewHistory = document.querySelector("#preview-history");
const storybookInterestButton = document.querySelector("#storybook-interest");
const storybookInterestForm = document.querySelector("#storybook-interest-form");
const interestEmail = document.querySelector("#interest-email");
const interestStatus = document.querySelector("#interest-status");
const storybookFormatInputs = [...document.querySelectorAll('input[name="storybook-format"]')];

const allowedUploadTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxUploadBytes = 8 * 1024 * 1024;
const maxFreePreviews = 3;
const demoMonsterImage = "assets/step-2-character.jpg?v=20260515-horns";
const previewStyleLabels = {
  storybook: "Storybook",
  cute: "Cute",
  silly: "Silly",
  adventure: "Adventure",
};
let drawingPreviewUrl;
let selectedDrawingFile;
let coloringPageUrl;
let selectedMonsterStyle = "storybook";
let previewsUsed = 0;
let generatedPreviews = [];
let selectedPreviewId;
let isGeneratingPreview = false;
let uploadDragDepth = 0;

if (monsterUpload && drawingPreview && monsterPreview && convertButton) {
  monsterUpload.addEventListener("change", () => {
    const [file] = monsterUpload.files;

    selectDrawingFile(file);
  });

  bindUploadDropZone();
  convertButton.addEventListener("click", requestMonsterPreview);
  regenerateButton?.addEventListener("click", requestMonsterPreview);

  if (downloadColoringButton) {
    downloadColoringButton.addEventListener("click", async () => {
      downloadColoringButton.disabled = true;
      downloadColoringButton.textContent = "Preparing...";

      try {
        if (coloringPageUrl) {
          await downloadPrintableColoringPage(coloringPageUrl);
        } else {
          await downloadColoringPage(monsterPreview);
        }

        if (converterStatus) {
          converterStatus.textContent = "Coloring page downloaded.";
        }
      } catch (error) {
        console.error(error);

        if (converterStatus) {
          converterStatus.textContent = "Coloring page could not be prepared.";
        }

        if (converterNote) {
          converterNote.textContent = "Try creating the monster preview again, then download the coloring page.";
        }
      } finally {
        downloadColoringButton.disabled = false;
        downloadColoringButton.textContent = "Download Free Coloring Page";
      }
    });
  }

  styleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedMonsterStyle = normalizePreviewStyle(button.dataset.monsterStyle);
      updateStyleButtons();

      if (selectedDrawingFile && previewsUsed < maxFreePreviews && converterNote) {
        converterNote.textContent = `${previewStyleLabels[selectedMonsterStyle]} style selected. Create another version when ready.`;
      }

      if (selectedDrawingFile && previewsUsed < maxFreePreviews) {
        setUploadActionStatus(`${previewStyleLabels[selectedMonsterStyle]} style selected. Tap the button to generate it.`);
      }
    });
  });

  updateStyleButtons();
  syncPreviewControls();
}

if (storybookInterestButton && storybookInterestForm) {
  storybookInterestButton.addEventListener("click", () => {
    storybookInterestForm.hidden = false;
    interestEmail?.focus();

    if (interestStatus) {
      interestStatus.textContent = "Leave an email and we will follow up when storybook ordering opens.";
    }
  });

  storybookInterestForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = interestEmail?.value.trim();

    if (!email || !interestEmail.checkValidity()) {
      if (interestStatus) {
        interestStatus.textContent = "Enter a valid email for storybook updates.";
      }

      return;
    }

    const selectedFormat = getSelectedStorybookFormat();

    localStorage.setItem(
      "monstersnow_storybook_interest",
      JSON.stringify({
        email,
        format: selectedFormat.value,
      }),
    );

    if (interestStatus) {
      interestStatus.textContent = `Thanks. We will follow up about the ${selectedFormat.label.toLowerCase()} option.`;
    }

    window.location.href = `mailto:hello@monstersnow.com?subject=${encodeURIComponent(
      "MonstersNOW storybook interest",
    )}&body=${encodeURIComponent(
      `Please notify me when storybook ordering opens: ${email}\nPreferred format: ${selectedFormat.label}`,
    )}`;
  });
}

function getSelectedStorybookFormat() {
  const selected = storybookFormatInputs.find((input) => input.checked);
  const value = selected?.value === "hardcover" ? "hardcover" : "softcover";

  return {
    value,
    label: value === "hardcover" ? "Hardcover Keepsake ($59.99 + shipping)" : "Softcover Storybook ($39.99 + shipping)",
  };
}

function bindUploadDropZone() {
  if (!uploadDrop) {
    return;
  }

  uploadDrop.addEventListener("dragenter", (event) => {
    if (!hasFileDrag(event)) {
      return;
    }

    event.preventDefault();
    uploadDragDepth += 1;
    uploadDrop.classList.add("is-dragging");
    setUploadActionStatus("Drop the drawing to upload it.");
  });

  uploadDrop.addEventListener("dragover", (event) => {
    if (!hasFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  uploadDrop.addEventListener("dragleave", (event) => {
    if (!hasFileDrag(event)) {
      return;
    }

    uploadDragDepth = Math.max(0, uploadDragDepth - 1);

    if (uploadDragDepth === 0) {
      clearUploadDragState();
    }
  });

  uploadDrop.addEventListener("drop", (event) => {
    if (!hasFileDrag(event)) {
      return;
    }

    event.preventDefault();
    clearUploadDragState();
    selectDrawingFile(getDroppedDrawingFile(event.dataTransfer?.files));
  });

  uploadDrop.addEventListener("dragend", clearUploadDragState);
}

function hasFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function clearUploadDragState() {
  uploadDragDepth = 0;
  uploadDrop?.classList.remove("is-dragging");
}

function getDroppedDrawingFile(files) {
  return [...(files || [])].find((file) => file.type.startsWith("image/")) || files?.[0];
}

function selectDrawingFile(file) {
  if (!file) {
    showUploadError("Drop a PNG, JPG, WebP, or GIF image.");
    return;
  }

  const validationError = validateDrawing(file);

  if (validationError) {
    resetUpload();
    showUploadError(validationError);
    return;
  }

  if (drawingPreviewUrl) {
    URL.revokeObjectURL(drawingPreviewUrl);
  }

  drawingPreviewUrl = URL.createObjectURL(file);
  selectedDrawingFile = file;
  resetPreviewState();
  drawingPreview.src = drawingPreviewUrl;
  drawingPreview.alt = "Uploaded child monster drawing.";
  setConverterStage("preview");
  showUploadError("");

  if (uploadTitle) {
    uploadTitle.textContent = file.name;
  }

  if (uploadMeta) {
    uploadMeta.textContent = `${formatBytes(file.size)} selected`;
  }

  if (downloadColoringButton) {
    downloadColoringButton.disabled = true;
  }

  if (converterStatus) {
    converterStatus.textContent = "Drawing loaded.";
  }

  if (converterNote) {
    converterNote.textContent = "Ready to create a MonstersNOW-style character preview.";
  }

  setUploadActionStatus("Tap Create Monster. The preview will appear below.");
  syncPreviewControls();
}

async function requestMonsterPreview() {
  if (!selectedDrawingFile || isGeneratingPreview) {
    return;
  }

  if (previewsUsed >= maxFreePreviews) {
    if (converterStatus) {
      converterStatus.textContent = "Choose a preview to continue.";
    }

    if (converterNote) {
      converterNote.textContent = "This drawing has used its free preview versions. Pick the one you like for the coloring page or storybook.";
    }

    syncPreviewControls();
    setUploadActionStatus("Preview limit reached. Choose one of the versions below.");
    scrollToResultPanel();
    return;
  }

  isGeneratingPreview = true;
  syncPreviewControls();
  setUploadActionStatus("Creating your monster preview. Watch the panel below.");

  if (converterStatus) {
    converterStatus.textContent = "Creating monster preview...";
  }

  if (converterNote) {
    converterNote.textContent = "This usually takes a short moment. Try up to three versions before choosing one.";
  }

  scrollToResultPanel();

  try {
    const drawing = await prepareImageForUpload(selectedDrawingFile);
    const result = await convertMonster(drawing, selectedMonsterStyle, previewsUsed + 1);
    applyMonsterResult(result);
  } catch (error) {
    console.error(error);
    showMonsterGenerationError(error);
  } finally {
    isGeneratingPreview = false;
    syncPreviewControls();
  }
}

function applyMonsterResult(result) {
  const style = normalizePreviewStyle(result.style);
  const preview = addGeneratedPreview({
    image: result.monsterImage,
    coloringPage: result.coloringPage,
    mode: "ai",
    style,
  });
  const remaining = maxFreePreviews - previewsUsed;

  selectGeneratedPreview(preview.id);
  setConverterStage("download");

  if (downloadColoringButton) {
    downloadColoringButton.disabled = false;
  }

  if (converterStatus) {
    converterStatus.textContent = `${previewStyleLabels[style]} monster preview ready.`;
  }

  if (converterNote) {
    converterNote.textContent = `Choose this version, download the free coloring page, or try another style. ${describeRemainingPreviews(remaining)}`;
  }

  setUploadActionStatus(`${previewStyleLabels[style]} preview ready below. ${describeRemainingPreviews(remaining)}`);
  scrollToResultPanel({ focus: true, delay: 120 });
}

function addGeneratedPreview({ image, coloringPage, mode, style }) {
  previewsUsed += 1;

  const preview = {
    id: `monster-preview-${Date.now()}-${previewsUsed}`,
    image,
    coloringPage,
    mode,
    style: normalizePreviewStyle(style),
  };

  generatedPreviews.push(preview);
  renderPreviewHistory();

  return preview;
}

function renderPreviewHistory() {
  if (!previewHistory) {
    return;
  }

  previewHistory.innerHTML = "";
  previewHistory.hidden = generatedPreviews.length === 0;

  generatedPreviews.forEach((preview, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    const label = document.createElement("span");
    const styleLabel = previewStyleLabels[preview.style];

    button.type = "button";
    button.className = "preview-choice";
    button.dataset.previewId = preview.id;
    button.setAttribute("aria-pressed", preview.id === selectedPreviewId ? "true" : "false");
    button.addEventListener("click", () => selectGeneratedPreview(preview.id, true));

    image.src = preview.image;
    image.alt = `${styleLabel} monster preview ${index + 1}.`;

    label.textContent = `${index + 1}. ${styleLabel}`;

    button.append(image, label);
    previewHistory.append(button);
  });
}

function selectGeneratedPreview(id, announce = false) {
  const preview = generatedPreviews.find((item) => item.id === id);

  if (!preview) {
    return;
  }

  selectedPreviewId = preview.id;
  monsterPreview.src = preview.image;
  monsterPreview.alt = `${previewStyleLabels[preview.style]} generated monster character preview.`;
  coloringPageUrl = preview.coloringPage;

  previewHistory?.querySelectorAll(".preview-choice").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.previewId === id ? "true" : "false");
  });

  if (downloadColoringButton) {
    downloadColoringButton.disabled = false;
  }

  if (announce && converterStatus) {
    converterStatus.textContent = `${previewStyleLabels[preview.style]} preview selected.`;
  }

  if (announce) {
    setUploadActionStatus(`${previewStyleLabels[preview.style]} preview selected.`);
  }
}

function resetPreviewState() {
  coloringPageUrl = undefined;
  previewsUsed = 0;
  generatedPreviews = [];
  selectedPreviewId = undefined;
  isGeneratingPreview = false;

  if (previewHistory) {
    previewHistory.innerHTML = "";
    previewHistory.hidden = true;
  }

  if (downloadColoringButton) {
    downloadColoringButton.disabled = true;
  }

  setUploadActionStatus("Upload a drawing to unlock the free monster preview.");
  syncPreviewControls();
}

function updateStyleButtons() {
  styleButtons.forEach((button) => {
    const isActive = normalizePreviewStyle(button.dataset.monsterStyle) === selectedMonsterStyle;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function syncPreviewControls() {
  const remaining = Math.max(0, maxFreePreviews - previewsUsed);
  const canGenerate = Boolean(selectedDrawingFile) && remaining > 0 && !isGeneratingPreview;
  const primaryText = previewsUsed === 0 ? "Create Monster" : "Try Another Version";
  const buttonText = isGeneratingPreview
    ? "Creating..."
    : remaining > 0
      ? primaryText
      : "Preview Limit Reached";

  if (convertButton) {
    convertButton.disabled = !canGenerate;
    convertButton.textContent = buttonText;
  }

  if (regenerateButton) {
    regenerateButton.disabled = !canGenerate || previewsUsed === 0;
    regenerateButton.textContent = isGeneratingPreview
      ? "Creating..."
      : remaining > 0
        ? "Try Another Version"
        : "Preview Limit Reached";
  }

  if (previewCount) {
    previewCount.textContent = selectedDrawingFile
      ? describeRemainingPreviews(remaining)
      : `${maxFreePreviews} free previews per drawing.`;
  }
}

function normalizePreviewStyle(style) {
  return Object.prototype.hasOwnProperty.call(previewStyleLabels, style) ? style : "storybook";
}

function describeRemainingPreviews(remaining) {
  if (remaining <= 0) {
    return "No free previews left for this drawing.";
  }

  return `${remaining} free preview${remaining === 1 ? "" : "s"} left for this drawing.`;
}

function validateDrawing(file) {
  if (!allowedUploadTypes.has(file.type)) {
    return "Please upload a PNG, JPG, WebP, or GIF image.";
  }

  if (file.size > maxUploadBytes) {
    return `Please choose an image under ${formatBytes(maxUploadBytes)}.`;
  }

  return "";
}

function resetUpload() {
  selectedDrawingFile = undefined;
  resetPreviewState();
  monsterUpload.value = "";

  if (downloadColoringButton) {
    downloadColoringButton.disabled = true;
  }

  if (uploadTitle) {
    uploadTitle.textContent = "Upload or take a picture";
  }

  if (uploadMeta) {
    uploadMeta.textContent = "PNG, JPG, WebP, or GIF under 8 MB";
  }

  setUploadActionStatus("Upload a drawing to unlock the free monster preview.");
  setConverterStage("upload");
  syncPreviewControls();
}

function showUploadError(message) {
  if (!uploadError) {
    return;
  }

  uploadError.textContent = message;
  uploadError.hidden = !message;
}

function setUploadActionStatus(message) {
  if (uploadActionStatus) {
    uploadActionStatus.textContent = message;
  }
}

function scrollToResultPanel({ focus = false, delay = 0 } = {}) {
  if (!resultPanel || !window.matchMedia("(max-width: 1040px)").matches) {
    return;
  }

  window.setTimeout(() => {
    resultPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    if (focus) {
      resultPanel.focus({ preventScroll: true });
    }
  }, delay);
}

function setConverterStage(stage) {
  const stageOrder = ["upload", "preview", "download"];
  const activeIndex = Math.max(0, stageOrder.indexOf(stage));

  flowSteps.forEach((step) => {
    const stepIndex = stageOrder.indexOf(step.dataset.flowStep);
    step.classList.toggle("is-active", stepIndex === activeIndex);
    step.classList.toggle("is-complete", stepIndex < activeIndex);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function prepareImageForUpload(file) {
  try {
    const imageUrl = URL.createObjectURL(file);
    const image = await loadImage(imageUrl);
    const maxSize = 1400;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(imageUrl);

    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return fileToDataUrl(file);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function convertMonster(drawing, style, variationNumber) {
  const response = await fetch("/api/convert-monster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      drawing,
      style,
      variationNumber,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not create monster preview.");
  }

  if (!result.monsterImage) {
    throw new Error("The generator did not return a monster preview.");
  }

  return result;
}

function showMonsterGenerationError(error) {
  const message = error?.message || "The monster generator is temporarily unavailable.";

  if (converterStatus) {
    converterStatus.textContent = "Monster preview could not be created.";
  }

  if (converterNote) {
    converterNote.textContent = `${message} Your uploaded drawing is still selected, and this did not use one of your free previews.`;
  }

  setUploadActionStatus("The generator could not finish. Try again in a moment.");
  setConverterStage(selectedDrawingFile ? "preview" : "upload");
  scrollToResultPanel({ focus: true, delay: 120 });
}

function downloadImage(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

async function downloadColoringPage(sourceImage) {
  await ensureImageLoaded(sourceImage);
  const lineArt = createLineArtCanvas(sourceImage);
  const printablePage = await createPrintableColoringPage(lineArt);
  downloadImage(printablePage.toDataURL("image/png"), "monstersnow-coloring-page.png");
}

async function downloadPrintableColoringPage(source) {
  const lineArt = typeof source === "string" ? await loadImage(source) : source;
  const printablePage = await createPrintableColoringPage(lineArt);
  downloadImage(printablePage.toDataURL("image/png"), "monstersnow-coloring-page.png");
}

function ensureImageLoaded(image) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
  });
}

function createLineArtCanvas(sourceImage) {
  const canvas = document.createElement("canvas");
  const sourceWidth = sourceImage.naturalWidth || 1024;
  const sourceHeight = sourceImage.naturalHeight || 1024;
  const crop = getLineArtCrop(sourceWidth, sourceHeight);
  const scale = Math.min(1, 1200 / Math.max(crop.width, crop.height));
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(sourceImage, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const lineData = context.createImageData(width, height);
  const grayscale = new Uint8ClampedArray(width * height);

  for (let index = 0; index < lineData.data.length; index += 4) {
    lineData.data[index] = 255;
    lineData.data[index + 1] = 255;
    lineData.data[index + 2] = 255;
    lineData.data[index + 3] = 255;
  }

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    grayscale[pixel] = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const outputIndex = pixel * 4;
      const topLeft = grayscale[pixel - width - 1];
      const top = grayscale[pixel - width];
      const topRight = grayscale[pixel - width + 1];
      const left = grayscale[pixel - 1];
      const right = grayscale[pixel + 1];
      const bottomLeft = grayscale[pixel + width - 1];
      const bottom = grayscale[pixel + width];
      const bottomRight = grayscale[pixel + width + 1];
      const gx = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
      const gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
      const edge = Math.sqrt(gx * gx + gy * gy);
      const shouldDrawLine = edge > 64 || grayscale[pixel] < 46;

      if (shouldDrawLine) {
        drawLinePixel(lineData.data, outputIndex);
      }
    }
  }

  context.putImageData(lineData, 0, 0);

  return canvas;
}

function getLineArtCrop(sourceWidth, sourceHeight) {
  if (sourceWidth > sourceHeight * 1.45) {
    return {
      x: 0,
      y: 0,
      width: Math.min(sourceWidth, Math.round(sourceHeight * 1.18)),
      height: sourceHeight,
    };
  }

  return {
    x: 0,
    y: 0,
    width: sourceWidth,
    height: sourceHeight,
  };
}

function drawLinePixel(data, outputIndex) {
  data[outputIndex] = 18;
  data[outputIndex + 1] = 18;
  data[outputIndex + 2] = 18;
  data[outputIndex + 3] = 255;
}

async function createPrintableColoringPage(lineArt) {
  const page = document.createElement("canvas");
  const context = page.getContext("2d");
  const pageWidth = 1700;
  const pageHeight = 2200;
  const margin = 86;
  const maxArtWidth = 1380;
  const maxArtHeight = 1360;
  const scale = Math.min(maxArtWidth / lineArt.width, maxArtHeight / lineArt.height);
  const artWidth = Math.round(lineArt.width * scale);
  const artHeight = Math.round(lineArt.height * scale);
  const artX = Math.round((pageWidth - artWidth) / 2);
  const artY = Math.round(460 + Math.max(0, (maxArtHeight - artHeight) / 2));

  page.width = pageWidth;
  page.height = pageHeight;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageWidth, pageHeight);

  drawPrintableBorder(context, pageWidth, pageHeight, margin);
  drawColoringPageLogo(context, margin + 46, margin + 82);

  context.fillStyle = "#161616";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = "700 76px Arial, sans-serif";
  context.fillText("My Monster Coloring Page", pageWidth / 2, 276);

  context.drawImage(lineArt, artX, artY, artWidth, artHeight);

  context.fillStyle = "#222";
  context.font = "600 30px Arial, sans-serif";
  context.fillText("Turn drawings into storybooks", pageWidth / 2, pageHeight - 128);

  return page;
}

function drawPrintableBorder(context, pageWidth, pageHeight, margin) {
  context.strokeStyle = "#161616";
  context.lineWidth = 5;
  drawRoundedRect(context, margin, margin, pageWidth - margin * 2, pageHeight - margin * 2, 18);
  context.stroke();
  context.lineWidth = 2;
  drawRoundedRect(
    context,
    margin + 22,
    margin + 22,
    pageWidth - (margin + 22) * 2,
    pageHeight - (margin + 22) * 2,
    10,
  );
  context.stroke();
}

function drawColoringPageLogo(context, x, y) {
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = "800 42px Arial, sans-serif";
  context.fillStyle = "#061b3b";
  context.fillText("Monsters", x, y);
  context.fillStyle = "#ff6a00";
  context.fillText("NOW", x + 190, y);
  context.fillStyle = "#061b3b";
  context.font = "700 15px Arial, sans-serif";
  context.fillText("Turn drawings into storybooks", x + 2, y + 26);
  context.restore();
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
