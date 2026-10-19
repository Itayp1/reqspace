import React from "react";
import { AbsoluteFill, Series, Audio, staticFile, interpolate } from "remotion";
import { Background } from "./components/Background";
import { IntroScene } from "./scenes/IntroScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ApiDemoScene } from "./scenes/ApiDemoScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { OutroScene } from "./scenes/OutroScene";

export const ReqspacePromo: React.FC = () => {
  return (
    <AbsoluteFill className="font-sans antialiased bg-[#090d16] text-white overflow-hidden">
      {/* Background Music: Cipher by Kevin MacLeod with smooth fade-in and fade-out */}
      <Audio
        src={staticFile("tech-music.mp3")}
        volume={(f) =>
          interpolate(f, [0, 25, 865, 900], [0, 0.35, 0.35, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Persistent Animated Tech Background */}
      <Background />

      {/* 5-Act Sequenced Showcase (30 seconds @ 30 FPS) */}
      <Series>
        {/* Act 1: Brand Intro & Tagline (0 - 4.6s) */}
        <Series.Sequence durationInFrames={140}>
          <IntroScene />
        </Series.Sequence>

        {/* Act 2: The Problem with Bloated Tools vs Reqspace (4.6s - 9.6s) */}
        <Series.Sequence durationInFrames={150}>
          <ProblemScene />
        </Series.Sequence>

        {/* Act 3: Interactive Request & Instant Response Simulation (9.6s - 17.3s) */}
        <Series.Sequence durationInFrames={230}>
          <ApiDemoScene />
        </Series.Sequence>

        {/* Act 4: Core Pillars & Architecture Showcase (17.3s - 23.6s) */}
        <Series.Sequence durationInFrames={190}>
          <FeaturesScene />
        </Series.Sequence>

        {/* Act 5: Terminal Quick-Start & GitHub Call-to-Action (23.6s - 30.0s) */}
        <Series.Sequence durationInFrames={190}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
