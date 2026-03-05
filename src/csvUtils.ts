import { TeamId, PartId, MetricData, TEAM_NAMES, PART_NAMES, CsvRow, AllCsvData, WeeklyCsvData } from './types';

const TEAM_NAME_TO_ID: Record<string, TeamId> = {};
(Object.keys(TEAM_NAMES) as TeamId[]).forEach(id => {
  TEAM_NAME_TO_ID[TEAM_NAMES[id]] = id;
});

const PART_NAME_TO_ID: Record<string, PartId> = {};
(Object.keys(PART_NAMES) as PartId[]).forEach(id => {
  PART_NAME_TO_ID[PART_NAMES[id]] = id;
});

export function parseCsvRows(rawRows: Record<string, string>[]): CsvRow[] {
  return rawRows
    .map(row => {
      const teamName = (row['팀 구분'] || row['팀'] || '').trim();
      const partName = (row['파트 구분'] || row['파트'] || '').trim();
      const year = parseInt(row['연도'] || '0', 10);
      const month = parseInt(row['월'] || '0', 10);
      const week = parseInt(row['주차'] || '0', 10);
      const headcount = parseFloat(row['평균인원'] || '0') || 0;
      const totalWorkingHours = parseFloat(row['총 근무시간(h)'] || '0') || 0;
      const totalOvertimeHours = parseFloat(row['총 잔업시간(h)'] || '0') || 0;

      return { teamName, partName, year, month, week, headcount, totalWorkingHours, totalOvertimeHours };
    })
    .filter(r => r.teamName && r.partName && r.year > 0 && r.month > 0);
}

export function buildAllCsvData(rows: CsvRow[]): AllCsvData {
  const allData: AllCsvData = {};

  for (const row of rows) {
    const teamId = TEAM_NAME_TO_ID[row.teamName];
    const partId = PART_NAME_TO_ID[row.partName];
    if (!teamId || !partId) continue;

    if (!allData[row.year]) allData[row.year] = {};
    if (!allData[row.year][row.month]) allData[row.year][row.month] = {} as any;
    if (!allData[row.year][row.month][teamId]) allData[row.year][row.month][teamId] = {};

    const hc = row.headcount || 1;
    allData[row.year][row.month][teamId][partId] = {
      headcount: row.headcount,
      workingHours: parseFloat((row.totalWorkingHours / hc).toFixed(1)),
      overtimeHours: parseFloat((row.totalOvertimeHours / hc).toFixed(1)),
      totalWorkingHours: row.totalWorkingHours,
      totalOvertimeHours: row.totalOvertimeHours,
    };
  }

  return allData;
}

export function findLatestPeriod(allData: AllCsvData): { year: number; month: number } {
  let latestYear = 0;
  let latestMonth = 0;

  for (const yearStr of Object.keys(allData)) {
    const year = parseInt(yearStr, 10);
    for (const monthStr of Object.keys(allData[year])) {
      const month = parseInt(monthStr, 10);
      if (year > latestYear || (year === latestYear && month > latestMonth)) {
        latestYear = year;
        latestMonth = month;
      }
    }
  }

  return { year: latestYear, month: latestMonth };
}

export function extractPeriodData(
  allData: AllCsvData,
  year: number,
  month: number
): Record<TeamId, Partial<Record<PartId, MetricData>>> {
  const periodData = allData[year]?.[month];
  if (!periodData) {
    return {
      team1: {},
      team2: {},
      team3: {},
    };
  }

  const result: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
    team1: {},
    team2: {},
    team3: {},
  };

  for (const teamId of Object.keys(TEAM_NAMES) as TeamId[]) {
    if (periodData[teamId]) {
      result[teamId] = { ...periodData[teamId] };
    }
  }

  return result;
}

export function deriveProjectionData(
  allData: AllCsvData,
  year: number,
  month: number
): Record<TeamId, Partial<Record<PartId, MetricData>>> {
  // Use previous month's data as projection baseline
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  return extractPeriodData(allData, prevYear, prevMonth);
}

export function deriveLastYearData(
  allData: AllCsvData,
  year: number,
  month: number
): Record<TeamId, Partial<Record<PartId, MetricData>>> {
  return extractPeriodData(allData, year - 1, month);
}

export function deriveLastYearAvgData(
  allData: AllCsvData,
  year: number
): Record<TeamId, Partial<Record<PartId, MetricData>>> {
  const lastYear = year - 1;
  const yearData = allData[lastYear];
  const result: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
    team1: {}, team2: {}, team3: {},
  };

  if (!yearData) return result;

  for (const teamId of Object.keys(TEAM_NAMES) as TeamId[]) {
    const partAccum: Record<string, { headcount: number; workingHours: number; overtimeHours: number; count: number }> = {};

    for (const monthKey of Object.keys(yearData)) {
      const monthData = yearData[parseInt(monthKey, 10)];
      if (!monthData || !monthData[teamId]) continue;
      for (const partId of Object.keys(monthData[teamId]) as PartId[]) {
        const m = monthData[teamId][partId];
        if (!m) continue;
        if (!partAccum[partId]) {
          partAccum[partId] = { headcount: 0, workingHours: 0, overtimeHours: 0, count: 0 };
        }
        partAccum[partId].headcount += m.headcount;
        partAccum[partId].workingHours += m.workingHours;
        partAccum[partId].overtimeHours += m.overtimeHours;
        partAccum[partId].count += 1;
      }
    }

    for (const partId of Object.keys(partAccum) as PartId[]) {
      const a = partAccum[partId];
      result[teamId][partId] = {
        headcount: parseFloat((a.headcount / a.count).toFixed(1)),
        workingHours: parseFloat((a.workingHours / a.count).toFixed(1)),
        overtimeHours: parseFloat((a.overtimeHours / a.count).toFixed(1)),
      };
    }
  }

  return result;
}

export function buildHistoricalTrendData(
  allData: AllCsvData
): Record<number, { month: string; [teamId: string]: number | string }[]> {
  const result: Record<number, { month: string; [teamId: string]: number | string }[]> = {};
  const teamIds = Object.keys(TEAM_NAMES) as TeamId[];

  for (const yearStr of Object.keys(allData).sort()) {
    const year = parseInt(yearStr, 10);
    const months = Object.keys(allData[year]).map(Number).sort((a, b) => a - b);

    result[year] = [];
    for (let m = 1; m <= 12; m++) {
      const entry: any = { month: `${m}월` };
      if (months.includes(m)) {
        const monthData = allData[year][m];
        for (const teamId of teamIds) {
          const parts = monthData[teamId];
          if (parts) {
            const partValues = Object.values(parts).filter(Boolean) as MetricData[];
            if (partValues.length > 0) {
              entry[teamId] = parseFloat(
                (partValues.reduce((acc, p) => acc + p.overtimeHours, 0) / partValues.length).toFixed(1)
              );
            }
          }
        }
      }
      result[year].push(entry);
    }
  }

  return result;
}

export function buildWeeklyCsvData(rows: CsvRow[]): WeeklyCsvData {
  const data: WeeklyCsvData = {};

  for (const row of rows) {
    const teamId = TEAM_NAME_TO_ID[row.teamName];
    const partId = PART_NAME_TO_ID[row.partName];
    if (!teamId || !partId) continue;

    const week = row.week >= 0 ? row.week : 0;

    if (!data[row.year]) data[row.year] = {};
    if (!data[row.year][row.month]) data[row.year][row.month] = {};
    if (!data[row.year][row.month][week]) data[row.year][row.month][week] = {} as any;
    if (!data[row.year][row.month][week][teamId]) data[row.year][row.month][week][teamId] = {};

    const hc = row.headcount || 1;
    data[row.year][row.month][week][teamId][partId] = {
      headcount: row.headcount,
      workingHours: parseFloat((row.totalWorkingHours / hc).toFixed(1)),
      overtimeHours: parseFloat((row.totalOvertimeHours / hc).toFixed(1)),
      totalWorkingHours: row.totalWorkingHours,
      totalOvertimeHours: row.totalOvertimeHours,
    };
  }

  return data;
}

/** 해당 월에서 가장 높은 주차 번호를 반환 (데이터 기준) */
export function findLatestWeek(data: WeeklyCsvData, year: number, month: number): number | null {
  const monthWeeks = data[year]?.[month];
  if (!monthWeeks) return null;
  const weeks = Object.keys(monthWeeks).map(Number);
  return weeks.length > 0 ? Math.max(...weeks) : null;
}

export function extractWeekData(
  data: WeeklyCsvData,
  year: number,
  month: number,
  week: number
): Record<TeamId, Partial<Record<PartId, MetricData>>> | null {
  const weekData = data[year]?.[month]?.[week];
  if (!weekData) return null;

  const result: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
    team1: {},
    team2: {},
    team3: {},
  };

  for (const teamId of Object.keys(TEAM_NAMES) as TeamId[]) {
    if (weekData[teamId]) {
      result[teamId] = { ...weekData[teamId] };
    }
  }

  // Check if there's actually any data
  const hasData = Object.values(result).some(team => Object.keys(team).length > 0);
  return hasData ? result : null;
}

export interface PreviousWeekResult {
  data: Record<TeamId, Partial<Record<PartId, MetricData>>>;
  year: number;
  month: number;
  week: number;
}

export function findPreviousWeek(
  data: WeeklyCsvData,
  year: number,
  month: number,
  week: number
): PreviousWeekResult | null {
  // 같은 월 내에서 현재 주차보다 낮은 주차를 역순 탐색
  const monthWeeks = data[year]?.[month];
  if (monthWeeks) {
    const lowerWeeks = Object.keys(monthWeeks).map(Number).filter(w => w < week).sort((a, b) => b - a);
    if (lowerWeeks.length > 0) {
      const prevWeek = lowerWeeks[0];
      const result = extractWeekData(data, year, month, prevWeek);
      if (result) return { data: result, year, month, week: prevWeek };
    }
  }

  // 같은 월에 없으면 → 이전 월의 가장 높은 주차
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const prevMonthWeeks = data[prevYear]?.[prevMonth];
  if (!prevMonthWeeks) return null;

  const maxWeek = Math.max(...Object.keys(prevMonthWeeks).map(Number));
  const result = extractWeekData(data, prevYear, prevMonth, maxWeek);
  return result ? { data: result, year: prevYear, month: prevMonth, week: maxWeek } : null;
}
