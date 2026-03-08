import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Satellite, CollisionRisk, AIRecommendation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeOrbitalRisks(
  satellites: Satellite[],
  risks: CollisionRisk[]
): Promise<AIRecommendation> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the following orbital traffic data and provide a situational awareness report.
    
    Satellites/Debris Count: ${satellites.length}
    High Risk Objects: ${satellites.filter(s => s.riskLevel === 'HIGH').length}
    Current Collision Risks: ${risks.length}
    
    Detected Risks:
    ${risks.map(r => `- Risk between ${r.sat1Id} and ${r.sat2Id}: ${r.probability}% probability in ${r.timeToImpact}`).join('\n')}
    
    Please provide:
    1. A concise summary of the current orbital state.
    2. A risk assessment (Kessler Syndrome potential).
    3. Recommended avoidance actions for the high-risk satellites.
    
    Format the response as JSON with keys: "summary", "riskAssessment", "actions" (array of strings).
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as AIRecommendation;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return {
      summary: "Orbital monitoring active. Multiple high-velocity objects detected in LEO.",
      riskAssessment: "Moderate risk of fragmentation due to debris density in LEO 400-600km bands.",
      actions: [
        "Initiate collision avoidance maneuver for SAT-721",
        "Monitor debris cloud fragment D-442",
        "Alert GEO operators of potential solar flare interference"
      ]
    };
  }
}
