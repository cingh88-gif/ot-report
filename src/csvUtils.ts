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
    if (row.week <= 0) continue; // only week > 0

    const teamId = TEAM_NAME_TO_ID[row.teamName];
    const partId = PART_NAME_TO_ID[row.partName];
    if (!teamId || !partId) continue;

    if (!data[row.year]) data[row.year] = {};
    if (!data[row.year][row.month]) data[row.year][row.month] = {};
    if (!data[row.year][row.month][row.week]) data[row.year][row.month][row.week] = {} as any;
    if (!data[row.year][row.month][row.week][teamId]) data[row.year][row.month][row.week][teamId] = {};

    const hc = row.headcount || 1;
    data[row.year][row.month][row.week][teamId][partId] = {
      headcount: row.headcount,
      workingHours: parseFloat((row.totalWorkingHours / hc).toFixed(1)),
      overtimeHours: parseFloat((row.totalOvertimeHours / hc).toFixed(1)),
    };
  }

  return data;
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
  // Try previous week in same month
  if (week > 1) {
    const prev = extractWeekData(data, year, month, week - 1);
    if (prev) return { data: prev, year, month, week: week - 1 };
  }

  // Cross month boundary: try previous month's highest week
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const monthWeeks = data[prevYear]?.[prevMonth];
  if (!monthWeeks) return null;

  const maxWeek = Math.max(...Object.keys(monthWeeks).map(Number));
  const result = extractWeekData(data, prevYear, prevMonth, maxWeek);
  return result ? { data: result, year: prevYear, month: prevMonth, week: maxWeek } : null;
}
