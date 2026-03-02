export type TeamId = 'team1' | 'team2' | 'team3';
export type PartId = 'manufacturing' | 'filling_molding';

export interface MetricData {
  headcount: number;      // 평균인원 (명)
  workingHours: number;   // 인당 평균 근무시간 (h)
  overtimeHours: number;  // 인당 평균 잔업시간 (h)
}

export interface WeeklyReport {
  week: string; // e.g., "2024-W08"
  teams: {
    [key in TeamId]: {
      parts: Partial<Record<PartId, MetricData>>;
    };
  };
}

export interface ComparisonData {
  current: MetricData;
  lastYear: MetricData;
  projection: MetricData;
}

export const TEAM_NAMES: Record<TeamId, string> = {
  team1: '생산1팀',
  team2: '생산2팀',
  team3: '생산3팀',
};

export const PART_NAMES: Record<PartId, string> = {
  manufacturing: '제조',
  filling_molding: '충전/성형',
};
