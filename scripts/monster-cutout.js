(function attachMonsterCutout(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MonstersNowCutout = api;
})(typeof window !== "undefined" ? window : globalThis, function createMonsterCutout() {
  const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));

  function averageCornerColor(data, width, height) {
    const corners = [0, width - 1, (height - 1) * width, width * height - 1];
    const opaque = corners.filter((pixel) => data[pixel * 4 + 3] > 0);
    const count = Math.max(1, opaque.length);
    return opaque.reduce((color, pixel) => {
      const offset = pixel * 4;
      color.red += data[offset] / count;
      color.green += data[offset + 1] / count;
      color.blue += data[offset + 2] / count;
      return color;
    }, { red: opaque.length ? 0 : 255, green: opaque.length ? 0 : 255, blue: opaque.length ? 0 : 255 });
  }

  function refineConnectedBackground(imageData, width, height) {
    const data = imageData.data || imageData;
    const pixelCount = width * height;
    const background = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    const cornerColor = averageCornerColor(data, width, height);
    let head = 0;
    let tail = 0;

    const matchesBackground = (pixel, seed = false) => {
      const offset = pixel * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (data[offset + 3] === 0) return true;
      const darkest = Math.min(red, green, blue);
      const chroma = Math.max(red, green, blue) - darkest;
      const distance = Math.hypot(red - cornerColor.red, green - cornerColor.green, blue - cornerColor.blue);
      return (darkest > 224 && chroma < 46) || distance < (seed ? 58 : 86) || (!seed && darkest > 184 && chroma < 38);
    };
    const enqueue = (pixel, seed = false) => {
      if (pixel < 0 || pixel >= pixelCount || background[pixel] || !matchesBackground(pixel, seed)) return;
      background[pixel] = 1;
      queue[tail++] = pixel;
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x, true);
      enqueue((height - 1) * width + x, true);
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(y * width, true);
      enqueue(y * width + width - 1, true);
    }
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      if (x > 0) enqueue(pixel - 1);
      if (x < width - 1) enqueue(pixel + 1);
      if (pixel >= width) enqueue(pixel - width);
      if (pixel < pixelCount - width) enqueue(pixel + width);
    }

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (background[pixel]) data[pixel * 4 + 3] = 0;
    }

    const edgeRing = new Uint8Array(pixelCount);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (background[pixel]) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let nearY = Math.max(0, y - 1); nearY <= Math.min(height - 1, y + 1); nearY += 1) {
        for (let nearX = Math.max(0, x - 1); nearX <= Math.min(width - 1, x + 1); nearX += 1) {
          if (background[nearY * width + nearX]) edgeRing[pixel] = 1;
        }
      }
    }

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (!edgeRing[pixel]) continue;
      const offset = pixel * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const darkest = Math.min(red, green, blue);
      const chroma = Math.max(red, green, blue) - darkest;
      const distance = Math.hypot(red - cornerColor.red, green - cornerColor.green, blue - cornerColor.blue);
      const likelyBackdropBlend = distance < 150 || (darkest > 158 && chroma < 72);
      if (!likelyBackdropBlend) continue;

      const originalAlpha = data[offset + 3] / 255;
      const retainedCoverage = Math.max(.54, Math.min(.9, .54 + distance / 420));
      const compositeAlpha = Math.max(.05, retainedCoverage);
      data[offset] = clampChannel((red - (1 - compositeAlpha) * cornerColor.red) / compositeAlpha);
      data[offset + 1] = clampChannel((green - (1 - compositeAlpha) * cornerColor.green) / compositeAlpha);
      data[offset + 2] = clampChannel((blue - (1 - compositeAlpha) * cornerColor.blue) / compositeAlpha);
      data[offset + 3] = clampChannel(255 * originalAlpha * retainedCoverage);
    }

    return { data, background, cornerColor };
  }

  function removeConnectedBackground(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { willReadFrequently: true });
          canvas.width = width;
          canvas.height = height;
          context.drawImage(image, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height);
          refineConnectedBackground(pixels, width, height);
          context.putImageData(pixels, 0, 0);
          resolve(canvas.toDataURL("image/webp", .92));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = reject;
      image.src = source;
    });
  }

  return { averageCornerColor, refineConnectedBackground, removeConnectedBackground };
});
