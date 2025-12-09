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

export interface CodeExecutionResult {
  output: string;
  isError: boolean;
}

export enum InterviewStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}