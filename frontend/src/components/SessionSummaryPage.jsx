const SessionSummaryPage = ({ selectedChapter, messages, onRestart, onBackToExplore }) => {
  const aiTranscript = messages.filter((message) => message.role === "assistant");

  return (
    <section className="min-h-screen bg-[#15121b] px-6 py-8 text-[#e8dfee]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Session Complete</p>
          <h1 className="mt-2 text-5xl font-semibold">{selectedChapter?.title || "Course Session"}</h1>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">Session Transcript</h2>
          <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-2">
            {aiTranscript.length ? (
              aiTranscript.map((message) => (
                <div key={message.id} className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                  {message.content}
                </div>
              ))
            ) : (
              <p className="text-sm text-[#ccc3d8]">No transcript available.</p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-3 font-semibold text-white"
          >
            Start Another Session
          </button>
          <button
            type="button"
            onClick={onBackToExplore}
            className="rounded-full border border-white/20 px-8 py-3 font-semibold text-white"
          >
            Return to Courses
          </button>
        </div>
      </div>
    </section>
  );
};

export default SessionSummaryPage;
