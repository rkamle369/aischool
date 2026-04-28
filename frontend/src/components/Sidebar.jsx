const Sidebar = ({ course, selectedChapterId, onSelectChapter, onBackToCourses }) => {
  return (
    <aside className="w-full max-w-sm border-r border-white/10 bg-[#100d16]/60 p-5 backdrop-blur-2xl">
      <div className="mb-5">
        <h1 className="bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-xl font-semibold text-transparent">
          Lumina Mentor
        </h1>
        <p className="mt-1 text-sm text-[#ccc3d8]">Course chapters</p>
        <button
          type="button"
          onClick={onBackToCourses}
          className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
        >
          Back to courses
        </button>
      </div>

      <div className="h-[calc(100vh-150px)] space-y-4 overflow-y-auto pb-6">
        {!course ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-[#ccc3d8]">
            Select a course to view chapters.
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <h2 className="font-medium text-[#e8dfee]">{course.title}</h2>
            <div className="mt-3 space-y-3">
              {course.subjects.map((subject) => (
                <div key={subject.id}>
                  <h3 className="text-xs uppercase tracking-wide text-[#958da1]">{subject.title}</h3>
                  <ul className="mt-2 space-y-1">
                    {subject.chapters.map((chapter, index) => (
                      <li key={chapter.id}>
                        <button
                          type="button"
                          onClick={() => onSelectChapter(chapter)}
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                            selectedChapterId === chapter.id
                              ? "border border-violet-300/30 bg-gradient-to-r from-violet-500/35 to-cyan-400/25 text-[#e8dfee]"
                              : "bg-[#1d1a24] text-[#ccc3d8] hover:bg-[#2c2833]"
                          }`}
                        >
                          {`Chapter ${index + 1}: ${chapter.title}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
