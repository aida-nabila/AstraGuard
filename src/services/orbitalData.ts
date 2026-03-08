import * as satellite from 'satellite.js';
import { Satellite, OrbitType } from '../types';

const CELESTRAK_URLS = {
  ACTIVE: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  STARLINK: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
  STATIONS: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
};

const FALLBACK_DATA = [
  {
    OBJECT_NAME: 'ISS (ZARYA)',
    NORAD_CAT_ID: '25544',
    TLE_LINE1: '1 25544U 98067A   26066.77087839  .00014056  00000+0  26707-3 0  9999',
    TLE_LINE2: '2 25544  51.6320  81.8427 0008117 167.9196 192.1989 15.48514260556039',
    _type: 'ISS'
  },
  {
    OBJECT_NAME: 'HST',
    NORAD_CAT_ID: '20580',
    TLE_LINE1: '1 20580U 90037B   26067.05050795  .00011037  00000+0  36739-3 0  9998',
    TLE_LINE2: '2 20580  28.4714  51.1800 0001798 110.1034 249.9755 15.29454135773066',
    _type: 'SATELLITE'
  },
  {
    OBJECT_NAME: 'NOAA 19',
    NORAD_CAT_ID: '33591',
    TLE_LINE1: '1 33591U 09005A   26066.96563673  .00000073  00000+0  62868-4 0  9993',
    TLE_LINE2: '2 33591  98.9609 137.7338 0012956 319.9064  40.1151 14.13456368880189',
    _type: 'SATELLITE'
  }
];

// Earth radius in km
const EARTH_RADIUS_KM = 6371;
// Scale factor to match our 3D scene (Earth radius = 5 units)
const SCALE_FACTOR = 5 / EARTH_RADIUS_KM;

function parseTLE(tleText: string, defaultType: string): any[] {
  const lines = tleText.trim().split('\n').map(l => l.trim());
  const satellites = [];
  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 < lines.length) {
      const name = lines[i];
      const tle1 = lines[i + 1];
      const tle2 = lines[i + 2];
      const noradId = tle1.substring(2, 7).trim();
      satellites.push({
        OBJECT_NAME: name,
        NORAD_CAT_ID: noradId,
        TLE_LINE1: tle1,
        TLE_LINE2: tle2,
        _type: name.includes('ISS') ? 'ISS' : defaultType
      });
    }
  }
  return satellites;
}

export async function fetchSatelliteData(): Promise<Satellite[]> {
  let combined: any[] = [];
  try {
    // Fetch multiple datasets, catch individual fetch errors to avoid failing all
    const [activeRes, starlinkRes, stationsRes] = await Promise.all([
      fetch(CELESTRAK_URLS.ACTIVE).catch(() => null),
      fetch(CELESTRAK_URLS.STARLINK).catch(() => null),
      fetch(CELESTRAK_URLS.STATIONS).catch(() => null)
    ]);

    const activeText = activeRes?.ok ? await activeRes.text().catch(() => '') : '';
    const starlinkText = starlinkRes?.ok ? await starlinkRes.text().catch(() => '') : '';
    const stationsText = stationsRes?.ok ? await stationsRes.text().catch(() => '') : '';

    const active = parseTLE(activeText, 'SATELLITE');
    const starlink = parseTLE(starlinkText, 'DEBRIS');
    const stations = parseTLE(stationsText, 'SATELLITE');

    // Combine and limit for performance
    const allCombined = [
      ...stations,
      ...active.slice(0, 200),
      ...starlink.slice(0, 200)
    ];

    const seenIds = new Set();
    combined = [];
    for (const sat of allCombined) {
      if (!seenIds.has(sat.NORAD_CAT_ID)) {
        seenIds.add(sat.NORAD_CAT_ID);
        combined.push(sat);
      }
    }
  } catch (error) {
    console.error('Error fetching satellite data:', error);
  }

  if (combined.length === 0) {
    console.warn('CelesTrak data empty or failed, using fallback data.');
    combined = FALLBACK_DATA;
  }

  return combined.map((s: any) => {
    try {
      if (!s.TLE_LINE1 || !s.TLE_LINE2) return null;
      const satrec = satellite.twoline2satrec(s.TLE_LINE1, s.TLE_LINE2);
      const now = new Date();
      const positionAndVelocity = satellite.propagate(satrec, now);
      const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;
      const velocityEci = positionAndVelocity.velocity as satellite.EciVec3<number>;
      
      let altitude = 0;
      let velocity = 0;
      let period = 0;
      let pos: [number, number, number] = [0, 0, 0];
      let path: [number, number, number][] = [];

      if (positionEci) {
        const gmst = satellite.gstime(now);
        const geodetic = satellite.eciToGeodetic(positionEci, gmst);
        altitude = geodetic.height;
        
        if (velocityEci) {
          velocity = Math.sqrt(velocityEci.x ** 2 + velocityEci.y ** 2 + velocityEci.z ** 2);
        }

        const mu = 398600.4418;
        const a = EARTH_RADIUS_KM + altitude;
        period = (2 * Math.PI * Math.sqrt(a ** 3 / mu)) / 60;

        pos = [
          positionEci.x * SCALE_FACTOR,
          positionEci.z * SCALE_FACTOR,
          -positionEci.y * SCALE_FACTOR
        ];

        for (let i = 0; i < 180; i += 2) {
          const futureTime = new Date(now.getTime() + i * 60000);
          const fPv = satellite.propagate(satrec, futureTime);
          const fPos = fPv.position as satellite.EciVec3<number>;
          if (fPos) {
            path.push([
              fPos.x * SCALE_FACTOR,
              fPos.z * SCALE_FACTOR,
              -fPos.y * SCALE_FACTOR
            ]);
          }
        }
      }

      let orbitType = OrbitType.LEO;
      if (altitude > 2000 && altitude < 35000) orbitType = OrbitType.MEO;
      if (altitude >= 35000) orbitType = OrbitType.GEO;

      return {
        id: s.NORAD_CAT_ID || s.OBJECT_ID || Math.random().toString(),
        name: s.OBJECT_NAME || 'Unknown',
        noradId: s.NORAD_CAT_ID || 'N/A',
        type: s._type as any,
        orbitType,
        altitude: Math.round(altitude),
        velocity: Number(velocity.toFixed(2)),
        period: Math.round(period),
        riskLevel: (Math.random() > 0.98 ? 'HIGH' : 'LOW') as 'HIGH' | 'LOW' | 'MEDIUM',
        lastUpdated: now.toISOString(),
        position: pos,
        tle1: s.TLE_LINE1,
        tle2: s.TLE_LINE2,
        predictedPath: path
      };
    } catch (e) {
      return null;
    }
  }).filter((s): s is any => s !== null) as Satellite[];
}

export function updateSatellitePosition(sat: Satellite, date: Date = new Date()): Satellite {
  try {
    if (!sat.tle1 || !sat.tle2) return sat;
    const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
    const positionAndVelocity = satellite.propagate(satrec, date);
    const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;

    if (positionEci) {
      const gmst = satellite.gstime(date);
      const geodetic = satellite.eciToGeodetic(positionEci, gmst);
      
      return {
        ...sat,
        altitude: Math.round(geodetic.height),
        position: [
          positionEci.x * SCALE_FACTOR,
          positionEci.z * SCALE_FACTOR,
          -positionEci.y * SCALE_FACTOR
        ],
        lastUpdated: date.toISOString(),
      };
    }
  } catch (e) {
    // Fallback if propagation fails
  }
  return sat;
}
