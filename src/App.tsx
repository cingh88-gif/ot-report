import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, ComposedChart, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, Clock, AlertCircle, 
  ChevronRight, LayoutDashboard, FileText, Settings, 
  Plus, Save, Calendar, ArrowUpRight, ArrowDownRight,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Papa from 'papaparse';
import { format, startOfWeek, endOfWeek, getWeekOfMonth, lastDayOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { TeamId, PartId, TEAM_NAMES, PART_NAMES, MetricData, AllCsvData, WeeklyCsvData } from './types';
import {
  parseCsvRows,
  buildAllCsvData,
  findLatestPeriod,
  extractPeriodData,
  deriveProjectionData,
  deriveLastYearData,
  buildHistoricalTrendData,
  buildWeeklyCsvData,
  extractWeekData,
  findLatestWeek,
  findPreviousWeek,
  PreviousWeekResult,
} from './csvUtils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 월별 근무일수 (한국 공휴일 반영)
const WORKING_DAYS: Record<number, number[]> = {
  2023: [21, 20, 22, 20, 20, 21, 21, 22, 19, 20, 22, 20], // 248일
  2024: [22, 19, 20, 22, 21, 19, 23, 21, 18, 21, 21, 21], // 248일
  2025: [19, 20, 21, 22, 20, 20, 23, 20, 22, 19, 20, 22], // 248일
  2026: [21, 17, 22, 22, 19, 22, 23, 21, 20, 21, 21, 22], // 251일
};

const getWorkingDays = (year: number, month: number): number => {
  return WORKING_DAYS[year]?.[month - 1] || 22; // 기본값 22일
};

// Mock Initial Data
const INITIAL_DATA: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
  team1: {
    manufacturing: { headcount: 24, workingHours: 40, overtimeHours: 8 },
  },
  team2: {
    manufacturing: { headcount: 18, workingHours: 40, overtimeHours: 6 },
    filling_molding: { headcount: 32, workingHours: 40, overtimeHours: 12 },
  },
  team3: {
    manufacturing: { headcount: 15, workingHours: 40, overtimeHours: 4 },
    filling_molding: { headcount: 28, workingHours: 40, overtimeHours: 10 },
  },
};

const LAST_YEAR_DATA: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
  team1: {
    manufacturing: { headcount: 22, workingHours: 40, overtimeHours: 5 },
  },
  team2: {
    manufacturing: { headcount: 20, workingHours: 40, overtimeHours: 4 },
    filling_molding: { headcount: 30, workingHours: 40, overtimeHours: 8 },
  },
  team3: {
    manufacturing: { headcount: 14, workingHours: 40, overtimeHours: 3 },
    filling_molding: { headcount: 25, workingHours: 40, overtimeHours: 7 },
  },
};

const PROJECTION_DATA: Record<TeamId, Partial<Record<PartId, MetricData>>> = {
  team1: {
    manufacturing: { headcount: 25, workingHours: 40, overtimeHours: 7 },
  },
  team2: {
    manufacturing: { headcount: 19, workingHours: 40, overtimeHours: 5 },
    filling_molding: { headcount: 35, workingHours: 40, overtimeHours: 10 },
  },
  team3: {
    manufacturing: { headcount: 16, workingHours: 40, overtimeHours: 5 },
    filling_molding: { headcount: 30, workingHours: 40, overtimeHours: 9 },
  },
};

// Generate Historical Monthly Data (2023-2026)
const YEARS = [2023, 2024, 2025, 2026];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const generateHistoricalData = () => {
  const data: any = {};
  YEARS.forEach(year => {
    data[year] = MONTHS.map(month => {
      const monthData: any = { month: `${month}월` };
      Object.keys(TEAM_NAMES).forEach(teamId => {
        const baseOvertime = teamId === 'team1' ? 8 : teamId === 'team2' ? 10 : 6;
        // Add some randomness based on year and month
        const variance = (year - 2023) * 0.5 + Math.cos(month) * 2;
        monthData[teamId] = Math.max(0, parseFloat((baseOvertime + variance).toFixed(1)));
      });
      return monthData;
    });
  });
  return data;
};

const HISTORICAL_TREND_DATA = generateHistoricalData();

export default function App() {
  const [currentData, setCurrentData] = useState(INITIAL_DATA);
  const [allCsvData, setAllCsvData] = useState<AllCsvData | null>(null);
  const [weeklyCsvData, setWeeklyCsvData] = useState<WeeklyCsvData | null>(null);
  const [currentWeekData, setCurrentWeekData] = useState<Record<TeamId, Partial<Record<PartId, MetricData>>> | null>(null);
  const [prevWeekData, setPrevWeekData] = useState<Record<TeamId, Partial<Record<PartId, MetricData>>> | null>(null);
  const [currentWeekInfo, setCurrentWeekInfo] = useState<{ month: number; week: number } | null>(null);
  const [prevWeekInfo, setPrevWeekInfo] = useState<{ month: number; week: number } | null>(null);
  const [prevMonthData, setPrevMonthData] = useState(LAST_YEAR_DATA);
  const [lastYearData, setLastYearData] = useState(LAST_YEAR_DATA);
  const [projectionData, setProjectionData] = useState(PROJECTION_DATA);
  const [historicalTrendData, setHistoricalTrendData] = useState(HISTORICAL_TREND_DATA);
  const [displayPeriod, setDisplayPeriod] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [selectedYears, setSelectedYears] = useState<number[]>([2025, 2026]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(MONTHS);
  const [selectedTeams, setSelectedTeams] = useState<TeamId[]>(Object.keys(TEAM_NAMES) as TeamId[]);
  const [showTeamAverage, setShowTeamAverage] = useState(false);
  const [reportDate, setReportDate] = useState(new Date());

  // Auto-load CSV data on mount
  useEffect(() => {
    const loadCsv = async () => {
      try {
        const res = await fetch('/data.csv');
        const csvText = await res.text();
        const parseResult = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        const rows = parseCsvRows(parseResult.data as Record<string, string>[]);
        if (rows.length === 0) return;

        const allData = buildAllCsvData(rows);
        const weeklyData = buildWeeklyCsvData(rows);
        setAllCsvData(allData);
        setWeeklyCsvData(weeklyData);
        setHistoricalTrendData(buildHistoricalTrendData(allData));
        setSelectedYears(Object.keys(allData).map(Number).sort((a, b) => a - b).slice(-2));
      } catch (err) {
        console.error('[CSV-LOAD] error:', err);
      }
    };
    loadCsv();
  }, []);

  // Update current/lastYear/projection data when reportDate or allCsvData changes
  useEffect(() => {
    if (!allCsvData) return;
    let year = reportDate.getFullYear();
    let month = reportDate.getMonth() + 1;

    const extracted = extractPeriodData(allCsvData, year, month);
    // If no data for selected month, fallback to latest available period
    const hasData = Object.values(extracted).some(team => Object.keys(team).length > 0);
    if (!hasData) {
      const latest = findLatestPeriod(allCsvData);
      year = latest.year;
      month = latest.month;
    }

    setDisplayPeriod({ year, month });
    setCurrentData(extractPeriodData(allCsvData, year, month));
    setLastYearData(deriveLastYearData(allCsvData, year, month));
    setProjectionData(deriveProjectionData(allCsvData, year, month));

    // 전월 기본값
    let prevM = month - 1;
    let prevY = year;
    if (prevM < 1) { prevM = 12; prevY -= 1; }
    setPrevMonthData(extractPeriodData(allCsvData, prevY, prevM));

    // Weekly data for table-1: 데이터 기준 최신 주차 탐색
    if (weeklyCsvData) {
      const latestWeek = findLatestWeek(weeklyCsvData, year, month);
      if (latestWeek !== null) {
        const curWeek = extractWeekData(weeklyCsvData, year, month, latestWeek);
        const prvWeekResult = curWeek ? findPreviousWeek(weeklyCsvData, year, month, latestWeek) : null;
        setCurrentWeekData(curWeek);
        setCurrentWeekInfo({ month, week: latestWeek });
        setPrevWeekData(prvWeekResult?.data ?? null);
        setPrevWeekInfo(prvWeekResult ? { month: prvWeekResult.month, week: prvWeekResult.week } : null);
      } else {
        setCurrentWeekData(null);
        setCurrentWeekInfo(null);
        setPrevWeekData(null);
        setPrevWeekInfo(null);
      }
    } else {
      setCurrentWeekData(null);
      setCurrentWeekInfo(null);
      setPrevWeekData(null);
      setPrevWeekInfo(null);
    }
  }, [reportDate, allCsvData, weeklyCsvData]);

  const getWeekString = (date: Date) => {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    const weekOfMonth = getWeekOfMonth(date, { weekStartsOn: 1 });
    
    return `${format(date, 'yyyy년 M월')} ${weekOfMonth}주차 (${format(start, 'MM.dd')} - ${format(end, 'MM.dd')})`;
  };

  const toggleYear = (year: number) => {
    setSelectedYears(prev => 
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year].sort()
    );
  };

  const toggleMonth = (month: number) => {
    setSelectedMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => a - b)
    );
  };

  const toggleTeam = (teamId: TeamId) => {
    setSelectedTeams(prev =>
      prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId]
    );
  };

  const availableYears = useMemo(() => {
    if (allCsvData) {
      return Object.keys(allCsvData).map(Number).sort((a, b) => a - b);
    }
    return YEARS;
  }, [allCsvData]);

  const DYNAMIC_YEAR_COLORS = useMemo(() => {
    const palette = ['#BDC3C7', '#7F8C8D', '#34495E', '#2980B9', '#8E44AD', '#27AE60', '#E67E22', '#E74C3C'];
    const colors: Record<number, string> = {};
    availableYears.forEach((year, i) => {
      colors[year] = palette[i % palette.length];
    });
    // Override: make the latest year the accent color
    if (availableYears.length > 0) {
      colors[availableYears[availableYears.length - 1]] = '#2980B9';
      if (availableYears.length > 1) {
        colors[availableYears[availableYears.length - 2]] = '#34495E';
      }
    }
    return colors;
  }, [availableYears]);

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      let csvText: string;

      // Try EUC-KR first, fallback to UTF-8
      try {
        csvText = new TextDecoder('euc-kr').decode(buffer);
        // Verify: if the decoded text doesn't contain expected Korean chars, try UTF-8
        if (!csvText.includes('팀') && !csvText.includes('파트')) {
          csvText = new TextDecoder('utf-8').decode(buffer);
        }
      } catch {
        csvText = new TextDecoder('utf-8').decode(buffer);
      }

      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      const rows = parseCsvRows(parseResult.data as Record<string, string>[]);
      if (rows.length === 0) {
        alert('업로드된 파일에서 유효한 데이터를 찾을 수 없습니다. 양식을 확인해주세요.');
        return;
      }

      const allData = buildAllCsvData(rows);
      const trendData = buildHistoricalTrendData(allData);
      const years = Object.keys(allData).map(Number).sort((a, b) => a - b);

      setAllCsvData(allData);
      setWeeklyCsvData(buildWeeklyCsvData(rows));
      setHistoricalTrendData(trendData);
      setSelectedYears(years.slice(-2));
      // currentData, lastYearData, projectionData will be updated by the reportDate useEffect

      alert(`${rows.length}건의 데이터가 업로드되었습니다. 선택된 날짜(${reportDate.getFullYear()}년 ${reportDate.getMonth() + 1}월) 기준으로 표시됩니다.`);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleInputChange = (teamId: TeamId, partId: PartId, field: keyof MetricData, value: string) => {
    const numValue = parseFloat(value) || 0;
    const teamData = currentData[teamId];
    const partData = teamData[partId];
    
    if (!partData) return;

    setCurrentData(prev => ({
      ...prev,
      [teamId]: {
        ...prev[teamId],
        [partId]: {
          ...partData,
          [field]: numValue
        }
      }
    }));
  };

  const chartData = useMemo(() => {
    const data: any[] = [];
    (Object.keys(TEAM_NAMES) as TeamId[]).forEach((teamId) => {
      const tName = TEAM_NAMES[teamId];
      const teamParts = currentData[teamId];

      (Object.keys(teamParts) as PartId[]).forEach((partId) => {
        const metrics = teamParts[partId];
        if (!metrics) return;

        const ly = lastYearData[teamId]?.[partId] || { headcount: 0, workingHours: 0, overtimeHours: 0 };

        data.push({
          name: `${tName} (${PART_NAMES[partId]})`,
          headcount: metrics.headcount,
          headcountLY: ly.headcount,
          overtime: metrics.overtimeHours,
          overtimeLY: ly.overtimeHours,
          working: metrics.workingHours,
          workingLY: ly.workingHours,
        });
      });
    });
    return data;
  }, [currentData, lastYearData]);

  // Combine historical data for selected years into a single array for the trend chart
  // Each line = year + team combination (e.g. "2025년 생산1팀")
  const trendChartData = useMemo(() => {
    return MONTHS
      .filter(m => selectedMonths.includes(m))
      .map(monthIdx => {
        const entry: any = { name: `${monthIdx}월` };
        selectedYears.forEach(year => {
          const yearArr = historicalTrendData[year];
          if (!yearArr) return;
          const yearData = yearArr[monthIdx - 1];
          if (!yearData) return;
          selectedTeams.forEach(tid => {
            if (typeof yearData[tid] === 'number') {
              entry[`${year}년 ${TEAM_NAMES[tid]}`] = yearData[tid] as number;
            }
          });
          if (showTeamAverage) {
            const allTeamIds = Object.keys(TEAM_NAMES) as TeamId[];
            const validAll = allTeamIds.filter(tid => typeof yearData[tid] === 'number');
            if (validAll.length > 0) {
              const avg = validAll.reduce((acc, tid) => acc + (yearData[tid] as number), 0) / validAll.length;
              entry[`${year}년 생산팀`] = parseFloat(avg.toFixed(1));
            }
          }
        });
        return entry;
      });
  }, [selectedYears, selectedMonths, selectedTeams, historicalTrendData]);

  // Build line keys and colors for the trend chart
  const TEAM_STROKE_COLORS: Record<TeamId, string> = {
    team1: '#2563EB', // blue
    team2: '#DC2626', // red
    team3: '#16A34A', // green
  };
  const YEAR_DASH_PATTERNS: Record<number, string> = {};
  // Oldest years get dashes, latest is solid
  availableYears.forEach((year, i) => {
    if (i < availableYears.length - 1) {
      YEAR_DASH_PATTERNS[year] = `${6 - i * 2} ${3}`;
    } else {
      YEAR_DASH_PATTERNS[year] = '';
    }
  });

  const AVERAGE_COLOR = '#F59E0B'; // amber

  const trendLineKeys = useMemo(() => {
    const keys: { key: string; color: string; dash: string }[] = [];
    selectedYears.forEach(year => {
      if (showTeamAverage) {
        keys.push({
          key: `${year}년 생산팀`,
          color: AVERAGE_COLOR,
          dash: YEAR_DASH_PATTERNS[year] || '',
        });
      }
      selectedTeams.forEach(tid => {
        keys.push({
          key: `${year}년 ${TEAM_NAMES[tid]}`,
          color: TEAM_STROKE_COLORS[tid],
          dash: YEAR_DASH_PATTERNS[year] || '',
        });
      });
    });
    return keys;
  }, [selectedYears, selectedTeams, showTeamAverage, availableYears]);

  const YEAR_COLORS = DYNAMIC_YEAR_COLORS;

  const buildTable1Rows = (
    curData: Record<TeamId, Partial<Record<PartId, MetricData>>>,
    prevData: Record<TeamId, Partial<Record<PartId, MetricData>>>,
    period: { year: number; month: number; week: number },
    prevPeriod: { year: number; month: number; week: number }
  ) => {
    // week > 0이면 주간(WD=5), week === 0이면 월간(해당 월 영업일수)
    const curWD = period.week > 0 ? 5 : getWorkingDays(period.year, period.month);
    const prevWD = prevPeriod.week > 0 ? 5 : getWorkingDays(prevPeriod.year, prevPeriod.month);

    return (Object.keys(TEAM_NAMES) as TeamId[]).map(teamId => {
      const parts = Object.keys(curData[teamId]) as PartId[];
      return parts.map((partId, pIdx) => {
        const curr = curData[teamId][partId]!;
        const prev = (prevData[teamId]?.[partId]) || { headcount: 0, workingHours: 0, overtimeHours: 0 };

        const metrics = [
          { label: '평균 인원(명)', cVal: curr.headcount, pVal: prev.headcount },
          { label: '인당 평균 근무시간(h)', cVal: parseFloat((curr.workingHours / curWD).toFixed(1)), pVal: parseFloat((prev.workingHours / prevWD).toFixed(1)) },
          { label: '인당 평균 잔업시간(h)', cVal: parseFloat((curr.overtimeHours / curWD).toFixed(1)), pVal: parseFloat((prev.overtimeHours / prevWD).toFixed(1)) },
        ];

        return metrics.map((m, mIdx) => {
          const diff = m.pVal !== 0 ? ((m.cVal - m.pVal) / m.pVal * 100).toFixed(1) : '0.0';
          const isUp = m.cVal > m.pVal;
          const rowspanTeam = pIdx === 0 && mIdx === 0 ? '<td rowspan="' + (parts.length * 3) + '" class="bg-group">' + TEAM_NAMES[teamId] + '</td>' : '';
          const rowspanPart = mIdx === 0 ? '<td rowspan="3" class="bg-subgroup">' + PART_NAMES[partId] + '</td>' : '';
          const otClass = m.label.includes('잔업') && m.cVal > 2 ? 'text-rose-500' : '';

          return '<tr class="data-row">'
            + rowspanTeam
            + rowspanPart
            + '<td>' + m.label + '</td>'
            + '<td class="font-mono base-val">' + m.pVal + '</td>'
            + '<td contenteditable="true" class="font-mono font-bold editable-cell ' + otClass + '">' + m.cVal + '</td>'
            + '<td class="font-mono growth-val ' + (isUp ? 'val-up' : 'val-down') + '">' + (isUp ? '▲' : '▼') + ' ' + Math.abs(parseFloat(diff)) + '%</td>'
            + '</tr>';
        }).join('');
      }).join('');
    }).join('');
  };

  const generateReport = () => {
    const reportWindow = window.open('', '_blank', 'width=1000,height=1200');
    if (!reportWindow) {
      alert('팝업 차단이 설정되어 있습니다. 팝업을 허용해주세요.');
      return;
    }

    const reportHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>생산팀 OT 주간 보고</title>
          <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+KR:wght@400;700&display=swap');
            @page { size: A4 portrait; margin: 5mm; }
            body { font-family: 'Inter', 'Noto Sans KR', sans-serif; background: white; color: #1e293b; padding: 5px; }
            .a4-page { width: 210mm; margin: 0 auto; background: white; }
            @media print {
              body { background: none; padding: 0 !important; }
              .no-print { display: none; }
              .a4-page { width: 100%; margin: 0; border: none; box-shadow: none; }
              .editable-field { border: none !important; padding: 0 !important; outline: none !important; }
              .editable-cell { border: none !important; background: none !important; }
            }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
            th { background: #f1f5f9; font-weight: 700; font-size: 9px; color: #475569; border: 1px solid #cbd5e1; height: 24px; }
            td { border: 1px solid #cbd5e1; padding: 2px 4px; text-align: center; font-size: 9px; height: 20px; }
            
            /* Column Width Adjustments */
            th:nth-child(1), td:nth-child(1) { width: 70px; } /* 팀구분 */
            th:nth-child(2), td:nth-child(2) { width: 70px; } /* 파트 구분 */
            th:nth-child(3), td:nth-child(3) { width: 140px; white-space: nowrap; } /* 구분 - No wrap */
            
            .bg-group { background: #f8fafc; font-weight: 700; }
            .bg-subgroup { background: #ffffff; font-weight: 600; }
            .val-up { color: #ef4444; font-weight: 700; }
            .val-down { color: #3b82f6; font-weight: 700; }
            
            .editable-field { border: 1px dashed #cbd5e1; padding: 2px 4px; border-radius: 4px; }
            .editable-cell { 
              background: #fffef0; 
              border: 1px dashed #fbbf24 !important; 
              cursor: text;
              transition: background 0.2s;
            }
            .editable-cell:hover { background: #fffbeb; }
            .editable-cell:focus { outline: 2px solid #fbbf24; background: white; }
            
            .page-break {
              page-break-before: always;
              break-before: page;
            }
          </style>
        </head>
        <body>
          <div class="no-print flex flex-col items-center gap-4 mb-6">
            <div class="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <span>💡 <b>노란색 점선 칸</b>의 수치를 직접 수정하면 <b>증감율이 자동 계산</b>됩니다.</span>
            </div>
            <button onclick="window.print()" class="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">
              🖨️ 보고서 인쇄 / PDF 저장
            </button>
          </div>
          
          <div class="a4-page p-2">
            <div class="flex justify-between items-end mb-4 border-b-2 border-slate-900 pb-1">
              <div>
                <h1 class="text-lg font-bold">생산팀 OT 주간 보고</h1>
                <p class="text-[9px] text-slate-500 font-medium mt-0.5">${getWeekString(reportDate)}</p>
              </div>
              <div class="text-right text-[10px]">
                <span class="font-bold text-slate-400 mr-2">REPORT DATE:</span>
                <span contenteditable="true" class="editable-field font-bold">${format(reportDate, 'yyyy. MM. dd')}</span>
              </div>
            </div>

            <h2 class="text-xs font-bold mb-1">1. 영업일수 1일 기준, 인당 평균</h2>
            <table id="table-1">
              <thead>
                <tr>
                  <th>팀구분</th>
                  <th>파트 구분</th>
                  <th>구분</th>
                  <th>전주(${prevWeekInfo ? `${prevWeekInfo.month}월 ${prevWeekInfo.week}주차` : ''})</th>
                  <th>금주(${currentWeekInfo ? `${currentWeekInfo.month}월 ${currentWeekInfo.week}주차` : ''})</th>
                  <th>증감율</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  if (currentWeekData && prevWeekData && currentWeekInfo && prevWeekInfo) {
                    return buildTable1Rows(
                      currentWeekData, prevWeekData,
                      { ...displayPeriod, week: currentWeekInfo.week },
                      { year: displayPeriod.year, month: prevWeekInfo.month, week: prevWeekInfo.week }
                    );
                  }
                  let pYear = displayPeriod.year;
                  let pMonth = displayPeriod.month - 1;
                  if (pMonth < 1) { pMonth = 12; pYear -= 1; }
                  return buildTable1Rows(
                    currentData, prevMonthData,
                    { ...displayPeriod, week: 0 },
                    { year: pYear, month: pMonth, week: 0 }
                  );
                })()}
              </tbody>
            </table>

            <h2 class="text-xs font-bold mb-1">2. 당월말 예상 환산치</h2>
            <table id="table-2">
              <thead>
                <tr>
                  <th>팀구분</th>
                  <th>파트 구분</th>
                  <th>구분</th>
                  <th>전월</th>
                  <th>당월(예상)</th>
                  <th>증감율</th>
                </tr>
              </thead>
              <tbody>
                ${(Object.keys(TEAM_NAMES) as TeamId[]).map(teamId => {
                  const parts = Object.keys(currentData[teamId]) as PartId[];
                  return parts.map((partId, pIdx) => {
                    const curr = currentData[teamId][partId]!;
                    const proj = (projectionData[teamId]?.[partId]) || { headcount: 0, workingHours: 0, overtimeHours: 0 };
                    
                    const metrics = [
                      { label: '평균 인원(명)', c: curr.headcount, p: proj.headcount },
                      { label: '총 근무시간(h)', c: Math.round(curr.headcount * curr.workingHours), p: Math.round(proj.headcount * proj.workingHours) },
                      { label: '총 잔업시간(h)', c: Math.round(curr.headcount * curr.overtimeHours), p: Math.round(proj.headcount * proj.overtimeHours) },
                      { label: '인당 평균 잔업시간(h)', c: curr.overtimeHours, p: proj.overtimeHours }
                    ];

                    return metrics.map((m, mIdx) => {
                      const diff = m.p !== 0 ? ((m.c - m.p) / m.p * 100).toFixed(1) : '0.0';
                      const isUp = m.c > m.p;

                      return `
                        <tr class="data-row">
                          ${pIdx === 0 && mIdx === 0 ? `<td rowspan="${parts.length * 4}" class="bg-group">${TEAM_NAMES[teamId]}</td>` : ''}
                          ${mIdx === 0 ? `<td rowspan="4" class="bg-subgroup">${PART_NAMES[partId]}</td>` : ''}
                          <td>${m.label}</td>
                          <td class="font-mono base-val">${m.p.toLocaleString()}</td>
                          <td contenteditable="true" class="font-mono font-bold editable-cell ${m.label.includes('잔업') && m.c > m.p ? 'text-rose-500' : ''}">${m.c.toLocaleString()}</td>
                          <td class="font-mono growth-val ${isUp ? 'val-up' : 'val-down'}">${isUp ? '▲' : '▼'} ${Math.abs(parseFloat(diff))}%</td>
                        </tr>
                      `;
                    }).join('');
                  }).join('');
                }).join('')}
              </tbody>
            </table>

            <div class="mt-4 page-break">
              <h2 class="text-sm font-bold mb-2">3. 종합 검토 의견</h2>
              <div contenteditable="true" class="editable-field bg-slate-50 p-4 rounded-lg border border-slate-200 min-h-[120px] text-xs leading-relaxed">
              </div>
            </div>
          </div>

          <script>
            document.querySelectorAll('.editable-cell').forEach(cell => {
              cell.addEventListener('input', function() {
                const row = this.closest('tr');
                const baseValText = row.querySelector('.base-val').innerText.replace(/,/g, '');
                const currentValText = this.innerText.replace(/,/g, '');
                
                const baseVal = parseFloat(baseValText);
                const currentVal = parseFloat(currentValText);
                const growthCell = row.querySelector('.growth-val');

                if (!isNaN(baseVal) && !isNaN(currentVal) && baseVal !== 0) {
                  const diff = ((currentVal - baseVal) / baseVal * 100).toFixed(1);
                  const isUp = currentVal > baseVal;
                  
                  growthCell.innerText = (isUp ? '▲ ' : '▼ ') + Math.abs(diff) + '%';
                  growthCell.className = 'font-mono growth-val ' + (isUp ? 'val-up' : 'val-down');
                } else if (baseVal === 0) {
                  growthCell.innerText = '-';
                }
              });
            });
          </script>
        </body>
      </html>
    `;

    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar - Simplified */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-bottom border-slate-100">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg whitespace-nowrap">
            <LayoutDashboard size={24} />
            <span>생산팀 OT 주간 보고</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">Executive Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">Main Menu</div>
          <SidebarItem icon={<FileText size={18} />} label="전체 현황판" active />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-900 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium opacity-80">System Live</span>
            </div>
            <p className="text-[10px] opacity-60 leading-relaxed">
              근무시간 및 잔업 관리에 집중된 통합 대시보드입니다.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8 bg-slate-50">
        <div className="min-w-[1250px] space-y-8">
          <header className="flex justify-between items-end mb-8">
          <div>
            <div className="flex items-center gap-3 text-slate-500 text-sm mb-1">
              <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span className="font-medium">{getWeekString(reportDate)}</span>
              </div>
              <input
                type="date"
                value={format(reportDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value) {
                    setReportDate(new Date(e.target.value));
                  }
                }}
                className="text-[10px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer outline-none text-slate-600 font-medium"
              />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">생산팀 OT 주간 보고</h1>
          </div>
          <div className="flex gap-3">
            <input
              type="file"
              accept=".csv"
              id="csv-upload"
              className="hidden"
              onChange={handleCsvUpload}
            />
            <button 
              onClick={() => document.getElementById('csv-upload')?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Upload size={16} />
              CSV 업로드
            </button>
            <button 
              onClick={generateReport}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Plus size={16} />
              보고서 생성
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
              <Save size={16} />
              전체 저장
            </button>
          </div>
        </header>

        <div className="space-y-8">
          {/* Year Selection & Trend Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm w-[1204px]">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">연도별 평균 잔업시간 추이 (월별)</h2>
                  <p className="text-xs text-slate-400 mt-1">인당 평균 잔업시간(h)의 연도별 변화를 팀별로 비교합니다.</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">연도</span>
                    {availableYears.map(year => (
                      <label key={year} className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-white hover:shadow-sm group">
                        <input
                          type="checkbox"
                          checked={selectedYears.includes(year)}
                          onChange={() => toggleYear(year)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={cn(
                          "text-xs font-bold transition-colors",
                          selectedYears.includes(year) ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                        )}>
                          {year}년
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">팀</span>
                    {(Object.keys(TEAM_NAMES) as TeamId[]).map(teamId => (
                      <label key={teamId} className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-white hover:shadow-sm group">
                        <input
                          type="checkbox"
                          checked={selectedTeams.includes(teamId)}
                          onChange={() => toggleTeam(teamId)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={cn(
                          "text-xs font-bold transition-colors",
                          selectedTeams.includes(teamId) ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                        )} style={{ color: selectedTeams.includes(teamId) ? TEAM_STROKE_COLORS[teamId] : undefined }}>
                          {TEAM_NAMES[teamId]}
                        </span>
                      </label>
                    ))}
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-white hover:shadow-sm group border-l border-slate-200 ml-1">
                      <input
                        type="checkbox"
                        checked={showTeamAverage}
                        onChange={() => setShowTeamAverage(!showTeamAverage)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                      />
                      <span className={cn(
                        "text-xs font-bold transition-colors",
                        showTeamAverage ? "text-amber-500" : "text-slate-400 group-hover:text-slate-600"
                      )}>
                        생산팀
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 px-3 border-r border-slate-200 mr-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">월 선택</span>
                </div>
                <div className="flex flex-wrap gap-1 flex-1">
                  {MONTHS.map(month => (
                    <label key={month} className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-all hover:bg-white hover:shadow-sm group">
                      <input 
                        type="checkbox" 
                        checked={selectedMonths.includes(month)}
                        onChange={() => toggleMonth(month)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={cn(
                        "text-xs font-medium transition-colors",
                        selectedMonths.includes(month) ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                      )}>
                        {month}월
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 ml-auto pl-4 border-l border-slate-200">
                  <button 
                    onClick={() => setSelectedMonths(MONTHS)}
                    className="text-[10px] font-bold text-indigo-600 hover:underline"
                  >
                    전체 선택
                  </button>
                  <button 
                    onClick={() => setSelectedMonths([])}
                    className="text-[10px] font-bold text-slate-400 hover:underline"
                  >
                    전체 해제
                  </button>
                </div>
              </div>
            </div>
            
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={trendChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                    unit="h"
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '11px', fontWeight: 600 }} />
                  {trendLineKeys.map(({ key, color, dash }) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      strokeWidth={2.5}
                      strokeDasharray={dash}
                      dot={{ r: 3, fill: color, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      animationDuration={1000}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Charts Row */}
          <div className="flex gap-6 mb-6">
            <div className="w-[800px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold">파트별 평균 잔업시간 현황</h2>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                    <span className="text-slate-500">당월</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-slate-300" />
                    <span className="text-slate-500">전년 동기</span>
                  </div>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width={750} height={300}>
                  <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 10 }} 
                      dy={10}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} unit="h" />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="overtime" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={24} />
                    <Bar dataKey="overtimeLY" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={24} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="w-[380px] flex-shrink-0 bg-indigo-900 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-center">
              <h3 className="text-sm font-bold opacity-70 uppercase tracking-widest mb-6">평균 시간 지표 요약 (팀별)</h3>
              <div className="space-y-6">
                {(Object.keys(TEAM_NAMES) as TeamId[]).map((teamId) => {
                  const teamParts = Object.values(currentData[teamId]) as (MetricData | undefined)[];
                  const avgOvertime = teamParts.length > 0 
                    ? teamParts.reduce((acc, curr) => acc + (curr?.overtimeHours || 0), 0) / teamParts.length 
                    : 0;
                  
                  // Monthly Average (from Projection Data)
                  const projTeamParts = Object.values(projectionData[teamId] || {}) as (MetricData | undefined)[];
                  const projAvgOvertime = projTeamParts.length > 0
                    ? projTeamParts.reduce((acc, curr) => acc + (curr?.overtimeHours || 0), 0) / projTeamParts.length
                    : 0;

                  // Last Year
                  const lyTeamParts = Object.values(lastYearData[teamId] || {}) as (MetricData | undefined)[];
                  const lyAvgOvertime = lyTeamParts.length > 0
                    ? lyTeamParts.reduce((acc, curr) => acc + (curr?.overtimeHours || 0), 0) / lyTeamParts.length
                    : 0;
                  
                  const projDiff = projAvgOvertime !== 0 ? ((avgOvertime - projAvgOvertime) / projAvgOvertime * 100) : 0;
                  const lyDiff = lyAvgOvertime !== 0 ? ((avgOvertime - lyAvgOvertime) / lyAvgOvertime * 100) : 0;

                  return (
                    <div key={teamId} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                      <div className="text-xs opacity-60 mb-1">{TEAM_NAMES[teamId]} 인당 평균 잔업</div>
                      <div className="text-3xl font-bold font-mono">
                        {avgOvertime.toFixed(1)}
                        <span className="text-lg font-normal ml-1 opacity-60">h</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        <div className={cn(
                          "flex items-center gap-1 text-[11px] font-bold",
                          avgOvertime > projAvgOvertime ? "text-rose-400" : "text-emerald-400"
                        )}>
                          {avgOvertime > projAvgOvertime ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Math.abs(projDiff).toFixed(1)}%
                          <span className="text-[10px] opacity-60 font-normal ml-1 text-white">vs 당월 평균</span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1 text-[11px] font-bold",
                          avgOvertime > lyAvgOvertime ? "text-rose-400" : "text-emerald-400"
                        )}>
                          {avgOvertime > lyAvgOvertime ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Math.abs(lyDiff).toFixed(1)}%
                          <span className="text-[10px] opacity-60 font-normal ml-1 text-white">vs 전년 동기</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Team Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-[1204px]">
            {(Object.keys(TEAM_NAMES) as TeamId[]).map((teamId) => (
              <div key={teamId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">{TEAM_NAMES[teamId]}</h3>
                  <div className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase">Active</div>
                </div>
                <div className="p-6 space-y-8 flex-1">
                  {(Object.keys(currentData[teamId]) as PartId[]).map((partId) => {
                    const metrics = currentData[teamId][partId];
                    if (!metrics) return null;
                    return (
                      <div key={partId} className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                          <h4 className="text-sm font-bold text-slate-600">{PART_NAMES[partId]}</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          <CompactInputField 
                            label="인원" 
                            unit="명"
                            value={metrics.headcount.toString()}
                            onChange={(v) => handleInputChange(teamId, partId, 'headcount', v)}
                          />
                          <CompactInputField 
                            label="근무" 
                            unit="h"
                            value={metrics.workingHours.toString()}
                            onChange={(v) => handleInputChange(teamId, partId, 'workingHours', v)}
                          />
                          <CompactInputField 
                            label="잔업" 
                            unit="h"
                            value={metrics.overtimeHours.toString()}
                            onChange={(v) => handleInputChange(teamId, partId, 'overtimeHours', v)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm w-[1204px]">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">전사 파트별 상세 비교 데이터</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400 font-medium border-b border-slate-100">
                    <th className="px-6 py-4">파트명</th>
                    <th className="px-6 py-4 text-center">현재 인원</th>
                    <th className="px-6 py-4 text-center">전년 동기</th>
                    <th className="px-6 py-4 text-center">증감</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {chartData.map((item, idx) => {
                    const hcDiff = item.headcount - item.headcountLY;
                    const isUp = hcDiff > 0;
                    const isSame = hcDiff === 0;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-700">{item.name}</td>
                        <td className="px-6 py-4 text-center font-mono font-bold">{item.headcount}명</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-400">{item.headcountLY}명</td>
                        <td className="px-6 py-4 text-center">
                          <div className={cn(
                            "inline-flex items-center gap-1 font-mono font-bold px-2 py-1 rounded-md text-[11px]",
                            isSame ? "text-slate-500 bg-slate-50" : (isUp ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50")
                          )}>
                            {!isSame && (isUp ? <Plus size={12} /> : <div className="w-2 h-0.5 bg-emerald-600 rounded-full" />)}
                            {isSame ? '0' : Math.abs(hcDiff)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function CompactInputField({ label, unit, value, onChange }: { label: string, unit: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[10px] font-bold text-slate-400 uppercase w-8">{label}</label>
      <div className="relative flex-1">
        <input 
          type="number" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-right pr-6"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">{unit}</span>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <button className={cn(
      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
      active 
        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 font-medium" 
        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
    )}>
      {icon}
      <span>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/40" />}
    </button>
  );
}

function InputField({ label, icon, value, onChange }: { label: string, icon: React.ReactNode, value: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <input 
        type="number" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
        placeholder="0.0"
      />
    </div>
  );
}

function GrowthItem({ label, current, target, unit, inverse = false }: { label: string, current: number, target: number, unit: string, inverse?: boolean }) {
  const diff = current - target;
  const percent = target !== 0 ? (diff / target) * 100 : 0;
  const isPositive = diff > 0;
  
  // For overtime, positive diff is "bad" (red), so we might want to inverse colors
  const isGood = inverse ? !isPositive : isPositive;

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs opacity-60 mb-0.5">{label}</div>
        <div className="text-lg font-bold font-mono">{current}{unit}</div>
      </div>
      <div className={cn(
        "flex flex-col items-end",
        isPositive ? (inverse ? "text-rose-300" : "text-emerald-300") : (inverse ? "text-emerald-300" : "text-rose-300")
      )}>
        <div className="flex items-center gap-1 text-sm font-bold">
          {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {Math.abs(percent).toFixed(1)}%
        </div>
        <div className="text-[10px] opacity-60">vs 전년</div>
      </div>
    </div>
  );
}
