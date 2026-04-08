import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Play, RotateCcw, Shield, Target, Clock, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Activity, Map as MapIcon, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface ParkingSpot {
  position: [number, number];
  is_available: boolean;
  is_reserved: boolean;
}

interface EnvState {
  agent_position: [number, number];
  parking_spots: ParkingSpot[];
  grid_size: number;
  steps_elapsed: number;
  is_parked: boolean;
}

const App: React.FC = () => {
  const [state, setState] = useState<EnvState | null>(null);
  const [reward, setReward] = useState<number>(0);
  const [task, setTask] = useState<string>('easy');
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string>('Select a task to begin');

  const fetchState = async () => {
    try {
      const res = await axios.get('/state');
      setState(res.data);
    } catch (err) {
      console.error('Failed to fetch state');
    }
  };

  const reset = async (targetTask: string) => {
    try {
      const res = await axios.post('/reset', { task: targetTask });
      setTask(targetTask);
      setReward(0);
      setIsRunning(true);
      setMessage(`Task: ${targetTask.toUpperCase()} - Navigate to an available spot.`);
      fetchState();
    } catch (err) {
      setMessage('Error resetting environment');
    }
  };

  const step = async (action: any) => {
    try {
      const res = await axios.post('/step', action);
      const { observation, reward: stepReward, done, info } = res.data;
      setReward(prev => prev + stepReward);
      fetchState();
      
      if (done) {
        setIsRunning(false);
        setMessage(`Simulation Complete: ${info.reason?.replace(/_/g, ' ')}`);
      }
    } catch (err) {
      console.error('Step failed');
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#F6F6FC] selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0B0E14]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Smart Parking <span className="text-cyan-400 font-medium">Simulation</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
            {['easy', 'medium', 'hard'].map((t) => (
              <button
                key={t}
                onClick={() => reset(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  task === t ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'hover:bg-white/5 text-gray-400'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Simulation Grid Container */}
        <section className="flex-1 relative flex items-center justify-center bg-[radial-gradient(circle_at_center,_#161B22_0%,_#0B0E14_100%)] p-12">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
          
          <div className="relative group grayscale hover:grayscale-0 transition-all duration-700">
            {/* Grid */}
            <div className="bg-[#111318] p-4 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-3xl">
              <div 
                className="grid gap-1"
                style={{ 
                  gridTemplateColumns: `repeat(${state?.grid_size || 10}, 1fr)`,
                  width: 'min(70vh, 70vw)',
                  height: 'min(70vh, 70vw)'
                }}
              >
                {state && Array.from({ length: 100 }).map((_, i) => {
                  const x = i % 10;
                  const y = Math.floor(i / 10);
                  const isAgent = state.agent_position[0] === x && state.agent_position[1] === y;
                  const spot = state.parking_spots.find(s => s.position[0] === x && s.position[1] === y);
                  
                  return (
                    <div 
                      key={i} 
                      className={`relative rounded-sm transition-all duration-300 ${
                        isAgent ? '' : 'bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      {spot && (
                        <motion.div 
                          initial={false}
                          animate={{ 
                            scale: spot.is_reserved ? 1.1 : 1,
                            backgroundColor: spot.is_reserved ? '#FFBF00' : (spot.is_available ? '#39FF14' : '#FF4B4B')
                          }}
                          className={`w-full h-full rounded shadow-inner opacity-60 flex items-center justify-center`}
                        >
                          <Database className="w-1/2 h-1/2 text-black/50" />
                        </motion.div>
                      )}
                      {isAgent && (
                        <motion.div 
                          layoutId="agent"
                          className="absolute inset-0 bg-cyan-500 rounded-md shadow-[0_0_20px_rgba(6,182,212,0.6)] z-20 flex items-center justify-center"
                        >
                          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="w-[380px] border-l border-white/5 flex flex-col bg-[#0B0E14] p-8 gap-8 overflow-y-auto">
          {/* Telemetry */}
          <div className="space-y-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> Telemetry
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <p className="text-xs text-gray-400 mb-1">Cumulative Reward</p>
                <p className={`text-2xl font-bold font-mono ${reward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {reward.toFixed(2)}
                </p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <p className="text-xs text-gray-400 mb-1">Steps Taken</p>
                <div className="flex items-center gap-2 font-mono">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <p className="text-2xl font-bold">{state?.steps_elapsed || 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Status</span>
                <span className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  {isRunning ? 'Active' : 'Offline'}
                </span>
              </div>
              <div className="h-px bg-white/5"></div>
              <div className="text-xs text-gray-300 leading-relaxed italic bg-black/20 p-3 rounded-lg border border-white/5">
                "{message}"
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Play className="w-4 h-4" /> Control Hub
            </h2>
            
            <div className="flex flex-col items-center gap-2">
              <ControlButton onClick={() => step({ type: 'move', direction: 'up' })} icon={<ChevronUp />} disabled={!isRunning} />
              <div className="flex gap-2">
                <ControlButton onClick={() => step({ type: 'move', direction: 'left' })} icon={<ChevronLeft />} disabled={!isRunning} />
                <ControlButton onClick={() => step({ type: 'move', direction: 'down' })} icon={<ChevronDown />} disabled={!isRunning} />
                <ControlButton onClick={() => step({ type: 'move', direction: 'right' })} icon={<ChevronRight />} disabled={!isRunning} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <ActionButton onClick={() => step({ type: 'scan_parking' })} label="Scan" icon={<MapIcon className="w-4 h-4"/>} disabled={!isRunning} />
              <ActionButton onClick={() => step({ type: 'reserve_spot' })} label="Reserve" icon={<Target className="w-4 h-4"/>} disabled={!isRunning} />
              <ActionButton onClick={() => reset(task)} label="Restart" icon={<RotateCcw className="w-4 h-4"/>} color="red" />
              <ActionButton onClick={() => step({ type: 'wait' })} label="Wait" icon={<Clock className="w-4 h-4"/>} />
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

// --- Subcomponents ---

const ControlButton = ({ onClick, icon, disabled }: { onClick: () => void, icon: any, disabled?: boolean }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center hover:bg-cyan-500 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-20"
  >
    {icon}
  </button>
);

const ActionButton = ({ onClick, label, icon, disabled, color = 'cyan' }: { onClick: () => void, label: string, icon: any, disabled?: boolean, color?: string }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all
      ${color === 'red' 
        ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' 
        : 'bg-white/5 border-white/10 text-gray-300 hover:border-cyan-500/50 hover:text-cyan-400'}
      disabled:opacity-20`}
  >
    {icon} {label}
  </button>
);

export default App;
