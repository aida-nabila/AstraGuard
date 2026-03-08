import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  Activity, 
  Shield, 
  Info, 
  Satellite as SatIcon, 
  Cpu,
  ChevronRight,
  Search
} from 'lucide-react';
import { Satellite, AIRecommendation, CollisionRisk } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

interface DashboardProps {
  satellites: Satellite[];
  recommendation: AIRecommendation | null;
  risks: CollisionRisk[];
  atRiskIds: Set<string>;
  onSelectSatellite: (sat: Satellite) => void;
  selectedSatellite: Satellite | null;
  timeOffset: number;
  onTimeChange: (time: number) => void;
  onDeploySatellite: (lat: number, lng: number, alt: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  satellites, 
  recommendation, 
  risks,
  atRiskIds,
  onSelectSatellite,
  selectedSatellite,
  timeOffset,
  onTimeChange,
  onDeploySatellite
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [deployLat, setDeployLat] = React.useState('3.1390');
  const [deployLng, setDeployLng] = React.useState('101.6869');
  const [deployAlt, setDeployAlt] = React.useState('500');

  const filteredSatellites = React.useMemo(() => {
    return satellites.filter(s => 
      s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.noradId?.includes(searchQuery)
    );
  }, [satellites, searchQuery]);

  const stats = [
    { label: 'Total Objects', value: satellites.length, icon: SatIcon, color: 'text-blue-400' },
    { label: 'Active Risks', value: risks.length, icon: AlertTriangle, color: 'text-red-400' },
    { label: 'System Status', value: 'NOMINAL', icon: Activity, color: 'text-emerald-400' },
  ];

  const chartData = [
    { name: 'LEO', count: satellites.filter(s => s.orbitType === 'LEO').length },
    { name: 'MEO', count: satellites.filter(s => s.orbitType === 'MEO').length },
    { name: 'GEO', count: satellites.filter(s => s.orbitType === 'GEO').length },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ minWidth: 0 }}>
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white font-mono italic leading-none">ASTRAGUARD</h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] mt-1">Orbital Traffic Control v2.4</p>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[9px] text-emerald-500 font-mono font-bold tracking-wider">LIVE</span>
            </div>
            <span className="text-[8px] text-zinc-600 font-mono mt-0.5">CELESTRAK-API</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {/* Quick Actions */}
        <div className="flex gap-2">
          <button 
            onClick={() => {
              const iss = satellites.find(s => s.type === 'ISS');
              if (iss) onSelectSatellite(iss);
            }}
            className="flex-1 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-[9px] text-blue-400 uppercase font-bold tracking-widest transition-all"
          >
            Track ISS
          </button>
          <button 
            onClick={() => onSelectSatellite(null as any)}
            className="flex-1 py-2 bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 rounded-lg text-[9px] text-zinc-400 uppercase font-bold tracking-widest transition-all"
          >
            Reset View
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl">
            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Tracked</p>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-bold text-white font-mono leading-none">{satellites.length}</span>
              <span className="text-[9px] text-zinc-600 font-mono">OBJS</span>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl">
            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Debris</p>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-bold text-orange-500 font-mono leading-none">{satellites.filter(s => s.type === 'DEBRIS').length}</span>
              <span className="text-[9px] text-zinc-600 font-mono">CLSTR</span>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl">
            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Risks</p>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-bold text-red-500 font-mono leading-none">{risks.length}</span>
              <span className="text-[9px] text-zinc-600 font-mono">ACTV</span>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl">
            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Next Appr.</p>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-bold text-blue-500 font-mono leading-none">14</span>
              <span className="text-[9px] text-zinc-600 font-mono">MIN</span>
            </div>
          </div>
        </div>

        {/* Time Warp Simulator */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Propagator</h2>
            </div>
            <span className={`text-[10px] font-mono font-bold ${timeOffset === 0 ? 'text-emerald-500' : 'text-blue-400'}`}>
              {new Date(Date.now() + timeOffset * 60000).toLocaleString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              })} UTC
            </span>
          </div>
          
          <div className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl space-y-4">
            <input 
              type="range" 
              min="0" 
              max="1440" 
              step="10"
              value={timeOffset}
              onChange={(e) => onTimeChange(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            
            <div className="flex justify-between text-[8px] text-zinc-600 font-mono font-bold uppercase tracking-tighter">
              <span>NOW</span>
              <span>+6H</span>
              <span>+12H</span>
              <span>+18H</span>
              <span>+24H</span>
            </div>
          </div>
        </section>

        {/* Satellite Deployment */}
        <section className="space-y-3">
          <div className="flex items-center space-x-2 px-1">
            <SatIcon className="w-3.5 h-3.5 text-blue-400" />
            <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Deployment</h2>
          </div>
          
          <div className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider">Lat</label>
                <input 
                  type="text" 
                  value={deployLat}
                  onChange={(e) => setDeployLat(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider">Lng</label>
                <input 
                  type="text" 
                  value={deployLng}
                  onChange={(e) => setDeployLng(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider">Alt</label>
                <input 
                  type="text" 
                  value={deployAlt}
                  onChange={(e) => setDeployAlt(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>

            <button 
              onClick={() => onDeploySatellite(parseFloat(deployLat), parseFloat(deployLng), parseFloat(deployAlt))}
              className="w-full py-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] transition-all"
            >
              Launch Asset
            </button>
          </div>
        </section>

        {/* AI Insights */}
        <section className="space-y-3">
          <div className="flex items-center space-x-2 px-1">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">AI Advisory</h2>
          </div>
          
          <div className="bg-blue-500/[0.03] border border-blue-500/10 p-4 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-[0.03] pointer-events-none">
              <Cpu className="w-16 h-16 text-blue-400" />
            </div>
            
            {recommendation ? (
              <div className="space-y-4">
                <p className="text-xs text-zinc-300 leading-relaxed font-medium italic">
                  "{recommendation.summary}"
                </p>
                <div className="space-y-2">
                  {recommendation.actions.slice(0, 3).map((action, i) => (
                    <div key={i} className="flex items-start space-x-2 text-[10px] text-zinc-400">
                      <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-24 space-y-3">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest animate-pulse">Analyzing Orbital Vector...</span>
              </div>
            )}
          </div>
        </section>

        {/* Distribution Chart */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Density Metrics</h2>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[8px] text-zinc-600 uppercase font-bold">Critical</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {chartData.map((zone) => (
                <div key={zone.name} className="bg-black/20 p-2 rounded-xl border border-white/5">
                  <div className="text-[8px] text-zinc-600 uppercase font-bold mb-0.5">{zone.name}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white font-mono">{zone.count}</span>
                    {zone.count > (zone.name === 'LEO' ? 200 : 50) && (
                      <div className="w-1 h-1 rounded-full bg-red-500 animate-ping" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="w-full h-32" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 8, fill: '#71717a', fontWeight: 'bold'}} dy={5} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={24}>
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.count > (entry.name === 'LEO' ? 200 : 50) ? '#ef4444' : '#3b82f6'} 
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Satellite List */}
        <section className="space-y-3 pb-4">
          <div className="flex flex-col space-y-3 px-1">
            <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Registry</h2>
            <div className="relative w-full">
              <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input 
                type="text" 
                placeholder="SEARCH NORAD REGISTRY..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/[0.03] border border-white/5 rounded-xl py-2 pl-8 pr-4 text-[10px] text-white font-mono placeholder:text-zinc-700 outline-none w-full focus:border-blue-500/30 transition-colors"
              />
            </div>
          </div>
          
          <div className="space-y-1">
            {filteredSatellites.map((sat) => (
              <button
                key={sat.id}
                onClick={() => onSelectSatellite(sat)}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group ${
                  selectedSatellite?.id === sat.id 
                    ? 'bg-blue-500/10 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                    : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05] hover:border-white/5'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-1.5 h-1.5 rounded-full shadow-sm ${
                    atRiskIds.has(sat.id) ? 'bg-red-500 animate-pulse' : sat.riskLevel === 'HIGH' ? 'bg-red-500' : sat.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  <div>
                    <div className="text-[11px] font-bold text-white tracking-tight group-hover:text-blue-400 transition-colors">{sat.name}</div>
                    <div className="text-[9px] text-zinc-600 font-mono font-bold">{sat.orbitType} • {sat.altitude}KM</div>
                  </div>
                </div>
                {(sat.riskLevel === 'HIGH' || atRiskIds.has(sat.id)) && (
                  <AlertTriangle className={`w-3.5 h-3.5 text-red-500 ${atRiskIds.has(sat.id) ? 'animate-pulse' : ''}`} />
                )}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Selected Info Overlay - Fixed at bottom of sidebar for seamless feel */}
      <AnimatePresence>
        {selectedSatellite && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-2xl border-t border-white/10 p-6 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-20"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-black text-white uppercase tracking-tight leading-none">{selectedSatellite.name}</h3>
                  <div className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${
                    atRiskIds.has(selectedSatellite.id) ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {selectedSatellite.type}
                  </div>
                </div>
                <p className="text-[9px] text-zinc-500 font-mono font-bold mt-1">NORAD_ID: {selectedSatellite.noradId}</p>
              </div>
              <button 
                onClick={() => onSelectSatellite(null as any)} 
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-white"
              >
                <ChevronRight className="w-4 h-4 rotate-90" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <div className="text-zinc-600 font-bold uppercase tracking-wider mb-1">Altitude</div>
                <div className="text-white font-mono font-bold">{selectedSatellite.altitude} KM</div>
              </div>
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <div className="text-zinc-600 font-bold uppercase tracking-wider mb-1">Velocity</div>
                <div className="text-white font-mono font-bold">{selectedSatellite.velocity} KM/S</div>
              </div>
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <div className="text-zinc-600 font-bold uppercase tracking-wider mb-1">Period</div>
                <div className="text-white font-mono font-bold">{selectedSatellite.period} MIN</div>
              </div>
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <div className="text-zinc-600 font-bold uppercase tracking-wider mb-1">Risk Factor</div>
                <div className={`font-black uppercase tracking-widest ${atRiskIds.has(selectedSatellite.id) ? 'text-red-500' : selectedSatellite.riskLevel === 'HIGH' ? 'text-red-500' : 'text-emerald-500'}`}>
                  {atRiskIds.has(selectedSatellite.id) ? 'CRITICAL' : selectedSatellite.riskLevel}
                </div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Tracking Signal Active</span>
              </div>
              <button className="text-[9px] text-blue-400 font-bold uppercase tracking-widest hover:underline transition-all">
                Full Telemetry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
