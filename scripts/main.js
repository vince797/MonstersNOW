const year = document.querySelector("#year");

if (year) {
  year.textContent = new Date().getFullYear();
}

const monsterUpload = document.querySelector("#monster-upload");
const drawingPreview = document.querySelector("#drawing-preview");
const monsterPreview = document.querySelector("#monster-preview");
const convertButton = document.querySelector("#convert-button");
const downloadColoringButton = document.querySelector("#download-coloring");
const converterStatus = document.querySelector("#converter-status");
const converterNote = document.querySelector("#converter-note");
const uploadError = document.querySelector("#upload-error");
const uploadTitle = document.querySelector(".upload-drop strong");
const uploadMeta = document.querySelector(".upload-drop small");
const flowSteps = [...document.querySelectorAll(".converter-flow li")];
const storybookInterestButton = document.querySelector("#storybook-interest");
const storybookInterestForm = document.querySelector("#storybook-interest-form");
const interestEmail = document.querySelector("#interest-email");
const interestStatus = document.querySelector("#interest-status");

const allowedUploadTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxUploadBytes = 8 * 1024 * 1024;
const demoMonsterImage = "assets/step-2-character.jpg?v=20260515-horns";
let drawingPreviewUrl;
let selectedDrawingFile;
let coloringPageUrl;

if (monsterUpload && drawingPreview && monsterPreview && convertButton) {
  monsterUpload.addEventListener("change", () => {
    const [file] = monsterUpload.files;

    if (!file) {
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
    coloringPageUrl = undefined;
    drawingPreview.src = drawingPreviewUrl;
    drawingPreview.alt = "Uploaded child monster drawing.";
    convertButton.disabled = false;
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
  });

  convertButton.addEventListener("click", async () => {
    if (!selectedDrawingFile) {
      return;
    }

    convertButton.disabled = true;
    convertButton.textContent = "Creating...";

    if (converterStatus) {
      converterStatus.textContent = "Creating monster preview...";
    }

    if (converterNote) {
      converterNote.textContent = "This usually takes a short moment. The free coloring page unlocks when the preview is ready.";
    }

    try {
      const drawing = await prepareImageForUpload(selectedDrawingFile);
      const result = await convertMonster(drawing);
      const isDemo = result.mode === "demo";

      monsterPreview.src = result.monsterImage || demoMonsterImage;
      monsterPreview.alt = isDemo
        ? "Demo generated monster character preview."
        : "Generated monster character preview.";
      coloringPageUrl = result.coloringPage;

      if (downloadColoringButton) {
        downloadColoringButton.disabled = false;
      }

      setConverterStage("download");

      if (converterStatus) {
        converterStatus.textContent = isDemo
          ? "Demo monster preview ready."
          : "Monster preview ready.";
      }

      if (converterNote) {
        converterNote.textContent = isDemo
          ? "The AI route is ready, but the API key is not configured here yet. The free coloring-page download still works as a prototype."
          : "Download the free coloring page, or create a paid printed storybook when ready.";
      }
    } catch (error) {
      console.error(error);
      showDemoMonster();
    } finally {
      convertButton.disabled = false;
      convertButton.textContent = "Create Monster";
    }
  });

  if (downloadColoringButton) {
    downloadColoringButton.addEventListener("click", async () => {
      downloadColoringButton.disabled = true;
      downloadColoringButton.textContent = "Preparing...";

      try {
        if (coloringPageUrl) {
          downloadImage(coloringPageUrl, "monstersnow-coloring-page.png");
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

    localStorage.setItem("monstersnow_storybook_interest", email);

    if (interestStatus) {
      interestStatus.textContent = "Thanks. Storybook ordering is coming soon.";
    }

    window.location.href = `mailto:hello@monstersnow.com?subject=${encodeURIComponent(
      "MonstersNOW storybook interest",
    )}&body=${encodeURIComponent(`Please notify me when storybook ordering opens: ${email}`)}`;
  });
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
  coloringPageUrl = undefined;
  monsterUpload.value = "";
  convertButton.disabled = true;

  if (downloadColoringButton) {
    downloadColoringButton.disabled = true;
  }

  if (uploadTitle) {
    uploadTitle.textContent = "Upload or take a picture";
  }

  if (uploadMeta) {
    uploadMeta.textContent = "PNG, JPG, WebP, or GIF under 8 MB";
  }

  setConverterStage("upload");
}

function showUploadError(message) {
  if (!uploadError) {
    return;
  }

  uploadError.textContent = message;
  uploadError.hidden = !message;
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

async function convertMonster(drawing) {
  const response = await fetch("/api/convert-monster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ drawing }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not create monster preview.");
  }

  return result;
}

function showDemoMonster() {
  monsterPreview.src = demoMonsterImage;
  monsterPreview.alt = "Demo generated monster character preview.";
  coloringPageUrl = undefined;
  setConverterStage("download");

  if (downloadColoringButton) {
    downloadColoringButton.disabled = false;
  }

  if (converterStatus) {
    converterStatus.textContent = "Demo monster preview ready.";
  }

  if (converterNote) {
    converterNote.textContent = "The local static server cannot run the AI route. On Vercel, this will call the AI converter after OPENAI_API_KEY is added.";
  }
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
  const scale = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(sourceImage, 0, 0, width, height);

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
      const shouldDrawLine = edge > 42 || grayscale[pixel] < 62;

      if (shouldDrawLine) {
        drawLinePixel(lineData.data, outputIndex);
      }
    }
  }

  context.putImageData(lineData, 0, 0);

  return canvas;
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
  const margin = 92;
  const maxArtWidth = 1320;
  const maxArtHeight = 1440;
  const scale = Math.min(maxArtWidth / lineArt.width, maxArtHeight / lineArt.height);
  const artWidth = Math.round(lineArt.width * scale);
  const artHeight = Math.round(lineArt.height * scale);
  const artX = Math.round((pageWidth - artWidth) / 2);
  const artY = 360;

  page.width = pageWidth;
  page.height = pageHeight;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageWidth, pageHeight);

  drawPrintableBorder(context, pageWidth, pageHeight, margin);
  drawColoringPageLogo(context, margin + 34, margin + 56);

  context.fillStyle = "#161616";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = "700 86px Arial, sans-serif";
  context.fillText("My Monster Coloring Page", pageWidth / 2, 210);

  context.drawImage(lineArt, artX, artY, artWidth, artHeight);

  context.font = "600 34px Arial, sans-serif";
  context.fillText("Turn drawings into storybooks", pageWidth / 2, pageHeight - 138);

  return page;
}

function drawPrintableBorder(context, pageWidth, pageHeight, margin) {
  context.strokeStyle = "#161616";
  context.lineWidth = 6;
  context.strokeRect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);
  context.lineWidth = 2;
  context.strokeRect(
    margin + 22,
    margin + 22,
    pageWidth - (margin + 22) * 2,
    pageHeight - (margin + 22) * 2,
  );
}

function drawColoringPageLogo(context, x, y) {
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = "800 48px Arial, sans-serif";
  context.fillStyle = "#061b3b";
  context.fillText("Monsters", x, y);
  context.fillStyle = "#ff6a00";
  context.fillText("NOW", x + 218, y);
  context.fillStyle = "#061b3b";
  context.font = "700 18px Arial, sans-serif";
  context.fillText("Turn drawings into storybooks", x + 2, y + 30);
  context.restore();
}
