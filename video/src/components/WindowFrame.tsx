import React from "react";

interface WindowFrameProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  accentBadge?: string;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({
  title = "Reqspace — API Workspace",
  children,
  className = "",
  accentBadge,
}) => {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0d1322]/90 backdrop-blur-xl shadow-2xl shadow-indigo-950/50 overflow-hidden flex flex-col ${className}`}
      style={{
        boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px -10px rgba(99, 102, 241, 0.2)",
      }}
    >
      {/* Title bar */}
      <div className="h-11 px-4 bg-[#12192c]/90 border-b border-white/10 flex items-center justify-between select-none">
        {/* Window controls */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-black/20" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-black/20" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-black/20" />
        </div>

        {/* Title & Badge */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 font-mono">
          <span>{title}</span>
          {accentBadge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {accentBadge}
            </span>
          )}
        </div>

        {/* Right side spacer / stats */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>v1.0.0</span>
        </div>
      </div>

      {/* Main Window Body */}
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
};
