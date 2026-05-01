import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { getFirebaseAdminBucket, getFirebaseAdminDb } from "../services/firebaseAdmin.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "Admin@56789";

function requireBasicAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="AI School Admin"');
    res.status(401).send("Authentication required.");
    return;
  }

  try {
    const raw = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const [username, password] = raw.split(":");
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      next();
      return;
    }
  } catch {
    // fallthrough
  }
  res.set("WWW-Authenticate", 'Basic realm="AI School Admin"');
  res.status(401).send("Invalid credentials.");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parsePreferences(input) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function uploadToStorage(file, folder) {
  if (!file) {
    return "";
  }
  const bucket = getFirebaseAdminBucket();
  if (!bucket) {
    throw new Error("Firebase Storage is not configured.");
  }
  const ext = file.originalname.includes(".") ? file.originalname.split(".").pop() : "bin";
  const safeExt = String(ext || "bin").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
  const token = crypto.randomUUID();
  const storageFile = bucket.file(path);

  await storageFile.save(file.buffer, {
    resumable: false,
    metadata: {
      contentType: file.mimetype || "application/octet-stream",
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  const bucketName = bucket.name;
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function loadAdminCourses() {
  const db = getFirebaseAdminDb();
  if (!db) {
    return { error: "Firebase Admin is not configured on backend. Set FIREBASE_* env vars.", courses: [] };
  }

  const snapshot = await db.collection("courses").orderBy("order", "asc").get();
  const courses = await Promise.all(
    snapshot.docs.map(async (courseDoc) => {
      const data = courseDoc.data() || {};
      const chaptersSnap = await db
        .collection("courses")
        .doc(courseDoc.id)
        .collection("chapters")
        .orderBy("order", "asc")
        .get();
      const chapters = chaptersSnap.docs.map((chapterDoc) => {
        const chapter = chapterDoc.data() || {};
        return {
          id: chapterDoc.id,
          name: chapter.name || "",
          shortDescription: chapter.shortDescription || "",
          imageUrl: chapter.imageUrl || "",
          transcript: chapter.transcript || "",
          voiceUrl: chapter.voiceUrl || "",
          order: Number(chapter.order || 0)
        };
      });
      return {
        id: courseDoc.id,
        title: data.title || "",
        shortDescription: data.shortDescription || "",
        preferences: Array.isArray(data.preferences) ? data.preferences : [],
        imageUrl: data.imageUrl || "",
        order: Number(data.order || 0),
        chapters
      };
    })
  );

  return { error: "", courses };
}

function renderAdminPage({ error = "", ok = "", courses = [] }) {
  const listHtml = courses
    .map((course) => {
      const chapters = course.chapters
        .map(
          (chapter) => `
            <div style="border:1px solid #2e3a52;border-radius:10px;padding:12px;margin-top:10px;">
              <form method="post" action="/admin/courses/${esc(course.id)}/chapters/${esc(chapter.id)}/update" enctype="multipart/form-data" style="display:grid;gap:8px;">
                <strong>Chapter: ${esc(chapter.name)}</strong>
                <input name="name" value="${esc(chapter.name)}" placeholder="Chapter name" required />
                <input name="shortDescription" value="${esc(chapter.shortDescription)}" placeholder="Short description" />
                <input name="order" type="number" value="${esc(chapter.order)}" placeholder="Order" />
                <textarea name="transcript" rows="4" placeholder="Transcript">${esc(chapter.transcript)}</textarea>
                <input name="imageUrl" value="${esc(chapter.imageUrl)}" placeholder="Image URL (optional)" />
                <input name="voiceUrl" value="${esc(chapter.voiceUrl)}" placeholder="Voice MP3 URL (optional)" />
                <label>Upload chapter image <input type="file" name="chapterImage" accept="image/*" /></label>
                <label>Upload chapter voice mp3 <input type="file" name="chapterVoice" accept="audio/*" /></label>
                <div style="display:flex;gap:8px;">
                  <button type="submit">Update Chapter</button>
                </div>
              </form>
              <form method="post" action="/admin/courses/${esc(course.id)}/chapters/${esc(chapter.id)}/delete" style="margin-top:8px;">
                <button type="submit" style="background:#7f1d1d;color:#fff;">Delete Chapter</button>
              </form>
            </div>
          `
        )
        .join("");

      return `
        <section style="border:1px solid #334155;border-radius:14px;padding:16px;margin-top:16px;background:#111827;">
          <h3 style="margin:0 0 10px 0;">${esc(course.title)} (${esc(course.id)})</h3>
          <form method="post" action="/admin/courses/${esc(course.id)}/update" enctype="multipart/form-data" style="display:grid;gap:8px;">
            <input name="title" value="${esc(course.title)}" placeholder="Course title" required />
            <input name="shortDescription" value="${esc(course.shortDescription)}" placeholder="Short description" />
            <input name="preferences" value="${esc(course.preferences.join(", "))}" placeholder="Preferences comma separated" />
            <input name="order" type="number" value="${esc(course.order)}" placeholder="Order" />
            <input name="imageUrl" value="${esc(course.imageUrl)}" placeholder="Course image URL (optional)" />
            <label>Upload course image <input type="file" name="courseImage" accept="image/*" /></label>
            <button type="submit">Update Course</button>
          </form>
          <form method="post" action="/admin/courses/${esc(course.id)}/delete" style="margin-top:8px;">
            <button type="submit" style="background:#7f1d1d;color:#fff;">Delete Course</button>
          </form>
          <div style="margin-top:10px;">
            <strong>Add chapter</strong>
            <form method="post" action="/admin/courses/${esc(course.id)}/chapters/create" enctype="multipart/form-data" style="display:grid;gap:8px;margin-top:8px;">
              <input name="id" placeholder="Chapter ID (e.g. ch-1)" required />
              <input name="name" placeholder="Chapter name" required />
              <input name="shortDescription" placeholder="Short description" />
              <input name="order" type="number" placeholder="Order" />
              <textarea name="transcript" rows="3" placeholder="Transcript"></textarea>
              <input name="imageUrl" placeholder="Image URL (optional)" />
              <input name="voiceUrl" placeholder="Voice URL MP3 (optional)" />
              <label>Upload chapter image <input type="file" name="chapterImage" accept="image/*" /></label>
              <label>Upload chapter voice mp3 <input type="file" name="chapterVoice" accept="audio/*" /></label>
              <button type="submit">Create Chapter</button>
            </form>
          </div>
          ${chapters}
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AI School Admin</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; background:#020617; color:#e2e8f0; margin:0; padding:20px; }
          input, textarea, button { font: inherit; padding:10px; border-radius:8px; border:1px solid #334155; background:#0b1220; color:#e2e8f0; }
          button { cursor:pointer; background:#0891b2; border:none; color:#001018; font-weight:600; }
          a { color:#67e8f9; }
          .msg { padding:10px; border-radius:8px; margin-bottom:12px; }
          .ok { background:#14532d; }
          .err { background:#7f1d1d; }
        </style>
      </head>
      <body>
        <h1>AI School Admin</h1>
        <p>Basic Auth protected CRUD for courses + chapters (Firestore + Firebase Storage uploads).</p>
        ${ok ? `<div class="msg ok">${esc(ok)}</div>` : ""}
        ${error ? `<div class="msg err">${esc(error)}</div>` : ""}

        <section style="border:1px solid #334155;border-radius:14px;padding:16px;background:#111827;">
          <h2 style="margin-top:0;">Create Course</h2>
          <form method="post" action="/admin/courses/create" enctype="multipart/form-data" style="display:grid;gap:8px;">
            <input name="id" placeholder="Course ID (e.g. course-devops-101)" required />
            <input name="title" placeholder="Title" required />
            <input name="shortDescription" placeholder="Short description" />
            <input name="preferences" placeholder="Preferences comma separated e.g. AI, DevOps" />
            <input name="order" type="number" placeholder="Order" />
            <input name="imageUrl" placeholder="Image URL (optional)" />
            <label>Upload course image <input type="file" name="courseImage" accept="image/*" /></label>
            <button type="submit">Create Course</button>
          </form>
        </section>

        ${listHtml}
      </body>
    </html>
  `;
}

async function render(req, res, { error = "", ok = "" } = {}) {
  const data = await loadAdminCourses();
  res.status(200).send(renderAdminPage({ error: error || data.error, ok, courses: data.courses }));
}

router.use(requireBasicAuth);

router.get("/", async (req, res) => {
  await render(req, res);
});

router.post("/courses/create", upload.single("courseImage"), async (req, res) => {
  try {
    const db = getFirebaseAdminDb();
    if (!db) throw new Error("Firebase Admin is not configured.");
    const id = String(req.body.id || "").trim();
    if (!id) throw new Error("Course ID is required.");

    const uploadedImage = await uploadToStorage(req.file, `courses/${id}`);
    await db
      .collection("courses")
      .doc(id)
      .set(
        {
          id,
          title: String(req.body.title || "").trim(),
          shortDescription: String(req.body.shortDescription || "").trim(),
          preferences: parsePreferences(req.body.preferences),
          order: Number(req.body.order || 0),
          imageUrl: uploadedImage || String(req.body.imageUrl || "").trim(),
          updatedAt: new Date()
        },
        { merge: true }
      );
    await render(req, res, { ok: `Course ${id} created.` });
  } catch (error) {
    await render(req, res, { error: String(error?.message || error) });
  }
});

router.post("/courses/:courseId/update", upload.single("courseImage"), async (req, res) => {
  try {
    const db = getFirebaseAdminDb();
    if (!db) throw new Error("Firebase Admin is not configured.");
    const courseId = String(req.params.courseId || "").trim();
    const uploadedImage = await uploadToStorage(req.file, `courses/${courseId}`);
    await db
      .collection("courses")
      .doc(courseId)
      .set(
        {
          id: courseId,
          title: String(req.body.title || "").trim(),
          shortDescription: String(req.body.shortDescription || "").trim(),
          preferences: parsePreferences(req.body.preferences),
          order: Number(req.body.order || 0),
          imageUrl: uploadedImage || String(req.body.imageUrl || "").trim(),
          updatedAt: new Date()
        },
        { merge: true }
      );
    await render(req, res, { ok: `Course ${courseId} updated.` });
  } catch (error) {
    await render(req, res, { error: String(error?.message || error) });
  }
});

router.post("/courses/:courseId/delete", async (req, res) => {
  try {
    const db = getFirebaseAdminDb();
    if (!db) throw new Error("Firebase Admin is not configured.");
    const courseId = String(req.params.courseId || "").trim();
    const chaptersSnap = await db.collection("courses").doc(courseId).collection("chapters").get();
    await Promise.all(chaptersSnap.docs.map((docSnap) => docSnap.ref.delete()));
    await db.collection("courses").doc(courseId).delete();
    await render(req, res, { ok: `Course ${courseId} deleted.` });
  } catch (error) {
    await render(req, res, { error: String(error?.message || error) });
  }
});

router.post(
  "/courses/:courseId/chapters/create",
  upload.fields([
    { name: "chapterImage", maxCount: 1 },
    { name: "chapterVoice", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const db = getFirebaseAdminDb();
      if (!db) throw new Error("Firebase Admin is not configured.");
      const courseId = String(req.params.courseId || "").trim();
      const chapterId = String(req.body.id || "").trim();
      if (!chapterId) throw new Error("Chapter ID is required.");
      const imageFile = req.files?.chapterImage?.[0];
      const voiceFile = req.files?.chapterVoice?.[0];
      const uploadedImage = await uploadToStorage(imageFile, `courses/${courseId}/chapters/${chapterId}/images`);
      const uploadedVoice = await uploadToStorage(voiceFile, `courses/${courseId}/chapters/${chapterId}/voice`);
      await db
        .collection("courses")
        .doc(courseId)
        .collection("chapters")
        .doc(chapterId)
        .set(
          {
            id: chapterId,
            name: String(req.body.name || "").trim(),
            shortDescription: String(req.body.shortDescription || "").trim(),
            transcript: String(req.body.transcript || "").trim(),
            imageUrl: uploadedImage || String(req.body.imageUrl || "").trim(),
            voiceUrl: uploadedVoice || String(req.body.voiceUrl || "").trim(),
            order: Number(req.body.order || 0),
            updatedAt: new Date()
          },
          { merge: true }
        );
      await render(req, res, { ok: `Chapter ${chapterId} created.` });
    } catch (error) {
      await render(req, res, { error: String(error?.message || error) });
    }
  }
);

router.post(
  "/courses/:courseId/chapters/:chapterId/update",
  upload.fields([
    { name: "chapterImage", maxCount: 1 },
    { name: "chapterVoice", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const db = getFirebaseAdminDb();
      if (!db) throw new Error("Firebase Admin is not configured.");
      const courseId = String(req.params.courseId || "").trim();
      const chapterId = String(req.params.chapterId || "").trim();
      const imageFile = req.files?.chapterImage?.[0];
      const voiceFile = req.files?.chapterVoice?.[0];
      const uploadedImage = await uploadToStorage(imageFile, `courses/${courseId}/chapters/${chapterId}/images`);
      const uploadedVoice = await uploadToStorage(voiceFile, `courses/${courseId}/chapters/${chapterId}/voice`);
      await db
        .collection("courses")
        .doc(courseId)
        .collection("chapters")
        .doc(chapterId)
        .set(
          {
            id: chapterId,
            name: String(req.body.name || "").trim(),
            shortDescription: String(req.body.shortDescription || "").trim(),
            transcript: String(req.body.transcript || "").trim(),
            imageUrl: uploadedImage || String(req.body.imageUrl || "").trim(),
            voiceUrl: uploadedVoice || String(req.body.voiceUrl || "").trim(),
            order: Number(req.body.order || 0),
            updatedAt: new Date()
          },
          { merge: true }
        );
      await render(req, res, { ok: `Chapter ${chapterId} updated.` });
    } catch (error) {
      await render(req, res, { error: String(error?.message || error) });
    }
  }
);

router.post("/courses/:courseId/chapters/:chapterId/delete", async (req, res) => {
  try {
    const db = getFirebaseAdminDb();
    if (!db) throw new Error("Firebase Admin is not configured.");
    const courseId = String(req.params.courseId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    await db.collection("courses").doc(courseId).collection("chapters").doc(chapterId).delete();
    await render(req, res, { ok: `Chapter ${chapterId} deleted.` });
  } catch (error) {
    await render(req, res, { error: String(error?.message || error) });
  }
});

export default router;
