import admin from "firebase-admin";

let initialized = false;

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n")
  });
}

export function getFirebaseAdminDb() {
  try {
    if (!initialized) {
      const credential = buildCredential();
      if (!credential) {
        return null;
      }
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || undefined;
      admin.initializeApp({ credential, storageBucket });
      initialized = true;
    }
    return admin.firestore();
  } catch (error) {
    console.warn("Firebase admin init failed:", error?.message || error);
    return null;
  }
}

export function getFirebaseAdminBucket() {
  try {
    if (!initialized) {
      const db = getFirebaseAdminDb();
      if (!db) {
        return null;
      }
    }
    return admin.storage().bucket();
  } catch (error) {
    console.warn("Firebase bucket init failed:", error?.message || error);
    return null;
  }
}
