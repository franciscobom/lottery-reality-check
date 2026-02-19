"use client";

interface LotterySelectorProps {
  currentLottery: string;
  onSelect: (id: string) => void;
}

const LOTTERY_OPTIONS = [
  { id: "euromillions", name: "EuroMillions" },
];

export default function LotterySelector({
  currentLottery,
  onSelect,
}: LotterySelectorProps) {
  return (
    <select
      value={currentLottery}
      onChange={(e) => onSelect(e.target.value)}
      className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {LOTTERY_OPTIONS.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.name}
        </option>
      ))}
    </select>
  );
}
