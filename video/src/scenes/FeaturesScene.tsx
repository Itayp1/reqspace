import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Database,
  FolderTree,
  ShieldCheck,
  Laptop,
  CheckCircle,
  Layers,
} from "lucide-react";

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  // Staggered springs for cards
  const card1 = spring({ frame: frame - 15, fps, config: { damping: 14, mass: 0.8 } });
  const card2 = spring({ frame: frame - 30, fps, config: { damping: 14, mass: 0.8 } });
  const card3 = spring({ frame: frame - 45, fps, config: { damping: 14, mass: 0.8 } });
  const card4 = spring({ frame: frame - 60, fps, config: { damping: 14, mass: 0.8 } });

  // Outro transition
  const exitOpacity = interpolate(frame, [180, 200], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [180, 200], [1, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const features = [
    {
      springVal: card1,
      icon: <Database className="w-6 h-6 text-indigo-400" />,
      title: "Multi-Database Engine",
      subtitle: "Full support for SQLite, PostgreSQL, and MySQL. Zero configuration required to start.",
      tag: "Data Independence",
      tagColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    },
    {
      springVal: card2,
      icon: <FolderTree className="w-6 h-6 text-cyan-400" />,
      title: "Collections & Dynamic Vars",
      subtitle: "Organize requests into logical suites. Seamlessly substitute {{environments}} everywhere.",
      tag: "Effortless Organization",
      tagColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    },
    {
      springVal: card3,
      icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
      title: "Enterprise Auth & RBAC",
      subtitle: "Built-in JWT auth, Google OAuth, granular role-based access control, and full audit logs.",
      tag: "Secure & Audited",
      tagColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    {
      springVal: card4,
      icon: <Laptop className="w-6 h-6 text-amber-400" />,
      title: "Web, Electron & Docker",
      subtitle: "Run as a desktop application, cloud container, or lightweight local browser service.",
      tag: "Deploy Anywhere",
      tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
  ];

  return (
    <AbsoluteFill
      className="items-center justify-center flex flex-col px-16 text-center select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${exitScale})`,
      }}
    >
      {/* Title */}
      <div
        className="mb-10"
        style={{
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [30, 0])}px)`,
        }}
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-3">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>Full-Spectrum API Suite</span>
        </div>
        <h2 className="text-4xl font-extrabold text-white tracking-tight">
          Everything You Need to Build, Test & Automate
        </h2>
      </div>

      {/* 2x2 Feature Cards Grid */}
      <div className="grid grid-cols-2 gap-6 max-w-5xl w-full">
        {features.map((feat, index) => (
          <div
            key={index}
            className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl text-left flex flex-col justify-between relative overflow-hidden"
            style={{
              opacity: feat.springVal,
              transform: `translateY(${interpolate(feat.springVal, [0, 1], [30, 0])}px) scale(${interpolate(feat.springVal, [0, 1], [0.95, 1])})`,
              boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  {feat.icon}
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${feat.tagColor}`}
                >
                  {feat.tag}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{feat.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{feat.subtitle}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-slate-400 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Production-ready & tested</span>
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
