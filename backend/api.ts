import { GoogleGenAI } from '@google/genai';
import { MOCK_DB_QUESTIONS } from './database';
import { EvaluationReport, Question } from '../types';

// Simulates a backend service class
class BackendAPI {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Simulate GET /questions
  async getQuestions(): Promise<Question[]> {
    // Simulate network latency
    return new Promise(resolve => {
      setTimeout(() => resolve(MOCK_DB_QUESTIONS), 500);
    });
  }

  // Simulate POST /evaluate
  async generateReport(code: string, language: string, questionTitle: string): Promise<EvaluationReport> {
    const prompt = `
      Act as a strict Senior Software Engineer Code Reviewer.
      Analyze the following solution for the problem "${questionTitle}" written in ${language}.
      
      Code:
      ${code}

      Return a JSON object with this exact schema (do not include markdown formatting):
      {
        "score": number (0-100),
        "timeComplexity": "string (Big O)",
        "spaceComplexity": "string (Big O)",
        "feedback": "string (1-2 sentences summary)",
        "strengths": ["string", "string"],
        "improvements": ["string", "string"]
      }
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      
      const text = response.text || "{}";
      return JSON.parse(text) as EvaluationReport;
    } catch (e) {
      console.error("Backend API Error:", e);
      return {
        score: 0,
        timeComplexity: "Unknown",
        spaceComplexity: "Unknown",
        feedback: "Failed to generate report due to server error.",
        strengths: [],
        improvements: []
      };
    }
  }
}

export const API = new BackendAPI();