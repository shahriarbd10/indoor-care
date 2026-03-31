import { v2 as cloudinary } from "cloudinary";

let configured = false;

function ensureConfigured() {
  if (configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
}

export async function uploadPlantImage(imageBase64: string, fileKey: string) {
  ensureConfigured();

  return cloudinary.uploader.upload(imageBase64, {
    folder: "indoor-care/scans",
    public_id: fileKey,
    overwrite: false,
    resource_type: "image",
    transformation: [
      { width: 1024, height: 1024, crop: "limit" },
      { quality: "auto:good", fetch_format: "auto" },
    ],
  });
}
