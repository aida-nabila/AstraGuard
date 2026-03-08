import React, { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SpaceScene } from './components/Globe';
import { Dashboard } from './components/Dashboard';
import { Satellite, OrbitType, AIRecommendation, CollisionRisk, DebrisEvent } from './types';
import * as satellite from 'satellite.js';
import { analyzeOrbitalRisks } from './services/gemini';
import { fetchSatelliteData } from './services/orbitalData';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ShieldAlert } from 'lucide-react';

const generateMockRisks = (satellites: Satellite[]): CollisionRisk[] => {
  const highRiskSats = satellites.filter(s => s.riskLevel === 'HIGH');
  return highRiskSats.slice(0, 3).map((sat, i) => ({
    id: `risk-${i}`,
    sat1Id: sat.id,
    sat2Id: satellites[Math.floor(Math.random() * satellites.length)].id,
    probability: Math.floor(Math.random() * 40) + 60,
    timeToImpact: `${Math.floor(Math.random() * 120)}m`,
    severity: 'CRITICAL',
    distanceKm: Math.floor(Math.random() * 10) + 1
  }));
};

export default function App() {
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [risks, setRisks] = useState<CollisionRisk[]>([]);
  const [selectedSatellite, setSelectedSatellite] = useState<Satellite | null>(null);
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0); // minutes
  const [debrisEvents, setDebrisEvents] = useState<DebrisEvent[]>([]);
  const [atRiskIds, setAtRiskIds] = useState<Set<string>>(new Set());
  const [showAlert, setShowAlert] = useState(true);

  const handleDeploySatellite = (lat: number, lng: number, alt: number) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const r = (6371 + alt) * (5 / 6371);

    const x = -(r * Math.sin(phi) * Math.cos(theta));
    const z = r * Math.sin(phi) * Math.sin(theta);
    const y = r * Math.cos(phi);

    const mu = 398600.4418;
    const a = 6371 + alt;
    const period = (2 * Math.PI * Math.sqrt(a ** 3 / mu)) / 60;

    const newUserSat: Satellite = {
      id: `user-${Date.now()}`,
      name: `USER-SAT-${Math.floor(Math.random() * 1000)}`,
      noradId: 'USER',
      type: 'SATELLITE',
      orbitType: alt < 2000 ? OrbitType.LEO : alt < 35000 ? OrbitType.MEO : OrbitType.GEO,
      altitude: alt,
      velocity: Math.sqrt(mu / a),
      period: period,
      riskLevel: 'LOW',
      lastUpdated: new Date().toISOString(),
      position: [x, y, z],
      tle1: '',
      tle2: '',
      isUser: true
    };

    setSatellites(prev => [...prev, newUserSat]);
    setSelectedSatellite(newUserSat);
  };

  useEffect(() => {
    if (satellites.length === 0) return;

    // Detect close approaches
    const detectCollisions = () => {
      const newRisks: CollisionRisk[] = [];
      const newAtRiskIds = new Set<string>();
      const threshold = 0.02; // ~25km in simulation units

      const userSats = satellites.filter(s => s.isUser);
      const otherSats = satellites.filter(s => !s.isUser);
      
      // 1. Check current time for all satellites
      const activeSats = satellites.filter(s => s.type !== 'DEBRIS');
      const date = new Date(Date.now() + timeOffset * 60000);
      
      // Helper to get position at time
      const getPosAt = (sat: Satellite, time: Date) => {
        if (sat.tle1 && sat.tle2) {
          const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
          const pv = satellite.propagate(satrec, time);
          const pos = pv.position as satellite.EciVec3<number>;
          if (pos) return new THREE.Vector3(pos.x * (5/6371), pos.z * (5/6371), -pos.y * (5/6371));
        } else if (sat.isUser) {
          const r = (6371 + sat.altitude) * (5 / 6371);
          const periodSeconds = sat.period * 60;
          const angularVelocity = (2 * Math.PI) / periodSeconds;
          const elapsedSeconds = time.getTime() / 1000;
          const angle = angularVelocity * elapsedSeconds;
          const initialPos = new THREE.Vector3(...sat.position);
          const axis = new THREE.Vector3(0, 1, 0);
          return initialPos.clone().applyAxisAngle(axis, angle);
        }
        return null;
      };

      // Check current time offset
      for (let i = 0; i < activeSats.length; i++) {
        const posA = getPosAt(activeSats[i], date);
        if (!posA) continue;

        for (let j = i + 1; j < activeSats.length; j++) {
          const posB = getPosAt(activeSats[j], date);
          if (!posB) continue;

          const dist = posA.distanceTo(posB);
          if (dist < threshold) {
            newAtRiskIds.add(activeSats[i].id);
            newAtRiskIds.add(activeSats[j].id);
            const distKm = Math.round(dist * (6371 / 5));
            // Calculate a realistic-looking probability based on distance (closer = higher)
            // 25km = ~5%, 5km = ~40%, 1km = ~90%
            const prob = Math.min(99, Math.max(1, Math.floor(100 * Math.exp(-distKm / 3))));
            newRisks.push({
              id: `risk-${activeSats[i].id}-${activeSats[j].id}`,
              sat1Id: activeSats[i].id,
              sat2Id: activeSats[j].id,
              probability: prob,
              timeToImpact: timeOffset === 0 ? 'NOW' : `T${timeOffset > 0 ? '+' : ''}${timeOffset}m`,
              severity: distKm < 5 ? 'CRITICAL' : 'WARNING',
              distanceKm: distKm
            });
          }
        }
      }

      // 2. Predict 24h for User Satellites specifically
      userSats.forEach(userSat => {
        // Check every 15 minutes for the next 24 hours
        for (let t = 0; t < 1440; t += 15) {
          const predDate = new Date(Date.now() + t * 60000);
          const userPos = getPosAt(userSat, predDate);
          if (!userPos) continue;

          for (const otherSat of otherSats) {
            const otherPos = getPosAt(otherSat, predDate);
            if (!otherPos) continue;

            const dist = userPos.distanceTo(otherPos);
            if (dist < threshold) {
              newAtRiskIds.add(userSat.id);
              newAtRiskIds.add(otherSat.id);
              const distKm = Math.round(dist * (6371 / 5));
              const prob = Math.min(99, Math.max(1, Math.floor(100 * Math.exp(-distKm / 3))));
              newRisks.push({
                id: `pred-risk-${userSat.id}-${otherSat.id}-${t}`,
                sat1Id: userSat.id,
                sat2Id: otherSat.id,
                probability: prob,
                timeToImpact: `+${Math.floor(t/60)}h ${t%60}m`,
                severity: distKm < 5 ? 'CRITICAL' : 'WARNING',
                distanceKm: distKm
              });
              // Only one prediction per pair for simplicity
              break; 
            }
          }
        }
      });

      // Sort risks by probability descending and limit to top 10 to avoid overwhelming UI
      newRisks.sort((a, b) => b.probability - a.probability);
      setRisks(newRisks.slice(0, 10));
      setAtRiskIds(newAtRiskIds);
    };

    const timer = setTimeout(detectCollisions, 500);
    return () => clearTimeout(timer);
  }, [timeOffset, satellites]);

  useEffect(() => {
    const init = async () => {
      const realSats = await fetchSatelliteData();
      const initialRisks = generateMockRisks(realSats);
      setSatellites(realSats);
      setRisks(initialRisks);
      setIsLoading(false);
      
      const rec = await analyzeOrbitalRisks(realSats, initialRisks);
      setRecommendation(rec);
    };
    
    init();
  }, []);

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden font-sans">
      {/* 3D Viewport */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [15, 10, 15], fov: 45 }}>
          <Suspense fallback={null}>
            <SpaceScene 
              satellites={satellites} 
              onSelectSatellite={setSelectedSatellite} 
              selectedId={selectedSatellite?.id}
              timeOffset={timeOffset}
              debrisEvents={debrisEvents}
              atRiskIds={atRiskIds}
              risks={risks}
            />
            <OrbitControls 
              makeDefault
              enablePan={true} 
              minDistance={5} 
              maxDistance={200} 
              autoRotate={false}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 w-full h-full pointer-events-none flex flex-col md:flex-row">
        {/* Left Sidebar - Dashboard */}
        <div className="w-full md:w-80 lg:w-96 h-1/2 md:h-full pointer-events-auto bg-zinc-950/80 backdrop-blur-xl border-r border-white/10 shadow-[20px_0_50px_rgba(0,0,0,0.5)] flex flex-col">
          <Dashboard 
            satellites={satellites}
            recommendation={recommendation}
            risks={risks}
            atRiskIds={atRiskIds}
            onSelectSatellite={setSelectedSatellite}
            selectedSatellite={selectedSatellite}
            timeOffset={timeOffset}
            onTimeChange={setTimeOffset}
            onDeploySatellite={handleDeploySatellite}
          />
        </div>

        {/* Top Center Alert Banner */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-2 w-full max-w-md px-4">
          <AnimatePresence>
            {risks.length > 0 && (
              <div className="w-full flex flex-col items-center">
                {showAlert ? (
                  <motion.div 
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    className="bg-red-600/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-red-400/50 flex flex-col items-center shadow-lg shadow-red-500/20 w-full relative group pointer-events-auto"
                  >
                    <button 
                      onClick={() => setShowAlert(false)}
                      className="absolute top-2 right-2 p-1 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <div className="w-4 h-4 flex items-center justify-center text-[10px] font-bold">×</div>
                    </button>
                    <div className="flex items-center space-x-3 mb-2">
                      <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-widest">
                        ⚠️ Collision Risk Detected
                      </span>
                    </div>
                    <div className="space-y-1 w-full text-center">
                      {risks.slice(0, 1).map(risk => {
                        const sat1 = satellites.find(s => s.id === risk.sat1Id);
                        const sat2 = satellites.find(s => s.id === risk.sat2Id);
                        return (
                          <div key={risk.id} className="text-[10px] font-mono text-red-100">
                            <div className="uppercase">Satellite: {sat1?.name} ↔ {sat2?.name}</div>
                            <div className="flex justify-center space-x-4 mt-1">
                              <span>Time: {risk.timeToImpact}</span>
                              <span>Prob: {risk.probability}%</span>
                              {risk.distanceKm !== undefined && <span>Dist: {risk.distanceKm}km</span>}
                            </div>
                          </div>
                        );
                      })}
                      {risks.length > 1 && (
                        <div className="text-[8px] text-red-200 uppercase mt-1">
                          + {risks.length - 1} other potential impacts
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => setShowAlert(true)}
                    className="bg-red-600/90 backdrop-blur-md p-2 rounded-full border border-red-400/50 shadow-lg shadow-red-500/20 pointer-events-auto hover:bg-red-500 transition-colors"
                  >
                    <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
                  </motion.button>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Right Legend */}
        <div className="absolute bottom-4 right-4 pointer-events-auto bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 text-[9px] uppercase tracking-widest text-zinc-500 space-y-2">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>User Satellite</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Normal Satellite</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>High Risk / ISS</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>Active Collision Risk</span>
          </div>
        </div>
      </div>

      {/* Initial Loading Screen */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center space-y-4"
          >
            <div className="relative">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tighter italic">ASTRAGUARD</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.3em]">Initializing Orbital AI...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
