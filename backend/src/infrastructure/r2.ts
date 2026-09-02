import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./environment.js";

let client: S3Client | undefined;

function r2() {
  if (!client) client = new S3Client({
    region: "auto",
    endpoint: env("R2_ENDPOINT"),
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  });
  return client;
}

export async function uploadToR2(key: string, bytes: Buffer, contentType?: string) {
  await r2().send(new PutObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: key, Body: bytes, ContentType: contentType ?? "application/octet-stream" }));
}

export async function downloadFromR2(key: string) {
  const result = await r2().send(new GetObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: key }));
  if (!result.Body) throw new Error("File not found");
  return Buffer.from(await result.Body.transformToByteArray());
}
