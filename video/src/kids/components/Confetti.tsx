import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface ConfettiProps {
  count?: number;
  triggerFrame?: number;
}

export const Confetti: React.FC<ConfettiProps> = ({
  count = 35,
  triggerFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - triggerFrame);

  if (relFrame < 0 || relFrame > 70) return null;

  // Stable pseudo-random seeds
  const particles = Array.from({ length: count }).map((_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.3;
    const distance = 80 + (i % 7) * 45;
    const size = 10 + (i % 5) * 5;
    const colors = [
      "#f59e0b", // amber
      "#ec4899", // pink
      "#10b981", // emerald
      "#3b82f6", // blue
      "#8b5cf6", // purple
      "#f43f5e", // rose
      "#fbbf24", // yellow
    ];
    const color = colors[i % colors.length];
    const shape = i % 3 === 0 ? "star" : i % 3 === 1 ? "circle" : "rect";

    return { angle, distance, size, color, shape, seed: i };
  });

  const progress = interpolate(relFrame, [0, 50], [0, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(relFrame, [0, 10, 45, 65], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-40">
      {particles.map((p, i) => {
        const currentDist = p.distance * Math.pow(progress, 0.7) * 2.8;
        const x = Math.cos(p.angle) * currentDist;
        const y = Math.sin(p.angle) * currentDist + Math.pow(progress, 2) * 160;
        const rot = progress * 720 + p.seed * 50;

        return (
          <div
            key={i}
            className="absolute"
            style={{
              transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
              opacity,
            }}
          >
            {p.shape === "star" ? (
              <span
                style={{
                  fontSize: `${p.size * 1.5}px`,
                  color: p.color,
                  filter: `drop-shadow(0 0 6px ${p.color})`,
                }}
              >
                ★
              </span>
            ) : p.shape === "circle" ? (
              <div
                style={{
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  borderRadius: "9999px",
                  backgroundColor: p.color,
                  boxShadow: `0 0 8px ${p.color}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: `${p.size * 1.6}px`,
                  height: `${p.size * 0.7}px`,
                  borderRadius: "3px",
                  backgroundColor: p.color,
                  boxShadow: `0 0 8px ${p.color}`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
