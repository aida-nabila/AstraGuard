import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sphere, Stars, Html, Float, PerspectiveCamera, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { Satellite, OrbitType, DebrisEvent, CollisionRisk } from '../types';

interface SpaceSceneProps {
  satellites: Satellite[];
  onSelectSatellite: (sat: Satellite) => void;
  selectedId?: string;
  timeOffset: number;
  debrisEvents: DebrisEvent[];
  atRiskIds: Set<string>;
  risks: CollisionRisk[];
}

const EARTH_RADIUS = 5;
const EARTH_RADIUS_KM = 6371;
const SCALE_FACTOR = EARTH_RADIUS / EARTH_RADIUS_KM;

const TEXTURES = {
  earth: 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
  clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
  topology: 'https://unpkg.com/three-globe/example/img/earth-topology.png',
};

const CountryBorders = ({ radius }: { radius: number }) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        const points: THREE.Vector3[] = [];
        data.features.forEach((feature: any) => {
          const coordinates = feature.geometry.coordinates;
          const type = feature.geometry.type;

          const processPolygon = (polygon: number[][]) => {
            for (let i = 0; i < polygon.length - 1; i++) {
              const p1 = polygon[i];
              const p2 = polygon[i + 1];
              points.push(latLngToVector3(p1[1], p1[0], radius));
              points.push(latLngToVector3(p2[1], p2[0], radius));
            }
          };

          if (type === 'Polygon') {
            coordinates.forEach((poly: any) => processPolygon(poly));
          } else if (type === 'MultiPolygon') {
            coordinates.forEach((multiPoly: any) => multiPoly.forEach((poly: any) => processPolygon(poly)));
          }
        });
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        setGeometry(geo);
      })
      .catch(err => console.error('Error loading borders:', err));
  }, [radius]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
    </lineSegments>
  );
};

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

const OrbitRing = ({ radius, color, label }: { radius: number, color: string, label: string }) => (
  <group>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.05, radius + 0.05, 128]} />
      <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
    </mesh>
    <Html position={[radius, 0, 0]} distanceFactor={15}>
      <div className="text-[8px] text-white/30 font-mono uppercase tracking-widest whitespace-nowrap">
        {label}
      </div>
    </Html>
  </group>
);

const OrbitShell = ({ radius, count, label }: { radius: number, count: number, label: string }) => {
  const color = useMemo(() => {
    if (label === 'LEO') {
      if (count > 200) return '#ef4444'; // Red
      if (count > 100) return '#eab308'; // Yellow
      return '#3b82f6'; // Blue
    }
    if (count > 50) return '#ef4444';
    if (count > 20) return '#eab308';
    return '#3b82f6';
  }, [count, label]);

  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 32]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0.03} 
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
};

const SatelliteObject = ({ sat, isSelected, isAtRisk, onSelect, onPositionUpdate, timeOffset }: { 
  sat: Satellite, 
  isSelected: boolean, 
  isAtRisk: boolean,
  onSelect: (sat: Satellite) => void,
  onPositionUpdate: (id: string, pos: THREE.Vector3) => void,
  timeOffset: number
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef1 = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);

  const satrec = useMemo(() => {
    if (sat.tle1 && sat.tle2) {
      return satellite.twoline2satrec(sat.tle1, sat.tle2);
    }
    return null;
  }, [sat.tle1, sat.tle2]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const nowTime = Date.now();
      const date = new Date(nowTime + timeOffset * 60000);
      
      let x = 0, y = 0, z = 0;

      if (satrec) {
        const positionAndVelocity = satellite.propagate(satrec, date);
        const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;
        
        if (positionEci) {
          x = positionEci.x * SCALE_FACTOR;
          y = positionEci.z * SCALE_FACTOR;
          z = -positionEci.y * SCALE_FACTOR;
        }
      } else if (sat.isUser) {
        const r = (EARTH_RADIUS_KM + sat.altitude) * SCALE_FACTOR;
        const periodSeconds = sat.period * 60;
        const angularVelocity = (2 * Math.PI) / periodSeconds;
        const elapsedSeconds = (nowTime + timeOffset * 60000) / 1000;
        const angle = angularVelocity * elapsedSeconds;
        const initialPos = new THREE.Vector3(...sat.position);
        const axis = new THREE.Vector3(0, 1, 0);
        const rotatedPos = initialPos.clone().applyAxisAngle(axis, angle);
        
        x = rotatedPos.x;
        y = rotatedPos.y;
        z = rotatedPos.z;
      }

      if (x !== 0 || y !== 0 || z !== 0) {
        meshRef.current.position.set(x, y, z);
        
        if (ringRef1.current) ringRef1.current.position.set(x, y, z);
        if (ringRef2.current) ringRef2.current.position.set(x, y, z);

        const worldPos = new THREE.Vector3();
        meshRef.current.getWorldPosition(worldPos);
        onPositionUpdate(sat.id, worldPos);
      }

      // Pulse effect for selection rings
      if (isSelected) {
        const pulse = Math.sin(clock.getElapsedTime() * 4) * 0.2 + 1;
        if (ringRef1.current) {
          ringRef1.current.scale.set(pulse, pulse, pulse);
          ringRef1.current.lookAt(0, 0, 0);
        }
        if (ringRef2.current) {
          const pulse2 = Math.cos(clock.getElapsedTime() * 4) * 0.2 + 1.2;
          ringRef2.current.scale.set(pulse2, pulse2, pulse2);
          ringRef2.current.lookAt(0, 0, 0);
        }
      }
    }
  });

  const isISS = sat.type === 'ISS';
  const color = (isSelected || isAtRisk || isISS) ? '#ff0000' : sat.isUser ? '#3b82f6' : sat.riskLevel === 'HIGH' ? '#ff3333' : '#eab308';
  const size = isISS ? 0.25 : sat.isUser ? 0.2 : isSelected ? 0.2 : 0.12;

  return (
    <group>
      <mesh ref={meshRef} onClick={(e) => { e.stopPropagation(); onSelect(sat); }}>
        {isISS ? <octahedronGeometry args={[size, 0]} /> : <boxGeometry args={[size, size, size]} />}
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={isSelected || isISS || isAtRisk || sat.isUser ? 10 : 2} 
        />
        {(isSelected || isISS || sat.isUser) && (
          <Html distanceFactor={10} occlude>
            <div className={`px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap border ${sat.isUser ? 'bg-blue-900/80 border-blue-500 text-white' : isISS ? 'bg-red-900/80 border-red-500 text-white' : isSelected && isAtRisk ? 'bg-red-900/80 border-red-500 text-white animate-pulse' : 'bg-black/80 border-white/20 text-white'}`}>
              {sat.isUser ? `🚀 USER: ${sat.name}` : isISS ? '📡 ISS' : isSelected && isAtRisk ? `⚠️ COLLISION RISK: ${sat.name}` : sat.name}
            </div>
          </Html>
        )}
      </mesh>

      {/* Selection Rings */}
      {isSelected && (
        <>
          <mesh ref={ringRef1}>
            <ringGeometry args={[size * 1.5, size * 1.7, 32]} />
            <meshBasicMaterial color="#ff0000" transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={ringRef2}>
            <ringGeometry args={[size * 2.2, size * 2.4, 32]} />
            <meshBasicMaterial color="#ff0000" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      
      {/* Predicted Path / Ground Track */}
      {isSelected && sat.predictedPath && (
        <line>
          <bufferGeometry>
            <bufferAttribute 
              attach="attributes-position" 
              count={Math.max(0, sat.predictedPath.length - Math.floor(timeOffset / 2))} 
              array={new Float32Array(sat.predictedPath.slice(Math.floor(timeOffset / 2)).flat())} 
              itemSize={3} 
            />
          </bufferGeometry>
          <lineBasicMaterial color="#00ffff" transparent opacity={0.5} />
        </line>
      )}
    </group>
  );
};

const DebrisBreakup = ({ event, timeOffset }: { event: DebrisEvent, timeOffset: number }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const count = event.fragments.length;
  
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  
  useFrame(() => {
    if (!pointsRef.current) return;
    
    const elapsedSeconds = (Date.now() + timeOffset * 60000 - event.timestamp) / 1000;
    if (elapsedSeconds < 0) {
      pointsRef.current.visible = false;
      return;
    }
    
    pointsRef.current.visible = true;
    
    for (let i = 0; i < count; i++) {
      const frag = event.fragments[i];
      // Simple linear expansion for debris fragments
      positions[i * 3] = (frag.position[0] + frag.velocity[0] * elapsedSeconds) * SCALE_FACTOR;
      positions[i * 3 + 1] = (frag.position[2] + frag.velocity[2] * elapsedSeconds) * SCALE_FACTOR;
      positions[i * 3 + 2] = -(frag.position[1] + frag.velocity[1] * elapsedSeconds) * SCALE_FACTOR;
    }
    
    pointsRef.current.geometry.getAttribute('position').needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute 
          attach="attributes-position" 
          count={count} 
          array={positions} 
          itemSize={3} 
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.08} 
        color="#ff3300" 
        transparent 
        opacity={0.9} 
        blending={THREE.AdditiveBlending}
        sizeAttenuation={true}
      />
    </points>
  );
};

const DebrisField = ({ count }: { count: number }) => {
  const points = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = EARTH_RADIUS + 1 + Math.random() * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }, [count]);

  const ref = useRef<THREE.Points>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.001;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={points} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#888888" transparent opacity={0.6} />
    </points>
  );
};

const CollisionLines = ({ risks, satellites, timeOffset }: { 
  risks: CollisionRisk[], 
  satellites: Satellite[],
  timeOffset: number
}) => {
  const lineRef = useRef<THREE.LineSegments>(null);

  useFrame(() => {
    if (!lineRef.current) return;
    
    const riskLines: {p1: THREE.Vector3, p2: THREE.Vector3}[] = [];
    const date = new Date(Date.now() + timeOffset * 60000);

    const getPosAt = (sat: Satellite, time: Date) => {
      if (sat.tle1 && sat.tle2) {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const pv = satellite.propagate(satrec, time);
        const pos = pv.position as satellite.EciVec3<number>;
        if (pos) return new THREE.Vector3(pos.x * SCALE_FACTOR, pos.z * SCALE_FACTOR, -pos.y * SCALE_FACTOR);
      } else if (sat.isUser) {
        const r = (EARTH_RADIUS_KM + sat.altitude) * SCALE_FACTOR;
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

    risks.forEach(risk => {
      const sat1 = satellites.find(s => s.id === risk.sat1Id);
      const sat2 = satellites.find(s => s.id === risk.sat2Id);
      
      if (sat1 && sat2) {
        const p1 = getPosAt(sat1, date);
        const p2 = getPosAt(sat2, date);
        
        if (p1 && p2) {
          riskLines.push({ p1, p2 });
        }
      }
    });

    const geometry = lineRef.current.geometry;
    const posAttr = geometry.getAttribute('position');
    let index = 0;

    riskLines.forEach(risk => {
      if (index < posAttr.count * 3) {
        posAttr.setXYZ(index++, risk.p1.x, risk.p1.y, risk.p1.z);
        posAttr.setXYZ(index++, risk.p2.x, risk.p2.y, risk.p2.z);
      }
    });

    for (let i = index; i < posAttr.count; i++) {
      posAttr.setXYZ(i, 0, 0, 0);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute 
          attach="attributes-position" 
          count={400} 
          array={new Float32Array(400 * 3)} 
          itemSize={3} 
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ff3333" transparent opacity={0.6} linewidth={2} />
    </lineSegments>
  );
};

export const SpaceScene: React.FC<SpaceSceneProps> = ({ 
  satellites, 
  onSelectSatellite, 
  selectedId,
  timeOffset,
  debrisEvents,
  atRiskIds,
  risks
}) => {
  const { controls } = useThree();
  const [positions] = useState(() => new Map<string, THREE.Vector3>());
  const earthRef = useRef<THREE.Group>(null);

  const counts = useMemo(() => {
    const leo = satellites.filter(s => s.altitude < 2000).length;
    const meo = satellites.filter(s => s.altitude >= 2000 && s.altitude < 35000).length;
    const geo = satellites.filter(s => s.altitude >= 35000).length;
    return { LEO: leo, MEO: meo, GEO: geo };
  }, [satellites]);
  
  const earthTextures = useTexture({
    map: TEXTURES.earth,
    specularMap: TEXTURES.specular,
    bumpMap: TEXTURES.topology,
  });
  const cloudTexture = useTexture(TEXTURES.clouds);

  const handlePositionUpdate = (id: string, pos: THREE.Vector3) => {
    positions.set(id, pos.clone());
  };

  const prevSelectedId = useRef<string | null>(null);
  const targetLerp = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useFrame(({ camera }) => {
    const nowTime = Date.now();
    const date = new Date(nowTime + timeOffset * 60000);
    const gmst = satellite.gstime(date);

    if (earthRef.current) {
      earthRef.current.rotation.y = gmst + Math.PI; 
    }

    // Camera focusing on selected satellite
    if (selectedId && positions.has(selectedId)) {
      const targetPos = positions.get(selectedId)!;
      targetLerp.current.lerp(targetPos, 0.1);
      
      if (controls) {
        // @ts-ignore
        controls.target.copy(targetLerp.current);
        
        // Also smoothly move camera closer if it's too far
        const idealDistance = 5; // Distance from satellite
        const currentPos = camera.position.clone();
        const direction = currentPos.clone().sub(targetPos).normalize();
        const idealCameraPos = targetPos.clone().add(direction.multiplyScalar(idealDistance));
        
        // Only move camera if it's currently very far or if we just selected it
        if (prevSelectedId.current !== selectedId) {
          camera.position.lerp(idealCameraPos, 0.1);
        }
      }
      prevSelectedId.current = selectedId;
    } else {
      // Lerp back to center if nothing is selected
      targetLerp.current.lerp(new THREE.Vector3(0, 0, 0), 0.1);
      if (controls) {
        // @ts-ignore
        controls.target.copy(targetLerp.current);
      }
      prevSelectedId.current = null;
    }
  });

  return (
    <>
      <color attach="background" args={['#020205']} />
      <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade speed={1} />
      
      <ambientLight intensity={0.4} />
      <directionalLight position={[50, 10, 50]} intensity={2} color="#ffffff" />
      
      {/* Earth Group */}
      <group ref={earthRef} rotation={[0, 0, 0.41]}> {/* Earth axial tilt */}
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
          <meshPhongMaterial 
            {...earthTextures}
            shininess={15}
            bumpScale={0.05}
          />
        </mesh>
        
        {/* Country Borders */}
        <CountryBorders radius={EARTH_RADIUS + 0.01} />
        
        {/* Clouds */}
        <mesh scale={1.01}>
          <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
          <meshPhongMaterial 
            map={cloudTexture} 
            transparent 
            opacity={0.4} 
            depthWrite={false}
          />
        </mesh>

        {/* Atmosphere Glow */}
        <mesh scale={1.15}>
          <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
          <meshPhongMaterial 
            color="#4a9eff" 
            transparent 
            opacity={0.1} 
            side={THREE.BackSide} 
          />
        </mesh>
      </group>

      {/* Orbital Regions */}
      <OrbitRing radius={EARTH_RADIUS + 2} color="#3b82f6" label="Low Earth Orbit (LEO)" />
      <OrbitRing radius={EARTH_RADIUS + 8} color="#8b5cf6" label="Medium Earth Orbit (MEO)" />
      <OrbitRing radius={EARTH_RADIUS + 12} color="#ec4899" label="Geostationary Orbit (GEO)" />

      {/* Density Heatmap Shells */}
      <OrbitShell radius={EARTH_RADIUS + 2} count={counts.LEO} label="LEO" />
      <OrbitShell radius={EARTH_RADIUS + 8} count={counts.MEO} label="MEO" />
      <OrbitShell radius={EARTH_RADIUS + 12} count={counts.GEO} label="GEO" />

      {/* Debris */}
      <DebrisField count={2000} />

      {/* Satellites */}
      {satellites.map(sat => (
        <SatelliteObject 
          key={sat.id} 
          sat={sat} 
          isSelected={sat.id === selectedId}
          isAtRisk={atRiskIds.has(sat.id)}
          onSelect={onSelectSatellite}
          onPositionUpdate={handlePositionUpdate}
          timeOffset={timeOffset}
        />
      ))}

      {/* Debris Events (Breakups) */}
      {debrisEvents.map(event => (
        <DebrisBreakup key={event.id} event={event} timeOffset={timeOffset} />
      ))}

      {/* Collision Indicators */}
      <CollisionLines risks={risks} satellites={satellites} timeOffset={timeOffset} />
    </>
  );
};
