const fs = require('fs');
const path = require('path');

const artifactDir = 'C:/Users/share/.gemini/antigravity/brain/a70ff4a0-27cd-479e-a1bd-85a4f11f4779';
const videoPath = 'c:/projects/reqspace/video/reqspace-promo.mp4';

if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

const videoBuffer = fs.readFileSync(videoPath);
const base64Video = videoBuffer.toString('base64');

const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-2">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-4 shadow-lg flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <h3 class="font-bold text-sm tracking-wide">Reqspace Promo — סירטון מקורי עם מוזיקת רקע (1080p Full HD)</h3>
      </div>
      <span class="text-xs text-[var(--muted-foreground)] font-mono">00:30 • 30 FPS • עם סאונד 🎵</span>
    </div>

    <div class="relative rounded-xl overflow-hidden border border-[var(--border)] bg-black aspect-video flex items-center justify-center shadow-inner">
      <video
        controls
        autoplay
        playsinline
        class="w-full h-full object-contain rounded-xl"
        src="data:video/mp4;base64,${base64Video}"
      ></video>
    </div>

    <div class="flex items-center justify-between text-xs text-[var(--muted-foreground)] pt-1">
      <div class="flex items-center gap-2">
        <span>🎬 לחץ על כפתור ה-Play לצפייה בסירטון עם המוזיקה ברקע</span>
      </div>
      <a
        href="file:///c:/projects/reqspace/video/reqspace-promo.mp4"
        target="_blank"
        class="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90 transition inline-flex items-center gap-1.5"
      >
        <span>פתח קובץ מקומי</span>
        <span>↗</span>
      </a>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(artifactDir, 'player.html'), html, 'utf8');
console.log('player.html written successfully, size: ' + (html.length / 1024 / 1024).toFixed(2) + ' MB');
