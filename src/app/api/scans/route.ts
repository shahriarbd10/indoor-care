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
    alternatives?: Array<{ name: string; confidence: number }>;
  };
  confidenceLevel?: "Low" | "Medium" | "High";
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveScanPayload;

    if (!body.imageBase64 || !body.prediction?.name || typeof body.prediction.confidence !== "number") {
      return NextResponse.json({ error: "Invalid scan payload." }, { status: 400 });
    }

    await connectToDatabase();

    const fileKey = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const uploaded = await uploadPlantImage(body.imageBase64, fileKey);

    const saved = await PlantScan.create({
      plantName: body.prediction.name,
      confidence: body.prediction.confidence,
      confidenceLevel: body.confidenceLevel ?? "Low",
      source: body.prediction.source ?? "plantnet",
      description: body.prediction.description,
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
