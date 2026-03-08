export enum OrbitType {
  LEO = 'LEO',
  MEO = 'MEO',
  GEO = 'GEO',
}

export interface Satellite {
  id: string;
  name: string;
  noradId: string;
  type: 'SATELLITE' | 'DEBRIS' | 'ISS';
  orbitType: OrbitType;
  altitude: number; // km
  velocity: number; // km/s
  period: number; // minutes
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  lastUpdated: string;
  position: [number, number, number]; // Earth-centered 3D coordinates
  tle1: string;
  tle2: string;
  isUser?: boolean;
  predictedPath?: [number, number, number][]; // Future positions for ground track
}

export interface DebrisEvent {
  id: string;
  originSatId: string;
  timestamp: number;
  fragments: {
    id: string;
    position: [number, number, number];
    velocity: [number, number, number];
  }[];
}

export interface CollisionRisk {
  id: string;
  sat1Id: string;
  sat2Id: string;
  probability: number;
  timeToImpact: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  distanceKm?: number;
}

export interface AIRecommendation {
  summary: string;
  actions: string[];
  riskAssessment: string;
}
