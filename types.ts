
export enum AppState {
  LOBBY = 'LOBBY',
  INTERVIEW = 'INTERVIEW',
  ENDED = 'ENDED'
}

export type Role = 'candidate' | 'interviewer';

export interface UserConfig {
  name: string;
  role: Role;
  accessCode: string;
}

export enum InterviewStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

export interface ChatMessage {
  id: string;
  sender: string; // 'Me' or 'Interviewer/Candidate'
  text: string;
  timestamp: number;
}

// Backend Entities
export interface Question {
  id: string;
  title: string;
  description: string;
  starterCode: Record<string, string>; // language -> code
}

export interface EvaluationReport {
  score: number;
  timeComplexity: string;
  spaceComplexity: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
}
