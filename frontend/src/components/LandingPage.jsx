import { useMemo, useState } from "react";

const flattenChapterContent = (course) =>
  course.subjects
    .flatMap((subject) => subject.chapters)
    .map((chapter) => `- ${chapter.title}: ${chapter.content}`)
    .join("\n");

const cardImages = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDlvfukldtx6-QyRubxle54SSBupq2quytDaW68OLNFwpaz-wXjRV_YT7zoIOhOccQKNijlZzqih0gkMVsaCOhcIMgHrboZSgw9JBb5amxnDzxQpkjf5zekqHw48Y6iPpWvuDsKucWqoNQplMX5nrSj3pRKtXWxEnxdflcWo81Oi1Prggb9u9DbRjn4lYp1pmexigc_fFHOwinqA-It_dbA2JjV4XY4I2JMGeeOP2ec4Uico6JNAImnLcbCBGKK4e381ngGx5_wag",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBGfFp069jHm6Okq1e1EgzSnybPUdoZ52Sm3xfx2Fg3eWSP7lZ0PSLU7_AYxkquyI_1D13mAfAqXxrSEFY11hcYV5kc627Z_SJemx9oL-_S_IBIGdSbqEXps2OxRzm6saEqeTouC1ZxXbc5oKOv18U0OqsHaR_Q-iyZf3OPmKZmKv7nvdlwp2ti69d8ypJO7SCJ2oEK2-A3_Oxe-YvtGf7TTKxHjw7TSfV1qOILcKWSMteaX_KH4gqLykMtMCxssNvEfrJ5A8gWgw",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAjjHNgDG7Yv09JjiuQ0UkVTgzMJ66f0CUa9pdZO1yh3LdgahRmOdZIlLzM0UBfw9bLttY_vKuAxw6O-J3Qu5pVfRaNiu5v8jF_pGCLmguog-ZWWgYaWcicgfXDC37JUotJosRGcuJxa_YTOuite5FsHO7WukFVE75I6bHe9rrZBx_PvYnC3AzF5YuN8PslWD6QPN63JMGECXk8UZ4Kkye3l-5kzfh0RwnjxhJ2QBsWHPdo8gR6Lc9o-3UHxSA_gtvcOfZ9jts-Ig"
];

const LandingPage = ({ courses, onStartCourse }) => {
  const [query, setQuery] = useState("");

  const filteredCourses = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return courses;
    }
    return courses.filter((course) => {
      const inCourse = course.title.toLowerCase().includes(value);
      const inSubjects = course.subjects.some((subject) => subject.title.toLowerCase().includes(value));
      const inChapters = course.subjects
        .flatMap((subject) => subject.chapters)
        .some((chapter) => chapter.title.toLowerCase().includes(value));
      return inCourse || inSubjects || inChapters;
    });
  }, [courses, query]);

  return (
    <section className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0b1020] px-6 py-10 text-slate-100">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/15 blur-[130px]" />
      <header className="mx-auto w-full max-w-6xl text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Explore</p>
        <h1 className="mt-2 text-6xl font-semibold text-white">
          Expand your <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">Cosmos</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">
          Search a course, start instantly, and the tutor greets you with a quick course introduction.
          Ask questions naturally by voice.
        </p>
      </header>

      <div className="mx-auto mt-8 w-full max-w-6xl rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search courses, subjects, chapters..."
          className="w-full rounded-xl border border-white/10 bg-[#10172a] px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-cyan-400/60 focus:outline-none"
        />
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {filteredCourses.map((course, index) => (
          <button
            key={course.id}
            type="button"
            onClick={() =>
              onStartCourse({
                id: `course-${course.id}`,
                title: course.title,
                content: flattenChapterContent(course)
              })
            }
            className="overflow-hidden rounded-2xl border border-white/10 bg-[#10172a]/85 text-left transition hover:border-cyan-300/50 hover:bg-[#131b31]"
          >
            <img
              src={cardImages[index % cardImages.length]}
              alt={course.title}
              className="h-40 w-full object-cover"
            />
            <div className="p-5">
            <h2 className="text-lg font-semibold text-white">{course.title}</h2>
            <p className="mt-2 text-sm text-slate-300">
              {course.subjects.length} subjects •{" "}
              {course.subjects.flatMap((subject) => subject.chapters).length} chapters
            </p>
            <p className="mt-4 text-xs text-cyan-200">Click to start voice tutor</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default LandingPage;
