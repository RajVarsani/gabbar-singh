export type CoreMemory = {
  users: Record<string, { name: string; role?: string; notes?: string }>;
  workspace: Record<string, string>;
};

export type EpisodicMemory = {
  id: string;
  fact: string;
  tags: string[];
  importance: number; // 1-5
  created: number; // timestamp ms
  accessed: number; // timestamp ms
  accessCount: number;
  source: string; // channel:threadTs
};

export type ScoredMemory = EpisodicMemory & { score: number };
