import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Img,
} from "remotion";
import { Terminal, Star, Copy, Check } from "lucide-react";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const terminalSpring = spring({
    frame: frame - 25,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const ctaSpring = spring({
    frame: frame - 50,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const isCopied = frame >= 65;

  return (
    <AbsoluteFill className="items-center justify-center flex flex-col px-16 text-center select-none">
      {/* Brand & Headline */}
      <div
        className="flex flex-col items-center mb-8"
        style={{
          opacity: mainSpring,
          transform: `translateY(${interpolate(mainSpring, [0, 1], [30, 0])}px)`,
        }}
      >
        <div className="w-20 h-20 rounded-2xl overflow-hidden border border-indigo-400/40 shadow-xl bg-[#0f172a] p-1.5 mb-4 shadow-indigo-500/20">
          <Img
            src={staticFile("logo.jpg")}
            className="w-full h-full object-cover rounded-xl"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>

        <h2 className="text-5xl font-black text-white tracking-tight mb-2">
          Get Started in Seconds
        </h2>
        <p className="text-xl text-slate-300 max-w-xl">
          Deploy locally or across your team with zero configuration.
        </p>
      </div>

      {/* Terminal Command Box */}
      <div
        className="w-full max-w-2xl bg-[#0b0f1c] border border-white/15 rounded-2xl shadow-2xl p-5 mb-8 relative text-left"
        style={{
          opacity: terminalSpring,
          transform: `translateY(${interpolate(terminalSpring, [0, 1], [25, 0])}px)`,
          boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.8), 0 0 40px -10px rgba(99, 102, 241, 0.3)",
        }}
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="font-mono text-slate-300">Quick Start with Docker</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
          </div>
        </div>

        {/* Command Line */}
        <div className="flex items-center justify-between font-mono text-sm">
          <div className="flex items-center gap-3 overflow-hidden text-emerald-400">
            <span className="text-slate-500 select-none">$</span>
            <span className="text-slate-100 font-semibold tracking-wide">
              docker run -p 3005:3005 -d itayp/reqspace:latest
            </span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold cursor-pointer border transition-all ${
              isCopied
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800 text-slate-300 border-slate-700"
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* GitHub Callout and Actions */}
      <div
        className="flex items-center justify-center gap-6"
        style={{
          opacity: ctaSpring,
          transform: `translateY(${interpolate(ctaSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white font-medium text-sm backdrop-blur-md">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span>github.com/Itayp1/reqspace</span>
        </div>

        <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold text-sm">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <span>Star on GitHub</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
