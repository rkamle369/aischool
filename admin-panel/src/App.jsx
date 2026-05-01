import { useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { allowedAdminEmails, auth, db, googleProvider, hasFirebaseConfig, storage } from "./firebase";

function parsePreferences(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function uploadFile(file, pathPrefix) {
  if (!file) return "";
  const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const storageRef = ref(storage, `${pathPrefix}/${safeName}`);
  await uploadBytes(storageRef, file, { contentType: file.type || undefined });
  return getDownloadURL(storageRef);
}

async function fetchCourses() {
  const coursesSnap = await getDocs(query(collection(db, "courses"), orderBy("order", "asc")));
  const courses = await Promise.all(
    coursesSnap.docs.map(async (courseDoc) => {
      const data = courseDoc.data() || {};
      const chaptersSnap = await getDocs(
        query(collection(db, "courses", courseDoc.id, "chapters"), orderBy("order", "asc"))
      );
      return {
        id: data.id || courseDoc.id,
        title: data.title || "",
        shortDescription: data.shortDescription || "",
        preferences: Array.isArray(data.preferences) ? data.preferences : [],
        imageUrl: data.imageUrl || "",
        order: Number(data.order || 0),
        chapters: chaptersSnap.docs.map((chapterDoc) => {
          const chapter = chapterDoc.data() || {};
          return {
            id: chapter.id || chapterDoc.id,
            name: chapter.name || "",
            shortDescription: chapter.shortDescription || "",
            transcript: chapter.transcript || "",
            imageUrl: chapter.imageUrl || "",
            voiceUrl: chapter.voiceUrl || "",
            order: Number(chapter.order || 0)
          };
        })
      };
    })
  );
  return courses;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/20 px-3 py-1 text-sm">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState("courses");
  const [courses, setCourses] = useState([]);
  const [activeCourseId, setActiveCourseId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [courseModal, setCourseModal] = useState({ open: false, mode: "create", data: null });
  const [chapterModal, setChapterModal] = useState({ open: false, mode: "create", data: null });
  const [courseImageFile, setCourseImageFile] = useState(null);
  const [chapterImageFile, setChapterImageFile] = useState(null);
  const [chapterVoiceFile, setChapterVoiceFile] = useState(null);

  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [courses]
  );
  const activeCourse = useMemo(
    () => sortedCourses.find((course) => course.id === activeCourseId) || sortedCourses[0] || null,
    [sortedCourses, activeCourseId]
  );
  const chapters = useMemo(
    () => [...(activeCourse?.chapters || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [activeCourse]
  );
  const email = String(user?.email || "").toLowerCase();
  const isBootstrapEmail = allowedAdminEmails.includes(email);

  const loadData = async () => {
    setBusy(true);
    setMessage("");
    try {
      const items = await fetchCourses();
      setCourses(items);
      if (items.length && !activeCourseId) setActiveCourseId(items[0].id);
    } catch (error) {
      setMessage(`Failed to load data: ${String(error?.message || error)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsubscribe = onAuthStateChanged(auth, async (sessionUser) => {
      setUser(sessionUser);
      setAuthLoading(false);
      setMessage("");
      setIsAdmin(false);
      if (!sessionUser) return;
      try {
        const adminDoc = await getDoc(doc(db, "admins", sessionUser.uid));
        const adminRole = String(adminDoc.data()?.role || "").toLowerCase() === "admin";
        const emailAllowed = allowedAdminEmails.includes(String(sessionUser.email || "").toLowerCase());
        setIsAdmin(adminRole && emailAllowed);
      } catch (error) {
        setMessage(
          `Permission check failed. Publish firestore rules, then retry. Error: ${String(
            error?.message || error
          )}`
        );
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const login = async () => {
    setMessage("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setMessage(`Sign-in failed: ${String(error?.message || error)}`);
    }
  };

  const bootstrapAdmin = async () => {
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      await setDoc(
        doc(db, "admins", user.uid),
        {
          uid: user.uid,
          email: user.email || "",
          role: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setIsAdmin(true);
      await loadData();
    } catch (error) {
      setMessage(`Admin bootstrap failed: ${String(error?.message || error)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveCourse = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = courseModal.mode === "edit" ? String(courseModal.data?.id || "").trim() : String(form.get("id") || "").trim();
    if (!id) {
      setMessage("Course ID is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const uploadedImage = await uploadFile(courseImageFile, `courses/${id}/images`);
      await setDoc(
        doc(db, "courses", id),
        {
          id,
          title: String(form.get("title") || "").trim(),
          shortDescription: String(form.get("shortDescription") || "").trim(),
          preferences: parsePreferences(form.get("preferences")),
          order: Number(form.get("order") || 0),
          imageUrl: uploadedImage || String(form.get("imageUrl") || "").trim(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setCourseModal({ open: false, mode: "create", data: null });
      setCourseImageFile(null);
      await loadData();
      setActiveCourseId(id);
      setMessage(`Course ${id} saved.`);
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async (courseId) => {
    setBusy(true);
    setMessage("");
    try {
      const targetCourse = sortedCourses.find((course) => course.id === courseId);
      const chapterDeletes = (targetCourse?.chapters || []).map((chapter) =>
        deleteDoc(doc(db, "courses", courseId, "chapters", chapter.id))
      );
      await Promise.all(chapterDeletes);
      await deleteDoc(doc(db, "courses", courseId));
      await loadData();
      setMessage(`Course ${courseId} deleted.`);
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const saveChapter = async (event) => {
    event.preventDefault();
    if (!activeCourse) {
      setMessage("Please select a course first.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const chapterId =
      chapterModal.mode === "edit" ? String(chapterModal.data?.id || "").trim() : String(form.get("id") || "").trim();
    if (!chapterId) {
      setMessage("Chapter ID is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const uploadedImage = await uploadFile(chapterImageFile, `courses/${activeCourse.id}/chapters/${chapterId}/images`);
      const uploadedVoice = await uploadFile(chapterVoiceFile, `courses/${activeCourse.id}/chapters/${chapterId}/voice`);
      await setDoc(
        doc(db, "courses", activeCourse.id, "chapters", chapterId),
        {
          id: chapterId,
          name: String(form.get("name") || "").trim(),
          shortDescription: String(form.get("shortDescription") || "").trim(),
          transcript: String(form.get("transcript") || "").trim(),
          imageUrl: uploadedImage || String(form.get("imageUrl") || "").trim(),
          voiceUrl: uploadedVoice || String(form.get("voiceUrl") || "").trim(),
          order: Number(form.get("order") || 0),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setChapterModal({ open: false, mode: "create", data: null });
      setChapterImageFile(null);
      setChapterVoiceFile(null);
      await loadData();
      setMessage(`Chapter ${chapterId} saved.`);
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const removeChapter = async (chapterId) => {
    if (!activeCourse) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteDoc(doc(db, "courses", activeCourse.id, "chapters", chapterId));
      await loadData();
      setMessage(`Chapter ${chapterId} deleted.`);
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  if (!hasFirebaseConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-xl rounded-2xl border border-rose-500/30 bg-rose-950/30 p-6">
          Missing Firebase config. Set `VITE_FIREBASE_*` variables in `admin-panel/.env`.
        </div>
      </div>
    );
  }

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/70 p-8 shadow-xl">
          <h1 className="text-2xl font-bold">AI School Admin Panel</h1>
          <p className="mt-2 text-slate-300">Only authorized admin users can access this application.</p>
          <button type="button" onClick={login} className="mt-6 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950">
            Continue with Google
          </button>
          {message ? <p className="mt-4 text-sm text-rose-300">{message}</p> : null}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/80 p-8">
          <h2 className="text-2xl font-semibold">Access Restricted</h2>
          <p className="mt-2 text-slate-300">
            Your account is signed in as <span className="text-cyan-200">{user.email}</span>, but it is not in the admin group.
          </p>
          {isBootstrapEmail ? (
            <button
              type="button"
              disabled={busy}
              onClick={bootstrapAdmin}
              className="mt-5 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950"
            >
              {busy ? "Setting up..." : "Activate Admin Access"}
            </button>
          ) : null}
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => signOut(auth)} className="rounded-xl border border-white/20 px-4 py-2">
              Sign out
            </button>
          </div>
          {message ? <p className="mt-4 text-sm text-rose-300">{message}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <main className="grid min-h-screen grid-cols-[240px_1fr] bg-slate-950 text-slate-100">
      <aside className="border-r border-white/10 bg-slate-900 p-4">
        <h2 className="text-lg font-bold">Admin Console</h2>
        <p className="mt-1 text-xs text-slate-400">{user.email}</p>
        <nav className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => setSection("courses")}
            className={`rounded-lg px-3 py-2 text-left ${section === "courses" ? "bg-cyan-500/20 text-cyan-100" : "hover:bg-slate-800"}`}
          >
            Courses
          </button>
          <button
            type="button"
            onClick={() => setSection("chapters")}
            className={`rounded-lg px-3 py-2 text-left ${section === "chapters" ? "bg-cyan-500/20 text-cyan-100" : "hover:bg-slate-800"}`}
          >
            Chapters
          </button>
        </nav>
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => {
              setCourseModal({ open: true, mode: "create", data: null });
              setCourseImageFile(null);
            }}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
          >
            + New Course
          </button>
          <button
            type="button"
            onClick={() => {
              setChapterModal({ open: true, mode: "create", data: null });
              setChapterImageFile(null);
              setChapterVoiceFile(null);
            }}
            className="rounded-lg border border-cyan-400/30 px-3 py-2 text-sm"
          >
            + New Chapter
          </button>
        </div>
        <button type="button" onClick={() => signOut(auth)} className="mt-8 rounded-lg border border-white/20 px-3 py-2 text-sm">
          Logout
        </button>
      </aside>

      <section className="overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">{section === "courses" ? "Courses" : "Chapters"}</h3>
          {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
        </div>

        {section === "courses" ? (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full table-auto text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Preferences</th>
                  <th className="px-3 py-2 text-left">Chapters</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedCourses.map((course) => (
                  <tr key={course.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{course.id}</td>
                    <td className="px-3 py-2">{course.title}</td>
                    <td className="px-3 py-2">{(course.preferences || []).join(", ")}</td>
                    <td className="px-3 py-2">{(course.chapters || []).length}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCourseModal({ open: true, mode: "edit", data: course });
                            setCourseImageFile(null);
                          }}
                          className="rounded bg-slate-700 px-2 py-1 text-xs"
                        >
                          Edit
                        </button>
                        <button type="button" disabled={busy} onClick={() => removeCourse(course.id)} className="rounded bg-rose-700 px-2 py-1 text-xs">
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSection("chapters");
                            setActiveCourseId(course.id);
                          }}
                          className="rounded bg-cyan-700 px-2 py-1 text-xs"
                        >
                          Open Chapters
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="mb-4 max-w-md">
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Select Course</label>
              <select
                value={activeCourse?.id || ""}
                onChange={(e) => setActiveCourseId(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2"
              >
                {sortedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({course.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full table-auto text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-left">Audio</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.map((chapter) => (
                    <tr key={chapter.id} className="border-t border-white/10">
                      <td className="px-3 py-2">{chapter.id}</td>
                      <td className="px-3 py-2">{chapter.name}</td>
                      <td className="px-3 py-2">{chapter.order}</td>
                      <td className="px-3 py-2">{chapter.voiceUrl ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setChapterModal({ open: true, mode: "edit", data: chapter });
                              setChapterImageFile(null);
                              setChapterVoiceFile(null);
                            }}
                            className="rounded bg-slate-700 px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          <button type="button" disabled={busy} onClick={() => removeChapter(chapter.id)} className="rounded bg-rose-700 px-2 py-1 text-xs">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {courseModal.open ? (
        <Modal
          title={courseModal.mode === "create" ? "Create Course" : `Edit Course: ${courseModal.data?.id}`}
          onClose={() => {
            setCourseModal({ open: false, mode: "create", data: null });
            setCourseImageFile(null);
          }}
        >
          <form onSubmit={saveCourse} className="grid gap-3">
            {courseModal.mode === "create" ? (
              <input name="id" placeholder="Course ID" required className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            ) : null}
            <input name="title" placeholder="Title" required defaultValue={courseModal.data?.title || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="shortDescription" placeholder="Short description" defaultValue={courseModal.data?.shortDescription || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="preferences" placeholder="Preferences (comma separated)" defaultValue={(courseModal.data?.preferences || []).join(", ")} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="order" type="number" defaultValue={courseModal.data?.order || 0} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="imageUrl" placeholder="Image URL" defaultValue={courseModal.data?.imageUrl || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <div className="rounded border border-white/20 bg-slate-800 px-3 py-2">
              <label htmlFor="courseImage" className="inline-flex cursor-pointer rounded bg-cyan-600 px-3 py-1 text-sm font-semibold text-white">
                Choose course image
              </label>
              <input
                id="courseImage"
                name="courseImage"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setCourseImageFile(e.target.files?.[0] || null)}
              />
              <p className="mt-2 text-xs text-slate-300">{courseImageFile ? courseImageFile.name : "No file selected"}</p>
            </div>
            <button disabled={busy} className="rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
              {busy ? "Saving..." : "Save Course"}
            </button>
          </form>
        </Modal>
      ) : null}

      {chapterModal.open ? (
        <Modal
          title={chapterModal.mode === "create" ? "Create Chapter" : `Edit Chapter: ${chapterModal.data?.id}`}
          onClose={() => {
            setChapterModal({ open: false, mode: "create", data: null });
            setChapterImageFile(null);
            setChapterVoiceFile(null);
          }}
        >
          <form onSubmit={saveChapter} className="grid gap-3">
            {chapterModal.mode === "create" ? (
              <input name="id" placeholder="Chapter ID" required className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            ) : null}
            <input name="name" placeholder="Chapter name" required defaultValue={chapterModal.data?.name || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="shortDescription" placeholder="Short description" defaultValue={chapterModal.data?.shortDescription || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <textarea name="transcript" rows={5} placeholder="Transcript" defaultValue={chapterModal.data?.transcript || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="imageUrl" placeholder="Image URL" defaultValue={chapterModal.data?.imageUrl || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="voiceUrl" placeholder="Voice URL MP3" defaultValue={chapterModal.data?.voiceUrl || ""} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <input name="order" type="number" defaultValue={chapterModal.data?.order || 0} className="rounded border border-white/20 bg-slate-800 px-3 py-2" />
            <div className="rounded border border-white/20 bg-slate-800 px-3 py-2">
              <label htmlFor="chapterImage" className="inline-flex cursor-pointer rounded bg-cyan-600 px-3 py-1 text-sm font-semibold text-white">
                Choose chapter image
              </label>
              <input
                id="chapterImage"
                name="chapterImage"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setChapterImageFile(e.target.files?.[0] || null)}
              />
              <p className="mt-2 text-xs text-slate-300">{chapterImageFile ? chapterImageFile.name : "No file selected"}</p>
            </div>
            <div className="rounded border border-white/20 bg-slate-800 px-3 py-2">
              <label htmlFor="chapterVoice" className="inline-flex cursor-pointer rounded bg-cyan-600 px-3 py-1 text-sm font-semibold text-white">
                Choose chapter voice mp3
              </label>
              <input
                id="chapterVoice"
                name="chapterVoice"
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setChapterVoiceFile(e.target.files?.[0] || null)}
              />
              <p className="mt-2 text-xs text-slate-300">{chapterVoiceFile ? chapterVoiceFile.name : "No file selected"}</p>
            </div>
            <button disabled={busy} className="rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
              {busy ? "Saving..." : "Save Chapter"}
            </button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
