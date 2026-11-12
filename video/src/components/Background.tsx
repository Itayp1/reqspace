import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  // Floating gradient orbs
  const orb1X = interpolate(frame, [0, 900], [-5, 15], { extrapolateRight: "clamp" });
  const orb1Y = interpolate(frame, [0, 900], [10, -10], { extrapolateRight: "clamp" });
  const orb2X = interpolate(frame, [0, 900], [80, 60], { extrapolateRight: "clamp" });
  const orb2Y = interpolate(frame, [0, 900], [60, 40], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill className="bg-[#090d16] overflow-hidden text-white">
      {/* Dynamic ambient glow orbs */}
      <div
        className="absolute rounded-full blur-[140px] opacity-40 pointer-events-none transition-all duration-1000"
        style={{
          width: "700px",
          height: "700px",
          background: "radial-gradient(circle, #6366f1 0%, transparent 70%)",
          left: `${orb1X}%`,
          top: `${orb1Y}%`,
        }}
      />
      <div
        className="absolute rounded-full blur-[160px] opacity-35 pointer-events-none transition-all duration-1000"
        style={{
          width: "650px",
          height: "650px",
          background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
          left: `${orb2X}%`,
          top: `${orb2Y}%`,
        }}
      />
      <div
        className="absolute rounded-full blur-[180px] opacity-25 pointer-events-none"
        style={{
          width: "800px",
          height: "800px",
          background: "radial-gradient(circle, #8b5cf6 0%, transparent 75%)",
          left: "30%",
          top: "40%",
        }}
      />

      {/* Cyber / Tech Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #ffffff 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at center, transparent 30%, rgba(9, 13, 22, 0.85) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
