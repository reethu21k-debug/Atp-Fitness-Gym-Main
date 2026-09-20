"use client";

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from "recharts";

// Custom Glassmorphism Tooltip for better UX
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="animate-in fade-in zoom-in-95 rounded-xl border border-border/40 bg-card/40 p-3.5 shadow-xl backdrop-blur-xl duration-200">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          <p className="text-sm text-foreground font-medium">
            <span className="font-bold text-lg">{payload[0].value}</span> 
            <span className="text-muted-foreground ml-1">visits</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export function PeakHoursChart({ data }: { data: { hour: number; count: number }[] }) {
  const chartData = data.map((d) => ({
    hour: d.hour === 0 
      ? "12am" 
      : d.hour < 12 
        ? `${d.hour}am` 
        : d.hour === 12 
          ? "12pm" 
          : `${d.hour - 12}pm`,
    visits: d.count,
  }));

  return (
    <div className="h-[280px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
          data={chartData} 
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          {/* Softer, more modern grid without vertical lines */}
          <CartesianGrid 
            strokeDasharray="4 4" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.4} 
            vertical={false} 
          />
          
          {/* Clean X Axis - No axis line, no tick marks, just padded text */}
          <XAxis 
            dataKey="hour" 
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 500 }} 
            interval="preserveStartEnd"
            minTickGap={20}
          />
          
          {/* Clean Y Axis */}
          <YAxis 
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 500 }} 
            allowDecimals={false} 
          />
          
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.15 }}
          />
          
          <Bar 
            dataKey="visits" 
            fill="hsl(var(--primary))" 
            fillOpacity={0.8}
            radius={[6, 6, 0, 0]} 
            activeBar={{ fillOpacity: 1, strokeWidth: 0 }}
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}