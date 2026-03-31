import { type FileMetadata } from "@google-cloud/storage";
import { getFirebaseAdmin } from "../clients/firebaseAdmin";

export async function getFirebaseFileMetadata(
  fileUrl: string,
): Promise<FileMetadata> {
  const bucket = getFirebaseAdmin().storage().bucket();
  const urlParts = fileUrl.split("/");
  const path = decodeURIComponent(urlParts[urlParts.length - 1].split("?")[0]);
  const file = bucket.file(path);
  const [metadata] = await file.getMetadata();
  console.log("metadata", metadata);
  return metadata;
}
