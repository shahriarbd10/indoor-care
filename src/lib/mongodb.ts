import mongoose from "mongoose";

declare global {
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!global.__mongooseConnPromise) {
    global.__mongooseConnPromise = mongoose.connect(uri, {
      maxPoolSize: 12,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      dbName: process.env.MONGODB_DB_NAME ?? "indoor-care",
    });
  }

  return global.__mongooseConnPromise;
}
