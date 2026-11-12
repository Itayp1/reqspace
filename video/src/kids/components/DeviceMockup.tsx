import React from "react";

interface DeviceMockupProps {
  children: React.ReactNode;
  title?: string;
  badge?: string;
  type?: "tablet" | "phone";
  className?: string;
  theme?: "parent" | "child";
}

export const DeviceMockup: React.FC<DeviceMockupProps> = ({
  children,
  title = "Kids Ranking",
  badge,
  className = "",
  theme = "parent",
}) => {
  const isParent = theme === "parent";

  return (
    <div
      className={`relative rounded-3xl border ${
        isParent
          ? "border-indigo-400/30 bg-[#0e1628]/95 shadow-indigo-900/40"
          : "border-pink-400/30 bg-[#160e28]/95 shadow-purple-900/40"
      } shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden text-white transition-all ${className}`}
      style={{
        boxShadow: isParent
          ? "0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 45px -10px rgba(99, 102, 241, 0.25)"
          : "0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 45px -10px rgba(236, 72, 153, 0.25)",
      }}
      dir="rtl"
    >
      {/* Sleek Top Device Header Bar */}
      <div
        className={`h-12 px-6 flex items-center justify-between border-b ${
          isParent ? "bg-[#141e34]/90 border-indigo-500/20" : "bg-[#201438]/90 border-pink-500/20"
        } select-none`}
      >
        {/* Left / Start: Title and role badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isParent ? "bg-indigo-400 animate-pulse" : "bg-pink-400 animate-bounce"
              }`}
            />
            <span className="font-bold text-sm tracking-wide text-slate-100">{title}</span>
          </div>

          {badge && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isParent
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "bg-pink-500/20 text-pink-300 border border-pink-500/30"
              }`}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Right / End: Window dot controls */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">{children}</div>
    </div>
  );
};
