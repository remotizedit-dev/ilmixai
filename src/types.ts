export type Role = 'super_admin' | 'alt_admin' | 'support_engineer' | 'end_user';

export interface User {
  userId: string;
  email: string;
  name: string;
  phoneNumber: string;
  employeeId: string;
  role: Role;
  createdAt: string;
}

export interface PendingUser {
  email: string;
  role: Role;
  employeeId: string;
  createdBy: string;
  createdAt: string;
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TimerState = 'paused' | 'running';

export interface Ticket {
  ticketId: string;
  title: string;
  description: string;
  employeeId: string;
  creatorUserId: string;
  creatorName?: string;
  status: TicketStatus;
  assignedTo: string; // userId of support engineer
  createdAt: string;
  closedAt: string;
  totalSupportTimeSeconds: number;
  timerState: TimerState;
  timerLastStartedAt: string;
}

export interface Comment {
  commentId: string;
  ticketId: string;
  userId: string;
  authorName: string;
  text: string;
  isInternal: boolean;
  createdAt: string;
}

export interface SystemSettings {
  geminiApiUrl?: string;
  voiceToTextApi?: string;
  textToSpeechApi?: string;
  elevenlabsAgentId?: string;
  initialMessage?: string;
  aiInstructions?: string;
}

export interface SystemSetup {
  initialized: boolean;
}
