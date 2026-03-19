interface CropOptions {
  aspectRatio: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

async function renderCroppedCanvas(file: File, options: CropOptions) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Não foi possível preparar a pré-visualização da imagem.");
  }

  const imageAspect = image.naturalWidth / image.naturalHeight;
  const baseCropWidth = imageAspect > options.aspectRatio ? image.naturalHeight * options.aspectRatio : image.naturalWidth;
  const baseCropHeight = imageAspect > options.aspectRatio ? image.naturalHeight : image.naturalWidth / options.aspectRatio;

  const zoom = Math.max(1, Math.min(options.zoom, 3));
  const cropWidth = baseCropWidth / zoom;
  const cropHeight = baseCropHeight / zoom;

  const maxOffsetX = Math.max(0, (image.naturalWidth - cropWidth) / 2);
  const maxOffsetY = Math.max(0, (image.naturalHeight - cropHeight) / 2);
  const centerX = image.naturalWidth / 2 + (options.offsetX / 100) * maxOffsetX;
  const centerY = image.naturalHeight / 2 + (options.offsetY / 100) * maxOffsetY;

  const sourceX = Math.min(Math.max(0, centerX - cropWidth / 2), image.naturalWidth - cropWidth);
  const sourceY = Math.min(Math.max(0, centerY - cropHeight / 2), image.naturalHeight - cropHeight);

  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function buildCadastroCropPreview(file: File, options: CropOptions) {
  const canvas = await renderCroppedCanvas(file, options);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function buildCadastroCroppedFile(file: File, options: CropOptions) {
  const canvas = await renderCroppedCanvas(file, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) {
    throw new Error("Não foi possível gerar a imagem recortada.");
  }

  const filename = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], filename, { type: "image/jpeg" });
}
