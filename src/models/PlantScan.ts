import { Schema, model, models } from "mongoose";

const AlternativeSchema = new Schema(
  {
    name: { type: String, required: true },
    confidence: { type: Number, required: true },
  },
  { _id: false }
);

const PlantIndicationsSchema = new Schema(
  {
    commonName: { type: String },
    scientificName: { type: String },
    family: { type: String },
    genus: { type: String },
  },
  { _id: false }
);

const PlantScanSchema = new Schema(
  {
    plantName: { type: String, required: true },
    confidence: { type: Number, required: true },
    confidenceLevel: { type: String, enum: ["Low", "Medium", "High"], required: true },
    source: { type: String, enum: ["plantnet", "plantid"], required: true },
    description: { type: String },
    indications: { type: PlantIndicationsSchema },
    alternatives: { type: [AlternativeSchema], default: [] },
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String, required: true, unique: true, index: true },
    createdAtClient: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const PlantScan = models.PlantScan || model("PlantScan", PlantScanSchema);
