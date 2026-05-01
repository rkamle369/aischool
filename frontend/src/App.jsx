import { useEffect, useMemo, useRef, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, hasFirebaseConfig } from "./firebase";

const PREFS = ["Cloud Computing", "DevOps", "AI", "Security"];

async function fetchCoursesFromFirestore() {
  const coursesSnap = await getDocs(query(collection(db, "courses"), orderBy("order", "asc")));
  const courses = await Promise.all(
    coursesSnap.docs.map(async (courseDoc) => {
      const courseData = courseDoc.data() || {};
      const chaptersSnap = await getDocs(
        query(collection(db, "courses", courseDoc.id, "chapters"), orderBy("order", "asc"))
      );
      const chapters = chaptersSnap.docs.map((chapterDoc) => {
        const chapter = chapterDoc.data() || {};
        return {
          id: chapter.id || chapterDoc.id,
          name: chapter.name || "Chapter",
          shortDescription: chapter.shortDescription || "",
          imageUrl: chapter.imageUrl || "",
          transcript: chapter.transcript || "",
          voiceUrl: chapter.voiceUrl || "",
          order: Number(chapter.order || 0)
        };
      });
      return {
        id: courseData.id || courseDoc.id,
        title: courseData.title || "Untitled course",
        shortDescription: courseData.shortDescription || "",
        preferences: Array.isArray(courseData.preferences) ? courseData.preferences : [],
        imageUrl: courseData.imageUrl || "",
        order: Number(courseData.order || 0),
        chapters
      };
    })
  );
  return courses;
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [preferences, setPreferences] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [completedByCourse, setCompletedByCourse] = useState({});
  const [error, setError] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const audioRef = useRef(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const chapters = selectedCourse?.chapters || [];
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) || chapters[0] || null,
    [chapters, selectedChapterId]
  );

  const selectedChapterIndex = useMemo(
    () => chapters.findIndex((chapter) => chapter.id === selectedChapter?.id),
    [chapters, selectedChapter]
  );

  const loadCoursesAndProgress = async (currentUser, userPreferences) => {
    setLoadingCourses(true);
    setError("");
    try {
      const allCourses = await fetchCoursesFromFirestore();
      const normalizedPrefs = userPreferences.map((value) => value.toLowerCase());
      const filteredCourses = normalizedPrefs.length
        ? allCourses.filter((course) =>
            (course.preferences || []).some((pref) => normalizedPrefs.includes(String(pref).toLowerCase()))
          )
        : allCourses;
      setCourses(filteredCourses);

      if (!filteredCourses.length) {
        setSelectedCourseId("");
        setSelectedChapterId("");
        setCompletedByCourse({});
        return;
      }

      const progressEntries = await Promise.all(
        filteredCourses.map(async (course) => {
          const snap = await getDoc(doc(db, "users", currentUser.uid, "courseProgress", course.id));
          if (!snap.exists()) return [course.id, []];
          return [course.id, snap.data()?.completedChapterIds || []];
        })
      );
      const progressMap = Object.fromEntries(progressEntries);
      setCompletedByCourse(progressMap);

      const firstCourse = filteredCourses[0];
      const activeCourseId = selectedCourseId || firstCourse.id;
      setSelectedCourseId(activeCourseId);
      const activeCourse = filteredCourses.find((course) => course.id === activeCourseId) || firstCourse;
      const done = new Set(progressMap[activeCourse.id] || []);
      const resumeChapter = activeCourse.chapters.find((chapter) => !done.has(chapter.id)) || activeCourse.chapters[0];
      setSelectedChapterId(resumeChapter?.id || "");
    } catch (err) {
      setError(`Failed to load courses: ${String(err?.message || err)}`);
    } finally {
      setLoadingCourses(false);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsub = onAuthStateChanged(auth, async (sessionUser) => {
      setUser(sessionUser);
      setAuthLoading(false);
      setError("");
      if (!sessionUser) {
        setPreferences([]);
        setCourses([]);
        setCompletedByCourse({});
        setSelectedCourseId("");
        setSelectedChapterId("");
        return;
      }
      try {
        const profileRef = doc(db, "users", sessionUser.uid);
        const profileSnap = await getDoc(profileRef);
        const savedPreferences = profileSnap.exists() ? profileSnap.data()?.preferences || [] : [];
        setPreferences(savedPreferences);
      } catch (err) {
        setError(`Failed to load profile: ${String(err?.message || err)}`);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !preferences.length) return;
    void loadCoursesAndProgress(user, preferences);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, preferences]);

  const handleGoogleLogin = async () => {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(`Google sign-in failed: ${String(err?.message || err)}`);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const togglePreference = (pref) => {
    setPreferences((prev) => (prev.includes(pref) ? prev.filter((item) => item !== pref) : [...prev, pref]));
  };

  const savePreferences = async () => {
    if (!user || !preferences.length) return;
    setSavingPrefs(true);
    setError("");
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email || "",
          displayName: user.displayName || "",
          preferences,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      await loadCoursesAndProgress(user, preferences);
    } catch (err) {
      setError(`Failed to save preferences: ${String(err?.message || err)}`);
    } finally {
      setSavingPrefs(false);
    }
  };

  const markChapterComplete = async () => {
    if (!user || !selectedCourse || !selectedChapter) return;
    const courseId = selectedCourse.id;
    const currentCompleted = new Set(completedByCourse[courseId] || []);
    currentCompleted.add(selectedChapter.id);
    const completedChapterIds = [...currentCompleted];
    setCompletedByCourse((prev) => ({ ...prev, [courseId]: completedChapterIds }));

    const nextChapter = selectedCourse.chapters[selectedChapterIndex + 1] || null;
    if (nextChapter) setSelectedChapterId(nextChapter.id);

    try {
      await setDoc(
        doc(db, "users", user.uid, "courseProgress", courseId),
        {
          completedChapterIds,
          lastChapterId: nextChapter?.id || selectedChapter.id,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      setError(`Failed to update progress: ${String(err?.message || err)}`);
    }
  };

  if (!hasFirebaseConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-xl rounded-2xl border border-rose-500/30 bg-rose-950/30 p-6">
          Missing Firebase config. Set `VITE_FIREBASE_*` in `frontend/.env`.
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
          <h1 className="text-2xl font-bold">Welcome to AI School</h1>
          <p className="mt-2 text-slate-300">Sign in with your Google account to begin training.</p>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-6 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Continue with Google
          </button>
          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (!preferences.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900/70 p-8">
          <h2 className="text-2xl font-bold">Choose your preferences</h2>
          <p className="mt-2 text-slate-300">We will show courses based on your selected interests.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {PREFS.map((pref) => {
              const active = preferences.includes(pref);
              return (
                <button
                  key={pref}
                  type="button"
                  onClick={() => togglePreference(pref)}
                  className={`rounded-xl border px-4 py-3 text-left ${
                    active
                      ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                      : "border-white/10 bg-slate-800/60 text-slate-200"
                  }`}
                >
                  {pref}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled={!preferences.length || savingPrefs}
              onClick={savePreferences}
              className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
            >
              {savingPrefs ? "Saving..." : "Save preferences"}
            </button>
            <button type="button" onClick={handleSignOut} className="rounded-xl border border-white/20 px-4 py-3">
              Sign out
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="grid min-h-screen grid-cols-[320px_1fr] bg-slate-950 text-slate-100">
        <aside className="border-r border-white/10 bg-slate-900/65 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-cyan-300">AI School</p>
              <p className="text-sm text-slate-300">{user.displayName || user.email}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleSignOut} className="rounded-lg border border-white/20 px-2 py-1 text-xs">
                Logout
              </button>
            </div>
          </div>

          {loadingCourses ? <p className="text-sm text-slate-400">Loading courses...</p> : null}
          {!loadingCourses && !courses.length ? <p className="text-sm text-slate-400">No courses found.</p> : null}

          <div className="space-y-3 overflow-y-auto pb-8">
            {courses.map((course) => {
              const doneSet = new Set(completedByCourse[course.id] || []);
              const selected = course.id === selectedCourseId;
              return (
                <div key={course.id} className={`rounded-xl border ${selected ? "border-cyan-300/40" : "border-white/10"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      const next = course.chapters.find((chapter) => !doneSet.has(chapter.id)) || course.chapters[0];
                      setSelectedChapterId(next?.id || "");
                    }}
                    className={`w-full rounded-t-xl px-4 py-3 text-left ${selected ? "bg-cyan-500/10" : "bg-slate-800/30"}`}
                  >
                    <p className="font-semibold">{course.title}</p>
                    <p className="text-xs text-slate-400">{course.shortDescription || "Course"}</p>
                  </button>
                  {selected ? (
                    <div className="space-y-1 px-2 pb-2">
                      {course.chapters.map((chapter, index) => {
                        const chapterDone = doneSet.has(chapter.id);
                        const active = chapter.id === selectedChapterId;
                        return (
                          <button
                            key={chapter.id}
                            type="button"
                            onClick={() => setSelectedChapterId(chapter.id)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                              active ? "bg-cyan-500/20 text-cyan-100" : "hover:bg-slate-800/50"
                            }`}
                          >
                            <span>{index + 1}. {chapter.name}</span>
                            <span className={`text-xs ${chapterDone ? "text-emerald-300" : "text-slate-500"}`}>
                              {chapterDone ? "Done" : "Pending"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="relative flex min-h-screen flex-col overflow-hidden">
          {selectedChapter ? (
            <>
              <img
                src={selectedChapter.imageUrl || selectedCourse?.imageUrl || "https://picsum.photos/1920/1080"}
                alt={selectedChapter.name}
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              <div className="absolute left-8 top-8 rounded-xl bg-black/40 px-4 py-3 backdrop-blur">
                <p className="text-xs uppercase tracking-wider text-cyan-300">{selectedCourse?.title}</p>
                <h2 className="text-2xl font-semibold">{selectedChapter.name}</h2>
                <p className="text-sm text-slate-200">{selectedChapter.shortDescription || ""}</p>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="mx-auto max-w-5xl rounded-2xl border border-cyan-300/20 bg-black/55 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wider text-cyan-300">Transcript</p>
                  <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm text-slate-100">
                    {selectedChapter.transcript || "No transcript available yet."}
                  </p>
                  <div className="mt-4">
                    <audio
                      key={selectedChapter.id}
                      ref={audioRef}
                      controls
                      autoPlay
                      className="w-full"
                      src={selectedChapter.voiceUrl || ""}
                      onEnded={markChapterComplete}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300">Select a chapter to begin.</div>
          )}
        </section>
      </main>

      {error ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-rose-500/30 bg-rose-950/80 px-4 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </>
  );
}

export default App;
