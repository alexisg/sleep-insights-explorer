import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
  Brush,
  ResponsiveContainer,
} from "recharts";
import {
  FileUp,
  FileText,
  Calendar as CalendarIcon,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import JSZip from "jszip";
import Papa from "papaparse";
import { DatePickerWithPresets } from "./components/DatePicker";

type SleepRow = {
  date: Date;
  totalSleep: number;
  core: number;
  deep: number;
  rem: number;
  awake: number;
};

type MedEvent = {
  date: Date;
  label: string;
};

type MonthlyData = {
  month: string;
  remPct: number;
  deepPct: number;
  total: number;
  awake: number;
  n: number;
};

function parseFloatSafe(v: any): number {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

function formatYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function rolling<T>(arr: T[], k: number, getter: (t: T) => number) {
  const out: (number | null)[] = new Array(arr.length).fill(null);
  let sum = 0;
  const q: number[] = [];
  
  for (let i = 0; i < arr.length; i++) {
    const v = getter(arr[i]);
    sum += v;
    q.push(v);
    
    if (q.length > k) {
      sum -= q.shift()!;
    }
    
    if (q.length === k) {
      out[i] = sum / k;
    }
  }
  
  return out;
}

function monthGroups(rows: SleepRow[]) {
  const map = new Map<string, SleepRow[]>();
  
  rows.forEach((r) => {
    const key = formatYM(r.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function normalizeRow(row: any): SleepRow | null {
  const dateStr = row["Date/Time"] || row["Date"] || row["date"];
  if (!dateStr) return null;
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  
  const total = parseFloatSafe(
    row["Total Sleep (hr)"] ?? row["Asleep (hr)"] ?? row["TotalSleep"]
  );
  const core = parseFloatSafe(row["Core (hr)"] ?? row["Core"]);
  const deep = parseFloatSafe(row["Deep (hr)"] ?? row["Deep"]);
  const rem = parseFloatSafe(row["REM (hr)"] ?? row["REM"]);
  const awake = parseFloatSafe(row["Awake (hr)"] ?? row["Awake"]);
  
  return { date, totalSleep: total, core, deep, rem, awake };
}

async function parseZip(file: File): Promise<SleepRow[]> {
  const zip = await JSZip.loadAsync(file);
  const rows: SleepRow[] = [];
  const fileNames = Object.keys(zip.files).filter((n) =>
    n.toLowerCase().endsWith(".csv")
  );
  
  for (const name of fileNames) {
    const f = zip.file(name);
    if (!f) continue;
    
    const text = await f.async("text");
    const parsed = Papa.parse(text, { header: true }).data as any[];
    parsed.forEach((r) => {
      const n = normalizeRow(r);
      if (n) rows.push(n);
    });
  }
  
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function parseCsv(file: File): Promise<SleepRow[]> {
  const text = await file.text();
  const parsed = Papa.parse(text, { header: true }).data as any[];
  const rows: SleepRow[] = [];
  
  parsed.forEach((r) => {
    const n = normalizeRow(r);
    if (n) rows.push(n);
  });
  
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function parseMedsTxt(file: File): Promise<MedEvent[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const events: MedEvent[] = [];
  
  for (const line of lines) {
    const idx = line.indexOf(" - ");
    if (idx === -1) continue;
    
    const dateStr = line.slice(0, idx).trim();
    const label = line.slice(idx + 3).trim();
    const d = new Date(dateStr);
    
    if (!isNaN(d.getTime())) {
      events.push({ date: d, label });
    }
  }
  
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function parseMedsCsvText(text: string): MedEvent[] {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  const events: MedEvent[] = [];
  
  for (const row of data as any[]) {
    const dateStr = row["date"] || row["Date"];
    if (!dateStr) continue;
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    
    const med = (row["medication"] || row["Medication"] || "").toString().trim();
    const doseVal = row["dose_mg"] ?? row["DoseMg"] ?? row["dose"];
    const dose =
      doseVal !== undefined &&
      doseVal !== null &&
      String(doseVal).trim() !== ""
        ? parseFloatSafe(doseVal)
        : NaN;
    const actionRaw = (row["action"] || row["Action"] || "")
      .toString()
      .trim()
      .toUpperCase();
    const action = actionRaw === "START" || actionRaw === "STOP" ? actionRaw : "";
    const doseLabel = isFinite(dose) && dose > 0 ? `${dose} mg` : "";
    const parts = [med, doseLabel].filter(Boolean).join(" ");
    const label = action ? `${parts} - ${action}` : parts;
    
    events.push({ date: d, label });
  }
  
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function parseMedsCsv(file: File): Promise<MedEvent[]> {
  const text = await file.text();
  return parseMedsCsvText(text);
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2">
        <h3 className="font-medium">{title}</h3>
        {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function SortableHeader({
  column,
  currentSort,
  direction,
  onSort,
  children,
  align = "left",
}: {
  column: keyof MonthlyData;
  currentSort: keyof MonthlyData;
  direction: "asc" | "desc";
  onSort: (col: keyof MonthlyData, dir: "asc" | "desc") => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const isActive = currentSort === column;
  
  const handleClick = () => {
    if (isActive) {
      // Toggle direction if same column
      onSort(column, direction === "asc" ? "desc" : "asc");
    } else {
      onSort(column, "desc");
    }
  };
  
  const getIcon = () => {
    if (!isActive) return <ChevronsUpDown className="w-3 h-3 opacity-50" />;
    return direction === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };
  
  return (
    <th
      className={`px-3 py-2 cursor-pointer hover:bg-gray-100 select-none ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={handleClick}
    >
      <div
        className={`flex items-center gap-1 ${
          align === "right" ? "justify-end" : "justify-start"
        }`}
      >
        {children}
        {getIcon()}
      </div>
    </th>
  );
}

function TimeSeriesChart({
  data,
  yKey,
  y2Key,
  meds,
}: {
  data: any[];
  yKey: string;
  y2Key?: string;
  meds?: MedEvent[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="dateStr" minTickGap={32} />
          <YAxis width={40} />
          <Tooltip
            formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)}
            labelFormatter={(l: any) => `Date: ${l}`}
          />
          <Legend />
          {meds?.map((m, i) => (
            <ReferenceLine
              key={i}
              x={m.date.toISOString().slice(0, 10)}
              stroke="#111827"
              strokeDasharray="4 4"
              label={{
                position: "top",
                value: m.label,
                angle: -90,
                offset: 10,
                fill: "#374151",
                fontSize: 10,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey={yKey}
            name={yKey}
            stroke="#3b82f6"
            dot={false}
            strokeWidth={1.5}
          />
          {y2Key && (
            <Line
              type="monotone"
              dataKey={y2Key}
              name={`${yKey} (rolling)`}
              stroke="#1f2937"
              dot={false}
              strokeWidth={2}
            />
          )}
          <Brush dataKey="dateStr" height={18} travellerWidth={8} className="rounded" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MedDeltaTable({ meds, data }: { meds: MedEvent[]; data: SleepRow[] }) {
  function avg(arr: any[], key: string) {
    return arr.length ? arr.reduce((s, r) => s + r[key], 0) / arr.length : NaN;
  }
  
  function range(arr: any[], from: Date, to: Date) {
    return arr.filter((r: any) => r.date >= from && r.date <= to);
  }
  
  const rows = meds
    .map((m) => {
      const pre = range(data, addDays(m.date, -30), addDays(m.date, -1));
      const post = range(data, addDays(m.date, 1), addDays(m.date, 30));
      
      // Calculate percentages from raw sleep data
      const preWithPct = pre.map((r) => ({
        ...r,
        remPct: r.totalSleep ? (r.rem / r.totalSleep) * 100 : 0,
        deepPct: r.totalSleep ? (r.deep / r.totalSleep) * 100 : 0,
      }));
      const postWithPct = post.map((r) => ({
        ...r,
        remPct: r.totalSleep ? (r.rem / r.totalSleep) * 100 : 0,
        deepPct: r.totalSleep ? (r.deep / r.totalSleep) * 100 : 0,
      }));
      
      const before = {
        rem: avg(preWithPct, "remPct"),
        deep: avg(preWithPct, "deepPct"),
        total: avg(pre, "totalSleep"),
        awake: avg(pre, "awake"),
      };
      const after = {
        rem: avg(postWithPct, "remPct"),
        deep: avg(postWithPct, "deepPct"),
        total: avg(post, "totalSleep"),
        awake: avg(post, "awake"),
      };
      const delta = {
        rem: after.rem - before.rem,
        deep: after.deep - before.deep,
        total: after.total - before.total,
        awake: after.awake - before.awake,
      };
      
      return { m, before, after, delta };
    })
    .sort((a, b) => b.m.date.getTime() - a.m.date.getTime()); // Sort newest to oldest
  
  return (
    <div className="overflow-auto rounded-2xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Medication change</th>
            <th className="px-3 py-2 text-right">Δ Deep %</th>
            <th className="px-3 py-2 text-right">Δ REM %</th>
            <th className="px-3 py-2 text-right">Δ Total hrs</th>
            <th className="px-3 py-2 text-right">Δ Awake hrs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, delta }, idx) => (
            <tr key={idx} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">
                {m.date.toISOString().slice(0, 10)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{m.label}</td>
              <td className="px-3 py-2 text-right">
                {isFinite(delta.deep) ? delta.deep.toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {isFinite(delta.rem) ? delta.rem.toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {isFinite(delta.total) ? delta.total.toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {isFinite(delta.awake) ? delta.awake.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [sleepRows, setSleepRows] = useState<SleepRow[]>([]);
  const [meds, setMeds] = useState<MedEvent[]>([]);
  const [minHours, setMinHours] = useState(5);
  const [maxHours, setMaxHours] = useState(12);
  const [dateFrom, setDateFrom] = useState<Date | null>(() => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
    return sixMonthsAgo;
  });
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [rollK, setRollK] = useState(7);
  const [sortColumn, setSortColumn] = useState<keyof MonthlyData>("month");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  const handleSort = (column: keyof MonthlyData, direction: "asc" | "desc") => {
    setSortColumn(column);
    setSortDirection(direction);
  };
  
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const name = file.name.toLowerCase();
    let rows: SleepRow[] = [];
    
    if (name.endsWith(".zip")) {
      rows = await parseZip(file);
    } else if (name.endsWith(".csv")) {
      rows = await parseCsv(file);
    }
    
    setSleepRows(rows);
  }
  
  async function onUploadMeds(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const name = file.name.toLowerCase();
    let events: MedEvent[] = [];
    
    if (name.endsWith(".csv")) {
      events = await parseMedsCsv(file);
    } else {
      events = await parseMedsTxt(file);
    }
    
    setMeds(events);
  }
  
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/medications.csv");
        if (!res.ok) return;
        const text = await res.text();
        const events = parseMedsCsvText(text);
        setMeds(events);
      } catch {
        /* no-op */
      }
    })();
  }, []);
  
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/sleep_data.csv");
        if (!res.ok) return;
        const text = await res.text();
        const parsed = Papa.parse(text, { header: true }).data as any[];
        const rows: SleepRow[] = [];
        
        parsed.forEach((r) => {
          const n = normalizeRow(r);
          if (n) rows.push(n);
        });
        
        setSleepRows(rows.sort((a, b) => a.date.getTime() - b.date.getTime()));
      } catch {
        /* no-op */
      }
    })();
  }, []);
  
  const filtered = useMemo(() => {
    let rows = sleepRows;
    
    if (dateFrom) {
      rows = rows.filter((r) => r.date >= dateFrom);
    }
    
    if (dateTo) {
      const to = addDays(dateTo, 1);
      rows = rows.filter((r) => r.date < to);
    }
    
    rows = rows.filter(
      (r) => r.totalSleep >= minHours && r.totalSleep <= maxHours
    );
    
    return rows;
  }, [sleepRows, dateFrom, dateTo, minHours, maxHours]);
  
  const enriched = useMemo(() => {
    const arr = filtered.map((r) => ({
      ...r,
      remPct: r.totalSleep ? (r.rem / r.totalSleep) * 100 : 0,
      deepPct: r.totalSleep ? (r.deep / r.totalSleep) * 100 : 0,
      corePct: r.totalSleep ? (r.core / r.totalSleep) * 100 : 0,
    }));
    
    const remRoll = rolling(arr, rollK, (x: any) => x.remPct);
    const deepRoll = rolling(arr, rollK, (x: any) => x.deepPct);
    const totalRoll = rolling(arr, rollK, (x: any) => x.totalSleep);
    const awakeRoll = rolling(arr, rollK, (x: any) => x.awake);
    
    return arr.map((r, i) => ({
      ...r,
      dateStr: r.date.toISOString().slice(0, 10),
      remRoll: remRoll[i],
      deepRoll: deepRoll[i],
      totalRoll: totalRoll[i],
      awakeRoll: awakeRoll[i],
    }));
  }, [filtered, rollK]);
  
  const chartData = useMemo(
    () =>
      (enriched as any).map((r: any) => ({
        date: r.date,
        x: r.date.getTime(),
        dateStr: r.dateStr,
        remPct: r.remPct,
        remRoll: r.remRoll ?? null,
        deepPct: r.deepPct,
        deepRoll: r.deepRoll ?? null,
        awake: r.awake,
        awakeRoll: r.awakeRoll ?? null,
        total: r.totalSleep,
        totalRoll: r.totalRoll ?? null,
      })),
    [enriched]
  );
  
  const monthlyData = useMemo(() => {
    // Use all sleep data for monthly summary, not filtered data
    const groups = monthGroups(sleepRows);
    const data: MonthlyData[] = groups.map(([ym, rows]) => {
      // Filter out rows with invalid totalSleep to avoid NaN calculations
      const validRows = rows.filter((r) => r.totalSleep > 0);
      const remPct =
        validRows.length > 0
          ? validRows.reduce((s, r) => s + (r.rem / r.totalSleep) * 100, 0) /
            validRows.length
          : 0;
      const deepPct =
        validRows.length > 0
          ? validRows.reduce((s, r) => s + (r.deep / r.totalSleep) * 100, 0) /
            validRows.length
          : 0;
      const total = rows.reduce((s, r) => s + r.totalSleep, 0) / rows.length;
      const awake = rows.reduce((s, r) => s + r.awake, 0) / rows.length;
      
      return { month: ym, remPct, deepPct, total, awake, n: rows.length };
    });
    
    // Sort the data
    return data.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      // Special handling for month column (date sorting)
      if (sortColumn === "month") {
        aVal = a.month;
        bVal = b.month;
      }
      
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [sleepRows, sortColumn, sortDirection]);
  
  return (
    <div className="min-h-screen bg-white text-gray-900 p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sleep Insights Explorer</h1>
        {/* <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 cursor-pointer">
            <FileUp className="w-4 h-4" />
            Import Sleep (ZIP or CSV)
            <input
              type="file"
              accept=".zip,.csv"
              className="hidden"
              onChange={onUpload}
            />
          </label>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 cursor-pointer">
            <FileText className="w-4 h-4" />
            Import meds (CSV or TXT)
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={onUploadMeds}
            />
          </label>
        </div> */}
      </header>
      
      {sleepRows.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center text-gray-600">
          <p className="text-lg">
            Default sleep data from 2024-2025 is loaded automatically. You can
            also upload your own Oura exports (ZIP of monthly CSVs or a single
            CSV) to override.
          </p>
          <p className="mt-2 text-sm">
            Medications CSV is preloaded by default; you can also upload a meds
            CSV/TXT to override.
          </p>
          <p className="mt-2 text-sm">
            We'll normalize the data, let you cap min/max sleep, pick date
            ranges, and overlay med changes.
          </p>
        </div>
      )}
      
      {sleepRows.length > 0 && (
        <>
          <section className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 py-4 -mx-6 px-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">                
                <div className="p-3 rounded-2xl border">
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    From
                  </label>
                  <DatePickerWithPresets
                    value={dateFrom}
                    onChange={setDateFrom}
                    placeholder="Select start date"
                    minDate={new Date("2024-01-01")}
                    maxDate={new Date()}
                    className="mt-1"
                  />
                </div>
                <div className="p-3 rounded-2xl border">
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    To
                  </label>
                  <DatePickerWithPresets
                    value={dateTo}
                    onChange={setDateTo}
                    placeholder="Select end date"
                    minDate={new Date("2024-01-01")}
                    maxDate={new Date()}
                    className="mt-1"
                  />
                </div>    
                <div className="p-3 rounded-2xl border">
                  <label className="text-xs text-gray-500">Nights Loaded</label>
                  <div className="text-xl font-semibold mt-1">
                    {(filtered as any[]).length}
                  </div>
                </div>          
                {/* <div className="p-3 rounded-2xl border">
                  <label className="text-xs text-gray-500">Min Sleep (hrs)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={minHours}
                    min={0}
                    max={24}
                    step={0.25}
                    onChange={(e) => setMinHours(parseFloat(e.target.value))}
                  />
                </div>
                <div className="p-3 rounded-2xl border">
                  <label className="text-xs text-gray-500">Max Sleep (hrs)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={maxHours}
                    min={0}
                    max={24}
                    step={0.25}
                    onChange={(e) => setMaxHours(parseFloat(e.target.value))}
                  />
                </div> */}
                <div className="p-3 rounded-2xl border">
                  <label className="text-xs text-gray-500">Rolling Avg (days)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={rollK}
                    min={1}
                    max={30}
                    step={1}
                    onChange={(e) => setRollK(parseInt(e.target.value || "1"))}
                  />
                </div>
                
              </div>            
          </section>
          
          <section className="grid gap-6">
            <ChartCard title="REM % Over Time" subtitle="Includes rolling average">
              <TimeSeriesChart
                data={chartData}
                yKey="remPct"
                y2Key="remRoll"
                meds={meds}
              />
            </ChartCard>
            <ChartCard title="Deep % Over Time" subtitle="Includes rolling average">
              <TimeSeriesChart
                data={chartData}
                yKey="deepPct"
                y2Key="deepRoll"
                meds={meds}
              />
            </ChartCard>
            <ChartCard
              title="Awake Hours Over Time"
              subtitle="Awake while in bed; includes rolling average"
            >
              <TimeSeriesChart
                data={chartData}
                yKey="awake"
                y2Key="awakeRoll"
                meds={meds}
              />
            </ChartCard>
            <ChartCard
              title="Total Sleep Duration"
              subtitle="Hover to see nightly totals; includes rolling average"
            >
              <TimeSeriesChart
                data={chartData}
                yKey="total"
                y2Key="totalRoll"
                meds={meds}
              />
            </ChartCard>
          </section>
          
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Monthly Summary</h2>
            <div className="overflow-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <SortableHeader
                      column="month"
                      currentSort={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                      align="left"
                    >
                      Month
                    </SortableHeader>
                    <SortableHeader
                      column="remPct"
                      currentSort={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                      align="right"
                    >
                      REM %
                    </SortableHeader>
                    <SortableHeader
                      column="deepPct"
                      currentSort={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                      align="right"
                    >
                      Deep %
                    </SortableHeader>
                    <SortableHeader
                      column="total"
                      currentSort={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                      align="right"
                    >
                      Total Sleep (hr)
                    </SortableHeader>
                    <SortableHeader
                      column="awake"
                      currentSort={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                      align="right"
                    >
                      Awake (hr)
                    </SortableHeader>
                    <SortableHeader
                      column="n"
                      currentSort={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                      align="right"
                    >
                      Nights tracked
                    </SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((data) => (
                    <tr key={data.month} className="border-t">
                      <td className="px-3 py-2">{data.month}</td>
                      <td className="px-3 py-2 text-right">
                        {isFinite(data.remPct) ? data.remPct.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isFinite(data.deepPct) ? data.deepPct.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isFinite(data.total) ? data.total.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isFinite(data.awake) ? data.awake.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{data.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          
          {meds.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">
                Medication Change Deltas (30 days after − 30 days before)
              </h2>
              <div className="text-sm text-gray-600">
                Hover vertical lines in the charts to see event labels.
              </div>
              <MedDeltaTable meds={meds} data={sleepRows} />
            </section>
          )}
        </>
      )}
      
      <footer className="pt-8 text-xs text-gray-500">
        Built for exploring sleep-stage trends, vivid-dream spikes, and fatigue
        drivers. All data stays in your browser.
      </footer>
    </div>
  );
}