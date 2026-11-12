import { AbsoluteFill, useCurrentFrame } from "remotion";

export const KidsBackground: React.FC = () => {
  const frame = useCurrentFrame();

  // Floating ambient bubbles and stars
  const stars = [
    { x: "8%", y: "15%", size: 36, speed: 0.04, delay: 0, color: "text-amber-400" },
    { x: "88%", y: "12%", size: 48, speed: 0.03, delay: 10, color: "text-yellow-300" },
    { x: "12%", y: "78%", size: 42, speed: 0.05, delay: 5, color: "text-amber-300" },
    { x: "85%", y: "75%", size: 38, speed: 0.035, delay: 15, color: "text-yellow-400" },
    { x: "50%", y: "8%", size: 30, speed: 0.06, delay: 8, color: "text-amber-200" },
    { x: "92%", y: "45%", size: 32, speed: 0.045, delay: 20, color: "text-yellow-300" },
    { x: "6%", y: "48%", size: 34, speed: 0.04, delay: 12, color: "text-amber-400" },
  ];

  return (
    <AbsoluteFill className="overflow-hidden bg-[#0d1326] select-none">
      {/* Dynamic Animated Radiant Gradient Background */}
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background: `
            radial-gradient(circle at ${40 + Math.sin(frame * 0.015) * 15}% ${30 + Math.cos(frame * 0.02) * 10}%, rgba(99, 102, 241, 0.35) 0%, transparent 60%),
            radial-gradient(circle at ${70 + Math.cos(frame * 0.018) * 15}% ${70 + Math.sin(frame * 0.015) * 10}%, rgba(236, 72, 153, 0.28) 0%, transparent 65%),
            radial-gradient(circle at ${20 + Math.sin(frame * 0.02) * 10}% ${80 + Math.cos(frame * 0.012) * 12}%, rgba(245, 158, 11, 0.25) 0%, transparent 55%),
            radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.15) 0%, transparent 70%)
          `,
        }}
      />

      {/* Playful Floating Glow Spheres */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none"
        style={{
          transform: `translate(${Math.sin(frame * 0.02) * 40}px, ${Math.cos(frame * 0.02) * 30}px)`,
        }}
      />
      <div
        className="absolute top-1/2 -right-32 w-[30rem] h-[30rem] rounded-full bg-pink-500/15 blur-3xl pointer-events-none"
        style={{
          transform: `translate(${Math.cos(frame * 0.015) * 50}px, ${Math.sin(frame * 0.018) * 40}px)`,
        }}
      />
      <div
        className="absolute -bottom-32 left-1/3 w-[28rem] h-[28rem] rounded-full bg-amber-500/15 blur-3xl pointer-events-none"
        style={{
          transform: `translate(${Math.sin(frame * 0.025) * 30}px, ${Math.cos(frame * 0.02) * 20}px)`,
        }}
      />

      {/* Animated Subtle Grid Pattern for Crisp Modern Look */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.6) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.6) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Floating Gentle Stars */}
      {stars.map((star, idx) => {
        const floatY = Math.sin((frame + star.delay * 10) * star.speed) * 18;
        const rotate = (frame + star.delay * 5) * (star.speed * 15);
        const scale = 1 + Math.sin((frame + star.delay * 8) * star.speed * 1.5) * 0.15;

        return (
          <div
            key={idx}
            className={`absolute ${star.color} font-bold opacity-75`}
            style={{
              left: star.x,
              top: star.y,
              fontSize: `${star.size}px`,
              transform: `translateY(${floatY}px) rotate(${rotate}deg) scale(${scale})`,
              filter: "drop-shadow(0 0 12px rgba(251, 191, 36, 0.45))",
            }}
          >
            ★
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
