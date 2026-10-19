import React from "react";
import { AbsoluteFill, Series, Audio, staticFile, interpolate } from "remotion";
import { KidsBackground } from "./components/KidsBackground";
import { KidsIntroScene } from "./scenes/KidsIntroScene";
import { EasyLoginScene } from "./scenes/EasyLoginScene";
import { ParentTasksScene } from "./scenes/ParentTasksScene";
import { ParentShopScene } from "./scenes/ParentShopScene";
import { ChildTasksScene } from "./scenes/ChildTasksScene";
import { MathQuizScene } from "./scenes/MathQuizScene";
import { ParentApprovalsScene } from "./scenes/ParentApprovalsScene";
import { QuizResultsScene } from "./scenes/QuizResultsScene";
import { ChildShopScene } from "./scenes/ChildShopScene";
import { KidsOutroScene } from "./scenes/KidsOutroScene";

export const KidsRankingPromo: React.FC = () => {
  return (
    <AbsoluteFill className="font-sans antialiased text-white overflow-hidden bg-[#0a0f1d]">
      {/* Cheerful Background Music (Carefree by Kevin MacLeod) */}
      <Audio
        src={staticFile("kids-music.mp3")}
        volume={(f) =>
          interpolate(f, [0, 25, 1220, 1270], [0, 0.45, 0.45, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Persistent Animated Kids Background with Stars & Pastel Glows */}
      <KidsBackground />

      {/* 10-Act Comprehensive Storyline Sequence (42.33s @ 30 FPS = 1270 frames) */}
      <Series>
        {/* Act 1: App Opening & Welcome Splash (0.0s - 4.0s = 120 frames) */}
        <Series.Sequence durationInFrames={120}>
          <KidsIntroScene />
        </Series.Sequence>

        {/* Act 2: Super Easy Login — Parent Google & Child QR (4.0s - 8.5s = 135 frames) */}
        <Series.Sequence durationInFrames={135}>
          <EasyLoginScene />
        </Series.Sequence>

        {/* Act 3: Parent Task Creation (8.5s - 12.66s = 125 frames) */}
        <Series.Sequence durationInFrames={125}>
          <ParentTasksScene />
        </Series.Sequence>

        {/* Act 4: Parent Rewards Shop Setup (12.66s - 16.33s = 110 frames) */}
        <Series.Sequence durationInFrames={110}>
          <ParentShopScene />
        </Series.Sequence>

        {/* Act 5: Child's Task Dashboard & Daily Submissions (16.33s - 20.5s = 125 frames) */}
        <Series.Sequence durationInFrames={125}>
          <ChildTasksScene />
        </Series.Sequence>

        {/* Act 6: Child Interactive Math Quiz / Learning Challenges (20.5s - 25.0s = 135 frames) */}
        <Series.Sequence durationInFrames={135}>
          <MathQuizScene />
        </Series.Sequence>

        {/* Act 7: Parent Real-Time Tracking & 1-Click Approvals (25.0s - 29.33s = 130 frames) */}
        <Series.Sequence durationInFrames={130}>
          <ParentApprovalsScene />
        </Series.Sequence>

        {/* Act 8: Parent Test Analytics & Mathematics Progress Report (29.33s - 33.83s = 135 frames) */}
        <Series.Sequence durationInFrames={135}>
          <QuizResultsScene />
        </Series.Sequence>

        {/* Act 9: Child Reward Shop & Voucher Redemption (33.83s - 38.16s = 130 frames) */}
        <Series.Sequence durationInFrames={130}>
          <ChildShopScene />
        </Series.Sequence>

        {/* Act 10: Celebration Finale & Family Call to Action (38.16s - 42.33s = 125 frames) */}
        <Series.Sequence durationInFrames={125}>
          <KidsOutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
