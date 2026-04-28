const TutorProfilePage = ({ course, onBack, onStartSession }) => {
  if (!course) {
    return null;
  }

  return (
    <section className="min-h-screen bg-[#15121b] text-[#e8dfee]">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-slate-950/50 px-8 py-4 backdrop-blur-2xl">
        <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-2xl font-bold text-transparent">
          AetherTutor
        </span>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
        >
          Back to Explore
        </button>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-2 shadow-2xl">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDZGDUvcfeEb4laMFJcXBvD9CkOv-2vezLKv88b4vHA8J6Eg9sMw35DIWD7cYmKj_6fIIQvRNmAN5w-zEwnWpIYsczAwSTFU4SOmevDGvlb-oDoxCAnq16pJPec2geEnZ3IU5u4fOvFD_KNuBLxzN_hAiocpXghgsjkJwn_5ngfrmZ2FgRUf2W3f5RrP6CY5FQRECt-hEddX04ZzuWgtdNvtkmbTpN0KsgE83-DZ3wCX_6-QEi4Q3ABz1uAyXl7W2_WOpfo6WeKgQ"
              alt="Tutor"
              className="h-full w-full rounded-[1.6rem] object-cover"
            />
          </div>
        </div>

        <div className="space-y-8 lg:col-span-7">
          <div>
            <span className="rounded-full border border-primary/30 bg-primary-container/20 px-4 py-1 text-xs text-primary">
              Senior AI Mentor
            </span>
            <h1 className="mt-4 text-5xl font-semibold leading-tight">Dr. Lyra Thorne</h1>
            <p className="mt-4 text-3xl font-semibold text-cyan-400">{course.title}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-xl font-semibold">Teaching Style</h3>
              <p className="mt-2 text-sm text-[#ccc3d8]">
                Socratic method with visual examples and adaptive level based on your answers.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-xl font-semibold">Session Goal</h3>
              <p className="mt-2 text-sm text-[#ccc3d8]">
                Quick course overview, then interactive Q&A with concise explanations.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartSession}
            className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-10 py-4 text-lg font-semibold text-white shadow-[0_10px_30px_rgba(124,58,237,0.4)] hover:opacity-95"
          >
            Start Session
          </button>
        </div>
      </main>
    </section>
  );
};

export default TutorProfilePage;
