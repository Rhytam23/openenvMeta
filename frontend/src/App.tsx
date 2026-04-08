import { useState } from "react";
import type { ReactNode } from "react";
import { AssistantView } from "./AssistantView";
import { SimulatorView } from "./SimulatorView";

function App() {
  const [view, setView] = useState<"assistant" | "training">("assistant");

  return (
    <div className="min-h-screen bg-[#050816] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6 lg:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-white/5 p-2">
          <TabButton active={view === "assistant"} onClick={() => setView("assistant")}>
            Parking Assistant
          </TabButton>
          <TabButton active={view === "training"} onClick={() => setView("training")}>
            Training Simulator
          </TabButton>
          <div className="ml-auto text-xs uppercase tracking-[0.35em] text-slate-400">
            Real-world parking guidance with simulation fallback
          </div>
        </div>

        {view === "assistant" ? <AssistantView /> : <SimulatorView />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-200 hover:bg-cyan-400/10"
      }`}
    >
      {children}
    </button>
  );
}

export default App;
