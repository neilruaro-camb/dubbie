import { getFirebaseAdmin, isFirebaseConfigured } from "@dubbie/shared/clients/firebaseAdmin";
import * as fs from "node:fs";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";

const LOCAL_STORAGE_DIR = path.resolve("storage");
const LOCAL_STORAGE_PORT = process.env.PORT || "3333";

function ensureLocalDir(folder: string) {
  const dir = path.join(LOCAL_STORAGE_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function uploadAudioArrayToStorage(
  audio: Uint8Array,
  folder: string
): Promise<string> {
  if (!isFirebaseConfigured()) {
    return uploadAudioArrayLocally(audio, folder);
  }

  console.log("uploading audio");
  const storageRef = getFirebaseAdmin().storage().bucket();

  const id = uuidv4();
  const fileRef = storageRef.file(`${folder}/${id}.mp3`);
  await fileRef.save(Buffer.from(audio), {
    contentType: "audio/mpeg",
    public: true,
  });
  const [url] = await fileRef.getSignedUrl({
    action: "read",
    expires: "03-09-2491",
  });

  console.log("uploaded audio", url);
  return url;
}

export async function uploadFileToStorage(filePath: string, folder: string): Promise<string> {
  if (!isFirebaseConfigured()) {
    return uploadFileLocally(filePath, folder);
  }

  try {
    console.log("uploading file to storage");
    const bucket = getFirebaseAdmin().storage().bucket();
    const originalExtension = path.extname(filePath);
    const randomName = uuidv4() + originalExtension;
    const destination = `${folder}/${randomName}`;

    const contentType = determineContentType(filePath);

    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: contentType,
      },
    });

    const [url] = await bucket.file(destination).getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });

    console.log("File uploaded successfully.");
    return url;
  } catch (error) {
    console.error("Error uploading file to Firebase Storage:", error);
    throw error;
  }
}

// --- Local filesystem fallback ---

async function uploadAudioArrayLocally(audio: Uint8Array, folder: string): Promise<string> {
  const dir = ensureLocalDir(folder);
  const id = uuidv4();
  const fileName = `${id}.mp3`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, Buffer.from(audio));
  const url = `http://localhost:${LOCAL_STORAGE_PORT}/storage/${folder}/${fileName}`;
  console.log("saved audio locally", url);
  return url;
}

async function uploadFileLocally(srcPath: string, folder: string): Promise<string> {
  const dir = ensureLocalDir(folder);
  const originalExtension = path.extname(srcPath);
  const fileName = uuidv4() + originalExtension;
  const destPath = path.join(dir, fileName);
  fs.copyFileSync(srcPath, destPath);
  const url = `http://localhost:${LOCAL_STORAGE_PORT}/storage/${folder}/${fileName}`;
  console.log("saved file locally", url);
  return url;
}

function determineContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".mp4":
      return "video/mp4";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}
