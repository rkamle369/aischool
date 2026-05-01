import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { getFirebaseAdminDb } from "../services/firebaseAdmin.js";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coursesPath = path.join(__dirname, "../data/courses.json");

async function loadCoursesFromFirestore(preferences = []) {
  const db = getFirebaseAdminDb();
  if (!db) {
    return null;
  }

  let query = db.collection("courses");
  if (preferences.length) {
    query = query.where("preferences", "array-contains-any", preferences.slice(0, 10));
  }
  query = query.orderBy("order", "asc");
  const snapshot = await query.get();

  const courses = await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() || {};
      let chapters = Array.isArray(data.chapters) ? data.chapters : [];
      if (!chapters.length) {
        const chaptersSnap = await db
          .collection("courses")
          .doc(docSnap.id)
          .collection("chapters")
          .orderBy("order", "asc")
          .get();
        chapters = chaptersSnap.docs.map((chapterDoc) => {
          const chapterData = chapterDoc.data() || {};
          return {
            id: chapterData.id || chapterDoc.id,
            name: chapterData.name || chapterData.title || "Chapter",
            shortDescription: chapterData.shortDescription || "",
            imageUrl: chapterData.imageUrl || chapterData.image || "",
            transcript: chapterData.transcript || "",
            voiceUrl: chapterData.voiceUrl || chapterData.audioUrl || "",
            order: Number(chapterData.order || 0)
          };
        });
      }

      return {
        id: data.id || docSnap.id,
        title: data.title || "Untitled course",
        shortDescription: data.shortDescription || data.description || "",
        preferences: data.preferences || [],
        chapters: chapters
          .map((chapter, index) => ({
            id: chapter.id || `chapter-${index + 1}`,
            name: chapter.name || chapter.title || `Chapter ${index + 1}`,
            shortDescription: chapter.shortDescription || "",
            imageUrl: chapter.imageUrl || chapter.image || "",
            transcript: chapter.transcript || "",
            voiceUrl: chapter.voiceUrl || chapter.audioUrl || "",
            order: Number(chapter.order || index)
          }))
          .sort((a, b) => a.order - b.order)
      };
    })
  );

  return { courses };
}

function loadCoursesFromFile(preferences = []) {
  const file = fs.readFileSync(coursesPath, "utf-8");
  const raw = JSON.parse(file);
  const sourceCourses = raw.courses || [];
  const mappedCourses = sourceCourses.map((course, index) => {
    const chapters = (course.subjects || []).flatMap((subject) =>
      (subject.chapters || []).map((chapter, chapterIndex) => ({
        id: chapter.id || `${course.id || index}-${chapterIndex}`,
        name: chapter.title || chapter.name || `Chapter ${chapterIndex + 1}`,
        shortDescription: chapter.summary || chapter.shortDescription || "",
        imageUrl: chapter.imageUrl || chapter.image || "",
        transcript: chapter.content || chapter.transcript || chapter.summary || "",
        voiceUrl: chapter.voiceUrl || chapter.audioUrl || "",
        order: chapterIndex
      }))
    );

    return {
      id: course.id || `course-${index + 1}`,
      title: course.title || `Course ${index + 1}`,
      shortDescription: course.description || "",
      preferences: course.preferences || [],
      chapters
    };
  });

  const normalizedPrefs = preferences.map((item) => item.toLowerCase());
  const filtered = normalizedPrefs.length
    ? mappedCourses.filter((course) =>
        (course.preferences || []).some((pref) => normalizedPrefs.includes(String(pref).toLowerCase()))
      )
    : mappedCourses;

  return { courses: filtered };
}

router.get("/", async (req, res) => {
  try {
    const preferences = String(req.query.preferences || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const firestoreCourses = await loadCoursesFromFirestore(preferences);
    if (firestoreCourses) {
      res.json(firestoreCourses);
      return;
    }

    res.json(loadCoursesFromFile(preferences));
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error || "Failed to load courses") });
  }
});

export default router;
