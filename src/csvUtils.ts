import { TeamId, PartId, MetricData, TEAM_NAMES, PART_NAMES, CsvRow, AllCsvData, WeeklyCsvData } from './types';

// 월별 근무일수 (한국 공휴일 반영)
export const WORKING_DAYS: Record<number, number[]> = {
  2023: [21, 20, 22, 20, 20, 21, 21, 22, 19, 20, 22, 20], // 248일
  2024: [22, 19, 20, 22, 21, 19, 23, 21, 18, 21, 21, 21], // 248일
  2025: [19, 20, 21, 22, 20, 20, 23, 20, 22, 19, 20, 22], // 248일
  2026: [21, 17, 22, 22, 19, 22, 23, 21, 20, 21, 21, 22], // 251일
};

export const getWorkingDays = (year: number, month: number): number => {
  return WORKING_DAYS[year]?.[month - 1] || 22; // 기본값 22일
};

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
  const weekCounts: Record<string, number> = {};

  // 1차: 주차별 데이터 합산 (totalOT, totalWH 합산, headcount 합산)
  for (const row of rows) {
    const teamId = TEAM_NAME_TO_ID[row.teamName];
    const partId = PART_NAME_TO_ID[row.partName];
    if (!teamId || !partId) continue;

    if (!allData[row.year]) allData[row.year] = {};
    if (!allData[row.year][row.month]) allData[row.year][row.month] = {} as any;
    if (!allData[row.year][row.month][teamId]) allData[row.year][row.month][teamId] = {};

    const key = `${row.year}-${row.month}-${teamId}-${partId}`;
    const existing = allData[row.year][row.month][teamId][partId];

    if (existing) {
      existing.totalWorkingHours = (existing.totalWorkingHours || 0) + row.totalWorkingHours;
      existing.totalOvertimeHours = (existing.totalOvertimeHours || 0) + row.totalOvertimeHours;
      existing.headcount += row.headcount;
      weekCounts[key] += 1;
    } else {
      allData[row.year][row.month][teamId][partId] = {
        headcount: row.headcount,
        workingHours: 0,
        overtimeHours: 0,
        totalWorkingHours: row.totalWorkingHours,
        totalOvertimeHours: row.totalOvertimeHours,
      };
      weekCounts[key] = 1;
    }
  }

  // 2차: headcount 평균 계산 및 인당 지표 산출
  for (const yearStr of Object.keys(allData)) {
    const year = parseInt(yearStr, 10);
    for (const monthStr of Object.keys(allData[year])) {
      const month = parseInt(monthStr, 10);
      for (const teamId of Object.keys(allData[year][month]) as TeamId[]) {
        for (const partId of Object.keys(allData[year][month][teamId]) as PartId[]) {
          const data = allData[year][month][teamId][partId];
          if (!data) continue;
          const key = `${year}-${month}-${teamId}-${partId}`;
          const count = weekCounts[key] || 1;
          data.headcount = parseFloat((data.headcount / count).toFixed(1));
          const hc = data.headcount || 1;
          data.workingHours = parseFloat(((data.totalWorkingHours || 0) / hc).toFixed(1));
          data.overtimeHours = parseFloat(((data.totalOvertimeHours || 0) / hc).toFixed(1));
        }
      }
    }
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
              const totalOT = partValues.reduce((acc, p) => acc + p.totalOvertimeHours, 0);
              const totalHC = partValues.reduce((acc, p) => acc + p.headcount, 0);
              entry[teamId] = totalHC > 0 ? parseFloat((totalOT / totalHC).toFixed(1)) : 0;
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

/** 해당 월의 주차 수를 월요일 기준으로 계산 (= 해당 월에 포함된 월요일 수) */
export function getWeeksInMonth(year: number, month: number): number {
  // month: 1-based
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0); // 해당 월 마지막 날
  let count = 0;
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 1) count++; // 월요일
  }
  return count;
}

/** 주차별 데이터를 합산하고 영업일수 기반으로 당월 예상값 환산 */
export function deriveMonthlyProjection(
  weeklyCsvData: WeeklyCsvData,
  year: number,
  month: number
): Record<TeamId, Partial<Record<PartId, MetricData>>> {
  const totalMonthlyBD = getWorkingDays(year, month); // 당월 총 영업일수
  const monthWeeks = weeklyCsvData[year]?.[month];

  const result: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
    team1: {}, team2: {}, team3: {},
  };

  if (!monthWeeks) return result;

  // 실제 주차(1~N)만 추출
  const availableWeeks = Object.keys(monthWeeks)
    .map(Number)
    .filter(w => w > 0)
    .sort((a, b) => a - b);

  const hasWeek0 = monthWeeks[0] !== undefined;

  if (availableWeeks.length === 0 && !hasWeek0) return result;

  // 0주차가 커버하는 주차 수: 가장 작은 실제 주차 - 1
  const coveredWeeks = hasWeek0 && availableWeeks.length > 0
    ? Math.max(availableWeeks[0] - 1, 0)
    : 0;

  // 경과 영업일수 = (0주차 커버 주수 + 실제 주차 수) × 5, 단 월 총 영업일수를 초과하지 않음
  const elapsedBD = Math.min(
    (coveredWeeks + availableWeeks.length) * 5,
    totalMonthlyBD
  );

  // 환산 비율: 월 영업일수 / 경과 영업일수
  const scaleFactor = elapsedBD > 0 ? totalMonthlyBD / elapsedBD : 1;

  // 팀/파트별 주차 데이터 수집
  const teamIds = Object.keys(TEAM_NAMES) as TeamId[];
  for (const teamId of teamIds) {
    const partAccum: Record<string, {
      totalWorkingHours: number;
      totalOvertimeHours: number;
      headcountSum: number;
      headcountCount: number;
    }> = {};

    // 1) 0주차 데이터 합산 (누적 데이터)
    if (hasWeek0) {
      const week0Data = monthWeeks[0]?.[teamId];
      if (week0Data) {
        for (const partId of Object.keys(week0Data) as PartId[]) {
          const m = week0Data[partId];
          if (!m) continue;

          if (!partAccum[partId]) {
            partAccum[partId] = { totalWorkingHours: 0, totalOvertimeHours: 0, headcountSum: 0, headcountCount: 0 };
          }

          partAccum[partId].totalWorkingHours += (m.totalWorkingHours ?? m.workingHours * m.headcount);
          partAccum[partId].totalOvertimeHours += (m.totalOvertimeHours ?? m.overtimeHours * m.headcount);
          // 0주차는 coveredWeeks 주 분량이므로 headcount 가중치 적용
          partAccum[partId].headcountSum += m.headcount * coveredWeeks;
          partAccum[partId].headcountCount += coveredWeeks;
        }
      }
    }

    // 2) 실제 주차(1~N) 데이터 합산
    for (const w of availableWeeks) {
      const weekData = monthWeeks[w]?.[teamId];
      if (!weekData) continue;

      for (const partId of Object.keys(weekData) as PartId[]) {
        const m = weekData[partId];
        if (!m) continue;

        if (!partAccum[partId]) {
          partAccum[partId] = { totalWorkingHours: 0, totalOvertimeHours: 0, headcountSum: 0, headcountCount: 0 };
        }

        partAccum[partId].totalWorkingHours += (m.totalWorkingHours ?? m.workingHours * m.headcount);
        partAccum[partId].totalOvertimeHours += (m.totalOvertimeHours ?? m.overtimeHours * m.headcount);
        partAccum[partId].headcountSum += m.headcount;
        partAccum[partId].headcountCount += 1;
      }
    }

    // 3) 영업일수 비율로 당월 예상 환산
    for (const partId of Object.keys(partAccum) as PartId[]) {
      const a = partAccum[partId];
      const totalWeeksWithData = coveredWeeks + availableWeeks.length;
      const avgHeadcount = a.headcountCount > 0 ? a.headcountSum / a.headcountCount : 1;

      // 총 시간은 영업일수 비율로 환산, 인원은 평균 유지
      const projTotalWH = a.totalWorkingHours * scaleFactor;
      const projTotalOT = a.totalOvertimeHours * scaleFactor;

      result[teamId][partId] = {
        headcount: parseFloat(avgHeadcount.toFixed(1)),
        totalWorkingHours: parseFloat(projTotalWH.toFixed(1)),
        totalOvertimeHours: parseFloat(projTotalOT.toFixed(1)),
        workingHours: parseFloat((projTotalWH / avgHeadcount).toFixed(1)),
        overtimeHours: parseFloat((projTotalOT / avgHeadcount).toFixed(1)),
      };
    }
  }

  return result;
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
