import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { WindowFrame } from "../components/WindowFrame";
import { Send, CheckCircle2, Clock, FileJson, Sparkles } from "lucide-react";

export const ApiDemoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Window entrance
  const windowSpring = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.9 },
  });

  // URL typing simulation
  const fullUrl = "/api/v1/auth/login";
  const charsCount = Math.floor(
    interpolate(frame, [25, 65], [0, fullUrl.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const typedUrl = fullUrl.slice(0, charsCount);

  // Send button click effect (around frame 75)
  const isClicked = frame >= 75;
  const isResponseReady = frame >= 85;

  const responseSpring = spring({
    frame: frame - 85,
    fps,
    config: { damping: 12, mass: 0.7 },
  });

  // Floating highlight badges
  const badge1Spring = spring({
    frame: frame - 110,
    fps,
    config: { damping: 12, mass: 0.7 },
  });
  const badge2Spring = spring({
    frame: frame - 140,
    fps,
    config: { damping: 12, mass: 0.7 },
  });

  // Outro transition
  const exitOpacity = interpolate(frame, [220, 240], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [220, 240], [1, 0.96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      className="items-center justify-center flex flex-col px-12 select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${exitScale})`,
      }}
    >
      {/* Header tagline */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Interactive Client Showcase</span>
        </div>
        <h2 className="text-4xl font-extrabold text-white tracking-tight">
          Craft & Test Requests at the Speed of Thought
        </h2>
      </div>

      {/* Main App Mockup Window */}
      <div
        className="w-full max-w-5xl relative"
        style={{
          opacity: windowSpring,
          transform: `translateY(${interpolate(windowSpring, [0, 1], [40, 0])}px) scale(${interpolate(windowSpring, [0, 1], [0.94, 1])})`,
        }}
      >
        <WindowFrame title="Reqspace — [Production Workspace]" accentBadge="Localhost :3005">
          {/* Tab Bar */}
          <div className="flex items-center gap-1 px-4 pt-2 border-b border-white/5 bg-[#0e1424]">
            <div className="px-4 py-2 text-xs font-medium text-white bg-[#161f36] border-t-2 border-indigo-500 rounded-t-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>POST Authenticate User</span>
            </div>
            <div className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
              GET Fetch Collections
            </div>
            <div className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
              PUT Update Settings
            </div>
          </div>

          {/* Request Address Bar */}
          <div className="p-4 bg-[#11182c] border-b border-white/10 flex items-center gap-3">
            {/* Verb Dropdown */}
            <div className="px-3 py-2 rounded-lg bg-indigo-600 text-white font-bold text-xs tracking-wider font-mono shadow-md shadow-indigo-600/30">
              POST
            </div>

            {/* URL Input with Dynamic Variable Tag */}
            <div className="flex-1 bg-[#0b0f1d] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono flex items-center gap-1.5 overflow-hidden">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                {"{{baseUrl}}"}
              </span>
              <span className="text-slate-200">{typedUrl}</span>
              {frame < 75 && (
                <span className="w-2 h-4 bg-indigo-400 animate-pulse inline-block" />
              )}
            </div>

            {/* Send Button */}
            <button
              className={`px-5 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all duration-200 ${
                isClicked
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-95"
                  : "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-600"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isClicked ? "Sent!" : "Send"}</span>
            </button>
          </div>

          {/* Split Body: Request Payload & Response */}
          <div className="grid grid-cols-2 min-h-[300px] bg-[#0c1120] text-xs font-mono">
            {/* Request Pane */}
            <div className="border-r border-white/5 p-4 flex flex-col">
              <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-white/5 mb-3">
                <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileJson className="w-3.5 h-3.5 text-indigo-400" />
                  Request Body (JSON)
                </span>
                <span className="text-[10px] text-slate-500">application/json</span>
              </div>
              <pre className="text-slate-300 leading-relaxed font-mono">
{`{
  `}<span className="text-indigo-400">"email"</span>: <span className="text-amber-300">"lead.dev@company.com"</span>{`,
  `}<span className="text-indigo-400">"password"</span>: <span className="text-amber-300">"••••••••••••••••"</span>{`,
  `}<span className="text-indigo-400">"role"</span>: <span className="text-amber-300">"workspace_admin"</span>{`
}`}
              </pre>
            </div>

            {/* Response Pane */}
            <div className="p-4 flex flex-col bg-[#0b101e]/80">
              <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                    Response
                  </span>
                  {isResponseReady && (
                    <div
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold"
                      style={{
                        transform: `scale(${responseSpring})`,
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>200 OK</span>
                    </div>
                  )}
                </div>

                {isResponseReady && (
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Clock className="w-3 h-3" /> 18 ms
                    </span>
                    <span>1.2 KB</span>
                  </div>
                )}
              </div>

              {isResponseReady ? (
                <div
                  style={{
                    opacity: responseSpring,
                    transform: `translateY(${interpolate(responseSpring, [0, 1], [10, 0])}px)`,
                  }}
                >
                  <pre className="text-slate-200 leading-relaxed">
{`{
  `}<span className="text-indigo-400">"status"</span>: <span className="text-emerald-400">"success"</span>{`,
  `}<span className="text-indigo-400">"user"</span>: {`{
    `}<span className="text-indigo-400">"id"</span>: <span className="text-cyan-300">"usr_9904"</span>{`,
    `}<span className="text-indigo-400">"email"</span>: <span className="text-amber-300">"lead.dev@company.com"</span>{`,
    `}<span className="text-indigo-400">"permissions"</span>: [<span className="text-amber-300">"manage_apis"</span>, <span className="text-amber-300">"run_tests"</span>]{`
  },
  `}<span className="text-indigo-400">"token"</span>: <span className="text-emerald-300">"jwt_live_reqspace_88ab3..."</span>{`
}`}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">
                  Waiting for request trigger...
                </div>
              )}
            </div>
          </div>
        </WindowFrame>

        {/* Floating Callout Badges */}
        <div
          className="absolute -top-6 -right-6 px-4 py-2 rounded-xl bg-indigo-600/90 text-white font-bold text-xs shadow-xl shadow-indigo-600/40 border border-indigo-400/40 flex items-center gap-2 backdrop-blur-md"
          style={{
            opacity: badge1Spring,
            transform: `scale(${badge1Spring}) rotate(3deg)`,
          }}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>⚡ Lightning Fast — 18ms Execution</span>
        </div>

        <div
          className="absolute -bottom-6 -left-6 px-4 py-2 rounded-xl bg-slate-900/90 text-emerald-300 font-bold text-xs shadow-xl border border-emerald-500/40 flex items-center gap-2 backdrop-blur-md"
          style={{
            opacity: badge2Spring,
            transform: `scale(${badge2Spring}) rotate(-2deg)`,
          }}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>🔄 Dynamic Environment Variables & Chaining</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
