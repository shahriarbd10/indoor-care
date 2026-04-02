import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { uploadPlantImage } from "@/lib/cloudinary";
import { PlantScan } from "@/models/PlantScan";

type SaveScanPayload = {
  imageBase64?: string;
  createdAtClient?: string;
  prediction?: {
    name?: string;
    confidence?: number;
    source?: "plantnet" | "plantid";
    description?: string;
    indications?: {
      commonName?: string;
      scientificName?: string;
      family?: string;
      genus?: string;
    };
    alternatives?: Array<{ name: string; confidence: number }>;
  };
  confidenceLevel?: "Low" | "Medium" | "High";
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function estimateBase64DecodedBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return 0;

  const encoded = dataUrl.slice(commaIndex + 1).trim();
  if (!encoded) return 0;

  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
}

function isSupportedImageDataUrl(dataUrl: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parsePaginationParams(request: NextRequest) {
  const url = new URL(request.url);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const limitRaw = Number(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT));

  const page = clampInt(pageRaw, 1, 1000000);
  const limit = clampInt(limitRaw, 1, MAX_LIMIT);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const { page, limit, skip } = parsePaginationParams(request);

    const scans = await PlantScan.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await PlantScan.countDocuments({});
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json(
      {
        scans: scans.map((scan) => ({
          id: String(scan._id),
          plantName: scan.plantName,
          confidence: scan.confidence,
          confidenceLevel: scan.confidenceLevel,
          source: scan.source,
          description: scan.description,
          indications: scan.indications,
          alternatives: scan.alternatives,
          imageUrl: scan.imageUrl,
          createdAt: scan.createdAt,
          createdAtClient: scan.createdAtClient,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "We could not load saved scans right now. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveScanPayload;

    if (!body.imageBase64 || !body.prediction?.name || typeof body.prediction.confidence !== "number") {
      return NextResponse.json({ error: "Invalid scan payload." }, { status: 400 });
    }

    if (!isSupportedImageDataUrl(body.imageBase64)) {
      return NextResponse.json({ error: "Unsupported image format." }, { status: 400 });
    }

    if (estimateBase64DecodedBytes(body.imageBase64) > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Maximum supported size is 4MB." }, { status: 413 });
    }

    const normalizedName = body.prediction.name.trim();
    if (!normalizedName || normalizedName.length > 160) {
      return NextResponse.json({ error: "Plant name is invalid." }, { status: 400 });
    }

    if (!Number.isFinite(body.prediction.confidence) || body.prediction.confidence < 0 || body.prediction.confidence > 1) {
      return NextResponse.json({ error: "Confidence must be between 0 and 1." }, { status: 400 });
    }

    await connectToDatabase();

    const fileKey = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const uploaded = await uploadPlantImage(body.imageBase64, fileKey);

    const saved = await PlantScan.create({
      plantName: normalizedName,
      confidence: body.prediction.confidence,
      confidenceLevel: body.confidenceLevel ?? "Low",
      source: body.prediction.source ?? "plantnet",
      description: body.prediction.description,
      indications: body.prediction.indications,
      alternatives: body.prediction.alternatives ?? [],
      imageUrl: uploaded.secure_url,
      imagePublicId: uploaded.public_id,
      createdAtClient: body.createdAtClient,
    });

    return NextResponse.json(
      {
        id: String(saved._id),
        imageUrl: saved.imageUrl,
        plantName: saved.plantName,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "We could not save this scan right now. Please try again." },
      { status: 500 }
    );
  }
}
