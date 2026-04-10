import { AssistantView } from "./AssistantView";

function App() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-8rem] h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_82%)] opacity-30" />
      </div>

      <div className="relative mx-auto max-w-[1680px] px-4 py-4 lg:px-6 lg:py-6">
        <div className="mb-4 flex flex-col gap-3 rounded-[1.8rem] border border-white/10 bg-white/5 p-3 backdrop-blur-xl lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/15 text-cyan-200">
              P
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.45em] text-cyan-200">OpenEnv Smart Parking</div>
              <div className="mt-1 text-sm font-semibold text-white">Trip planning for drivers, fleets, and operators</div>
            </div>
          </div>
          <div className="ml-0 flex flex-wrap items-center gap-2 lg:ml-auto">
            <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[10px] uppercase tracking-[0.35em] text-cyan-100">
              Live parking assistant
            </div>
          </div>
        </div>

        <AssistantView />
      </div>
    </div>
  );
}

export default App;
