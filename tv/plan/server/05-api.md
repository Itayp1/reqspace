# S5 — ממשק ה-API (החוזה בין השרת לאפליקציה)

[← חזרה לתוכנית](../../plan.md)

## מטרה
להגדיר מראש בדיוק אילו בקשות האפליקציה שולחת ומה השרת מחזיר, כדי ששני החלקים ייבנו במקביל בלי הפתעות.

## עקרונות
- HTTP + JSON, קידוד UTF-8.
- כל בקשה שתלויה בפרופיל מקבלת `?profile=<id>`.
- זמנים במילישניות; תאריכים כ-epoch ms.
- שגיאות: `{ "error": "code", "message": "הסבר בעברית" }` עם קוד HTTP מתאים.
- גרסה: `GET /api/info` מחזיר `apiVersion`. האפליקציה מציגה "צריך לעדכן את השרת" אם הגרסה ישנה מדי.
- **אין אימות** — הרשת הביתית נחשבת אמינה. השרת מסרב לבקשות מכתובות שאינן ברשת הפרטית (10.x, 172.16-31.x, 192.168.x, localhost).

## נקודות קצה

### מידע ופרופילים
| בקשה | תיאור |
|---|---|
| `GET /api/info` | `{ name, apiVersion, counts: {movies, shows, episodes}, tmdb: "ok"/"missing-key"/"error" }` |
| `GET /api/profiles` | רשימת פרופילים |
| `POST /api/profiles` | יצירה `{ name, color, avatar }` |
| `PATCH /api/profiles/{id}` | עריכה |
| `DELETE /api/profiles/{id}` | מחיקה (כולל הסטטוס) |

### דפדוף
| בקשה | תיאור |
|---|---|
| `GET /api/home?profile=` | שורות מסך הבית (ראו למטה) |
| `GET /api/movies?profile=&sort=title\|added\|year&filter=all\|unwatched\|watched&genre=` | כל הסרטים |
| `GET /api/movies/{id}?profile=` | פרטי סרט מלאים |
| `GET /api/shows?profile=&sort=&filter=` | כל הסדרות |
| `GET /api/shows/{id}?profile=` | סדרה + עונות + פרקים + סטטוס לכל פרק + `nextEpisodeId` |
| `GET /api/search?q=&profile=` | חיפוש ([A5](../app/05-search.md)) |
| `GET /api/genres` | רשימת ז'אנרים קיימים |

### צפייה וסטטוס
| בקשה | תיאור |
|---|---|
| `GET /api/play/{itemId}?profile=` | כל מה שהנגן צריך: `streamUrl`, `subtitles[]`, `startPosition`, `title`, `nextEpisode` (אם פרק) |
| `POST /api/progress` | `{ profile, itemId, position, duration }` ← מחזיר סטטוס מעודכן |
| `POST /api/watched` | `{ profile, itemIds: [...], watched: true/false }` — פריט, עונה או סדרה |
| `POST /api/watched/until` | `{ profile, episodeId }` — "סמן עד כאן" |

### קבצים
| בקשה | תיאור |
|---|---|
| `GET /stream/{itemId}` | וידאו, עם Range |
| `GET /subtitles/{itemId}/{index}` | כתוביות ב-UTF-8 |
| `GET /images/{id}/poster` | פוסטר (סרט/סדרה) |
| `GET /images/{id}/backdrop` | תמונת רקע |
| `GET /images/{episodeId}/still` | תמונה מהפרק |

### ניהול
| בקשה | תיאור |
|---|---|
| `POST /api/library/rescan` | סריקה מחדש (מחזיר מיד; הסריקה רצה ברקע) |
| `GET /api/library/status` | `{ scanning, lastScan, metadataPending, problems[] }` |

## צורות נתונים

### כרטיס (בשורות, ברשימות ובחיפוש)
```json
{
  "id": "…", "type": "movie" | "show",
  "title": "המטריקס", "originalTitle": "The Matrix", "year": 1999,
  "posterUrl": "/images/…/poster",
  "progress": 0.35, "watched": false,
  "badge": null | "new-episode" | "new"
}
```

### `GET /api/home`
```json
{
  "rows": [
    { "id": "continue",  "title": "המשך צפייה",     "items": [ /* כרטיסים + subtitle "פרק 3 · עונה 2" */ ] },
    { "id": "nextUp",    "title": "הפרק הבא",       "items": [ … ] },
    { "id": "recent",    "title": "נוספו לאחרונה",  "items": [ … ] },
    { "id": "movies",    "title": "סרטים",          "items": [ … ] },
    { "id": "shows",     "title": "סדרות",          "items": [ … ] },
    { "id": "genre-28",  "title": "אקשן",           "items": [ … ] }
  ],
  "featured": { /* פריט אחד גדול לראש המסך: מ"המשך צפייה" או אקראי מ"לא נצפו" */ }
}
```
שורות ריקות לא נשלחות. עד 30 פריטים בשורה; "סרטים"/"סדרות" מובילות למסך רשימה מלא.

### פרטי סרט
```json
{
  "id": "…", "title": "…", "originalTitle": "…", "year": 1999,
  "overview": "תקציר…", "genres": ["אקשן", "מדע בדיוני"], "rating": 8.2,
  "runtime": 8160000, "posterUrl": "…", "backdropUrl": "…",
  "file": { "container": "mkv", "size": 8123456789, "resolution": "1080p", "playable": "yes" | "maybe" },
  "subtitles": [{ "index": 0, "lang": "he", "label": "עברית" }],
  "state": { "position": 0, "watched": false, "watchedAt": null }
}
```

## קריטריוני סיום
- [ ] כל נקודות הקצה מתועדות כאן ומיושמות.
- [ ] בדיקות אוטומטיות לכל נקודת קצה.
- [ ] האפליקציה משתמשת רק בבקשות שמופיעות כאן.

## תלויות
מגדיר את החוזה עבור [S1](01-core.md)–[S4](04-profiles-state.md) ועבור כל משימות האפליקציה.
