import admin from "firebase-admin";

let initialized = false;

export function getFirebaseAdmin() {
  if (!initialized) {
    if (!process.env.FIREBASE_PROJECT_ID) {
      throw new Error("Firebase credentials not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
    }
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
        storageBucket: "dubbie-studio.appspot.com",
      });
    }
    initialized = true;
  }
  return admin;
}

export const isFirebaseConfigured = () => !!process.env.FIREBASE_PROJECT_ID;

export default admin;
