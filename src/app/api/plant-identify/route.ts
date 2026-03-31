import { NextRequest, NextResponse } from "next/server";

type NormalizedResult = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  description?: string;
  indications?: {
    commonName?: string;
    scientificName?: string;
    family?: string;
    genus?: string;
  };
  alternatives: Array<{ name: string; confidence: number }>;
};

type ProviderResult = {
  ok: boolean;
  result?: NormalizedResult;
  error?: string;
};

const MODERATE_CONFIDENCE_THRESHOLD = Number(process.env.PLANT_CONFIDENCE_THRESHOLD ?? "0.4");
const MIN_ALTERNATIVE_CONFIDENCE = 0.2;

function decodeDataUrl(input: string): Buffer | null {
  const commaIndex = input.indexOf(",");
  if (commaIndex < 0) return null;

  const encoded = input.slice(commaIndex + 1).trim();
  if (!encoded) return null;

  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return null;
  }
}

async function identifyWithPlantnet(imageBuffer: Buffer): Promise<ProviderResult> {
  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) return { ok: false, error: "PLANTNET_API_KEY is not configured." };

  const formData = new FormData();
  const imageBlob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
  formData.append("images", imageBlob, "capture.jpg");
  formData.append("organs", "leaf");

  const endpoint = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as {
    results?: Array<{
      score?: number;
      species?: {
        scientificNameWithoutAuthor?: string;
        commonNames?: string[];
        family?: {
          scientificNameWithoutAuthor?: string;
        };
        genus?: {
          scientificNameWithoutAuthor?: string;
        };
      };
    }>;
    message?: string;
  };

  if (!response.ok) {
    return { ok: false, error: payload.message ?? "Pl@ntNet request failed." };
  }

  const ranked = (payload.results ?? [])
    .map((item) => {
      const allCommons = (item.species?.commonNames ?? []).filter(Boolean);
      const commonName = allCommons[0]?.trim();
      const scientificName = item.species?.scientificNameWithoutAuthor?.trim();

      return {
        name: commonName || scientificName || "Unknown plant",
        confidence: Number(item.score ?? 0),
        allCommons: allCommons.slice(0, 3).join(", "),
      };
    })
    .filter((item) => item.name && Number.isFinite(item.confidence))
    .sort((a, b) => b.confidence - a.confidence);

  if (ranked.length === 0) {
    return { ok: false, error: "No confident match from Pl@ntNet." };
  }

  const bestResult = payload.results?.[0];
  const indications = {
    commonName: ranked[0].allCommons || bestResult?.species?.commonNames?.[0]?.trim(),
    scientificName: bestResult?.species?.scientificNameWithoutAuthor?.trim(),
    family: bestResult?.species?.family?.scientificNameWithoutAuthor?.trim(),
    genus: bestResult?.species?.genus?.scientificNameWithoutAuthor?.trim(),
  };

  return {
    ok: true,
    result: {
      name: ranked[0].name,
      confidence: ranked[0].confidence,
      source: "plantnet",
      indications,
      alternatives: ranked.filter((item) => item.confidence >= MIN_ALTERNATIVE_CONFIDENCE).slice(1, 5),
    },
  };
}

async function identifyWithPlantId(imageDataUrl: string): Promise<ProviderResult> {
  const apiKey = process.env.PLANT_ID_API_KEY;
  if (!apiKey) return { ok: false, error: "PLANT_ID_API_KEY is not configured." };

  const cleanBase64 = imageDataUrl.split(",")[1];
  if (!cleanBase64) return { ok: false, error: "Invalid fallback image payload." };

  const response = await fetch("https://api.plant.id/v2/identify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
    },
    body: JSON.stringify({
      images: [cleanBase64],
      modifiers: ["similar_images"],
      plant_language: "en",
      plant_details: ["common_names", "url", "wiki_description"],
    }),
  });

  const payload = (await response.json()) as {
    suggestions?: Array<{
      plant_name?: string;
      probability?: number;
      plant_details?: {
        wiki_description?: {
          value?: string;
        };
      };
    }>;
    message?: string;
  };

  if (!response.ok) {
    return { ok: false, error: payload.message ?? "Plant.id request failed." };
  }

  const ranked = (payload.suggestions ?? [])
    .map((item) => ({
      name: (item.plant_name ?? "Unknown plant").trim(),
      confidence: Number(item.probability ?? 0),
    }))
    .filter((item) => item.name && Number.isFinite(item.confidence))
    .sort((a, b) => b.confidence - a.confidence);

  if (ranked.length === 0) {
    return { ok: false, error: "No confident match from Plant.id." };
  }

  return {
    ok: true,
    result: {
      name: ranked[0].name,
      confidence: ranked[0].confidence,
      source: "plantid",
      description: payload.suggestions?.[0]?.plant_details?.wiki_description?.value,
      alternatives: ranked.filter((item) => item.confidence >= MIN_ALTERNATIVE_CONFIDENCE).slice(1, 5),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { imageBase64?: string };
    const imageBase64 = body.imageBase64;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "imageBase64 is required." }, { status: 400 });
    }

    const imageBuffer = decodeDataUrl(imageBase64);
    if (!imageBuffer) {
      return NextResponse.json({ error: "Invalid image data URL." }, { status: 400 });
    }

    const primary = await identifyWithPlantnet(imageBuffer);
    if (primary.ok && primary.result && primary.result.confidence >= MODERATE_CONFIDENCE_THRESHOLD) {
      return NextResponse.json(primary.result, { status: 200 });
    }

    const fallback = await identifyWithPlantId(imageBase64);
    if (fallback.ok && fallback.result) {
      return NextResponse.json(fallback.result, { status: 200 });
    }

    if (primary.ok && primary.result) {
      return NextResponse.json(primary.result, { status: 200 });
    }

    return NextResponse.json(
      {
        error: fallback.error ?? primary.error ?? "No result from providers.",
      },
      { status: 502 }
    );
  } catch {
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
