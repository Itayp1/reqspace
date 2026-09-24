# Code Review — Reqspace

מסמך חי. נכתב תוך כדי סקירת הקוד ב־2026-09-23.

**סטטוס:** סקירה ראשונית הושלמה. בחר מה לתקן קודם.

---

## איך לקרוא

- **P0** — אבטחה / נכונות קריטית (ייצור / SaaS)
- **P1** — באג אמיתי, חור הרשאות, פיצ'ר שבור
- **P2** — איכות, DX, ביצועים, אחידות
- **P3** — ניקיון, תיעוד, nice-to-have

בסוף יש טבלת סיכום לבחירה.

---

## P0 — אבטחה וקריטי

### 1. תמיכת SQL מפורסמת, אבל רוב השרת מדבר רק MongoDB

ה-README מבטיח SQLite / PostgreSQL / MySQL / MongoDB. יש `UserRepository` / `WorkspaceRepository` עם פיצול `isMongo()`, אבל **רוב ה-routes וה-middleware קוראים ישירות למודלי Mongoose**.

דוגמאות:

- `server/src/middleware/auth.ts` — `User.findOne` / `User.findById` (התחברות בכלל לא תעבוד על SQL)
- `server/src/middleware/rbac.ts` — `Workspace.findById` + `mongoose.isValidObjectId` (UUID של SQL יידחה)
- `server/src/routes/workspaces.ts`, `collections.ts`, `admin.ts`, `history.ts`, `environments.ts`, `share.ts` — כולם Mongoose

בנוסף: Electron מריץ `DB_TYPE=sqlite`. במצב הזה האפליקציה כנראה לא באמת עובדת אחרי login.

**מה לתקן:** כל גישה ל-DB רק דרך repositories. לבטל `isValidObjectId` כתנאי גלובלי או לתמוך בשני סוגי מזהים.

---

### 2. Header auth = impersonation אם מישהו יכול לשלוח את הכותרת

ב-`authenticate`, במצב `header` / `both`: אם מגיע `X-Auth-User` (או שם שמוגדר בקונפיג), השרת **יוצר משתמש אוטומטית ושם cookie**. אין אימות שהכותרת הגיעה מ-IdP / reverse proxy.

אם האפליקציה חשופה לאינטרנט בלי שהפרוקסי מוחק את הכותרת מהלקוח — כל אחד יכול להתחזות לכל מייל.

**מה לתקן:** לא לסמוך על הכותרת אלא אם `req.ip` הוא רשת פנימית / `TRUSTED_PROXY`. או לכפות שה-header מוגדר רק מאחורי gateway.

---

### 3. Share-proxy הוא פרוקסי פתוח לאנונימי

`POST /api/share/:shortId/proxy` **לא דורש login**. מי שיש לו קישור שיתוף יכול לגרום לשרת לשלוח בקשת HTTP לכל URL, כולל `localProxy` מהלקוח.

זה SSRF / open-proxy לכל מי שקיבל לינק (או ניחש `shortId` של 12 hex chars — 48 ביט, סביר אבל לא חזק).

בנוסף, `GET /api/share/:shortId` מחזיר את **כל ה-requests כולל headers, tokens, scripts**.

**מה לתקן:**

- לא להריץ proxy מלינק ציבורי, או להגביל ל-URLs שמופיעים באוסף ששותף
- לסנן סודות מהתגובה הציבורית (auth, cookies, variables)
- לחסום `localProxy` בנתיב הציבורי
- shortId ארוך יותר + rate limit

---

### 4. Google OAuth: `redirectUri` מהלקוח + אין state

`POST /api/auth/google` מקבל `redirectUri` מגוף הבקשה. תוקף יכול להחליף קוד authorization מול redirect URI זדוני אם Google מאפשר כמה URIs, או לדלוף פרטי שגיאה (`details: tokenData`).

אין `state` / CSRF על ה-callback.

**מה לתקן:** allowlist קשיח של redirect URIs בשרת; לא להחזיר `tokenData`; state אקראי ב-cookie.

---

### 5. סקריפטי Pre-request / Tests רצים ב-`new Function` ב-thread הראשי

`client/src/utils/scripts.ts` מריץ קוד משתמש עם גישה ל-`window`, `document`, `localStorage`, `fetch`, וה-API של האפליקציה (`api.post('/proxy', ...)` ב-`pm.sendRequest`).

יש `client/src/sandbox/worker.ts` כמעט לא בשימוש. הסקריפט יכול לגנוב טאבים מ-localStorage (כולל Bearer tokens), לקרוא cookies של Reqspace (לא httpOnly של API, אבל cookies של המשתמש ב-cookieStore), ולשלוח בקשות בשם המשתמש.

Visualizer ב-`ResponseViewer.tsx` הוא iframe **בלי `sandbox`**, עם `innerHTML` של Handlebars + CDN חיצוני.

**מה לתקן:** להריץ רק ב-Worker / iframe עם `sandbox` בלי `allow-same-origin`; לא לחשוף `api` לסקריפט בלי allowlist.

---

### 6. סיסמת admin ברירת מחדל + JWT ב-k8s

- `ADMIN_EMAIL=admin` / `ADMIN_PASSWORD=admin` אם אין superadmin. החשבון פעיל עד login ראשון.
- `k8s/secret.yaml`: `JWT_SECRET` הוא base64 של `change_me_in_production`. `jwtSecret.ts` דוחה בדיוק ערכים כאלה ויוצר סוד מקומי **לקובץ דיסק** — ב-k8s עם 2 replicas הסוד לא משותף, סשנים נשברים / כל פוד חותם אחרת.
- Mongo: `tlsInsecure: true` ב-`connect.ts`.

**מה לתקן:** לא ליצור admin עם סיסמה ידועה ב-production; Secret אמיתי; אותו JWT לכל הפודים; לא `tlsInsecure` כברירת מחדל.

---

### 7. Mass assignment + כתיבה ל-workspace זר

- `PUT /collections/:id`, `PUT /folders/:id`, `PUT /requests/:id` מעבירים `req.body` שלם ל-`findByIdAndUpdate` — אפשר לשנות `workspaceId` / `collectionId`.
- `POST /api/history/:id/save` יוצר request ב-`collectionId` מהלקוח **בלי בדיקת membership**.
- `POST /api/import/wsdl` יוצר collection לפי `workspaceId` מהגוף בלי `requireWorkspaceRole`.
- `PUT /api/auth/settings` ממזג `req.body` לתוך settings בלי allowlist (וגם מחזיר `err.message`).

---

### 8. DoS / גבולות חסרים על הפרוקסי

- `express.json({ limit: '50mb' })` — קל להפיל את התהליך.
- timeout מהלקוח בלי תקרה.
- גוף תשובה נקרא כולו לזיכרון (`arrayBuffer`).
- Load Test ב-UI יורה הרבה `POST /api/proxy` בלי rate limit על הפרוקסי.
- `localProxy` מהלקוח: המשתמש המחובר (וב-share, גם אנונימי) יכול לנתב דרך פרוקסי שרירותי.

אין `helmet`, אין `trust proxy`, אין CSP. Rate limit קיים רק ל-login/register והוא in-memory (לא עובד עם כמה replicas).

---

## P1 — באגים והרשאות

### 9. Realtime כמעט שבור

`checkPermissionByItem` שם `req.params.workspaceId`, אבל אחרי update נקרא:

`emitToWorkspace((req as any).resolvedWorkspaceId, ...)`

`resolvedWorkspaceId` **אף פעם לא מוגדר**. עדכוני collection/folder/request לא משודרים.

`emitToWorkspace` משדר רק אם `room.size > 1`, ועם `io.to(room)` גם השולח מקבל (רענון כפול). Presence לא מוודא מבנה `{ workspaceId, requestId, user }`.

---

### 10. הזמנת חבר — ReDoS / חיפוש לא בטוח

`workspaces.ts`:

```ts
{ name: { $regex: new RegExp(`^${email}$`, 'i') } }
```

`email` לא מ-escape (בניגוד ל-`users.ts` שכבר תוקן). תווים מיוחדים ב-input שוברים את ה-regex או יוצרים ReDoS.

הערה: `requireWorkspaceRole('owner')` + SuperAdmin bypass — SuperAdmin יכול להזמין בלי להיות חבר.

---

### 11. היסטוריה בלי RBAC על workspace

`GET/DELETE /workspaces/:workspaceId/history` בודק רק `userId`, לא חברות ב-workspace. מחיקת היסטוריה של workspace אחד מאפסת `historyUsedBytes` לכל המשתמש.

`mongoose.Types.ObjectId(workspaceId)` ב-proxy ייכשל על UUID.

---

### 12. מחיקת תגובות לכל viewer

`DELETE /requests/:id/comments/:commentId` דורש רק `viewer` ויכול למחוק תגובה של מישהו אחר.

---

### 13. Import/Export / Runner הם stubs

- `GET /collections/:id/export` מחזיר `{ item: [] }`
- `POST /collections/import` — stub
- `POST /runner/run` — stub
- Import אמיתי קורה בצד הלקוח (`ImportModal`) — חוסר עקביות, ואין בדיקת הרשאות בשרת על חלק מהזרימות

WSDL import בלי membership (ראו #7).

---

### 14. Admin import דורס SystemConfig

`POST /api/admin/import/:workspaceId` אם יש `dump.config` קורא ל-`updateConfig` — ייבוא workspace יכול לשנות SMTP / OAuth secret / proxy של כל המערכת.

`GET /api/admin/export/:workspaceId` כולל `config` המלא (עם masking ב-GET config הרגיל, אבל כאן `SystemConfigRepository.getConfig()` גולמי?).

---

### 15. סיסמאות חלשות ולא אחידות

- שינוי סיסמה: מינימום **5** תווים, בלי הסיסמה הישנה.
- bcrypt cost 12 בהרשמה, 10 ב-change-password וב-bootstrap admin.
- `User.authType` enum הוא רק `password | header`, אבל Google יוצר `authType: 'sso'` — עלול להיכשל ב-validation של Mongoose.

---

### 16. Cookie logout אולי לא מוחק

`clearCookie('token')` בלי אותם `secure` / `sameSite` / `path` כמו ב-`setCookieToken`. בדפדפנים מסוימים ה-cookie נשאר.

אין `app.set('trust proxy')` — מאחורי Ingress, `req.ip` ו-rate limit שבורים; cookies `secure` תלויים ב-`X-Forwarded-Proto` שלא נאמן.

---

### 17. k8s / Docker לא מתואמים

| מקום | פורט |
|---|---|
| `server` default | 3000 |
| `Dockerfile` EXPOSE | 3005 |
| k8s `containerPort` | 3000 |
| k8s Service (צריך לבדוק) | 80 על ingress |
| Electron | 3005 |

Dockerfile: `npm install` בלי lockfile, image סופי כולל python/g++. אין USER לא-root. HPA + replicas=2 בלי sticky sessions ל-socket.io.

---

### 18. sequalize `sync({ alter: true })` ב-production

`connect.ts` משנה סכימה בכל עלייה. מסוכן לנתונים. בנוסף `writeConfigFile` ל-`db-config.json` קיים, אבל אין route ` /admin/db-config` בקוד המקור — רק החרגה ב-`index.ts`. המתג ב-UI לתיקון DB כנראה לא מחובר.

---

## P2 — איכות קוד, קליינט, DX

### 19. טיפוסים: `any` בכל מקום, Zod לא בשימוש

`zod` ו-`ajv` ב-`package.json` של השרת **לא מיובאים בקוד**. אין schema ל-body של proxy/auth/admin.

`req.user?: any`. המון `as any`.

---

### 20. כפילות sandbox

`scripts.ts` (main thread) מול `worker.ts` (לא מחובר). `pm.sendRequest` stub ב-worker, מימוש אמיתי ב-main. Collection runner / server runner stubs.

---

### 21. סודות ב-localStorage

`requestStore` persist של כל ה-tabs כולל `auth.bearer.token`, basic password, גוף בקשה.

`cookieStore` ב-localStorage כולל ערך דמה `sess_default_123`.

`settingsStore` persist כולל סיסמת פרוקסי מקומי.

---

### 22. SocketSync תמיד refetch מלא

כל אירוע מבני גורם ל-`fetchCollectionsData` של כל העץ. Focus של החלון גם. עם הרבה משתמשים זה רעש רשת.

URL של הסוקט: `api.defaults.baseURL?.replace('/api', '')` — שביר אם baseURL הוא `http://host/api/v1`.

---

### 23. תלויות כבדות / כפולות בקליינט

`moment` + `date-fns`, `lodash` כולו, `crypto-js`, `chai` ב-bundle (לבדיקות סקריפט). Monaco. Handlebars מ-jsDelivr בזמן ריצה (תלות ברשת + אספקת צד שלישי).

שורש הפרויקט: Electron 44, `appId: com.reqspaceclone.app`, שם ישן.

---

### 24. בריאות / דליפת מידע

`GET /api/health` ו-503 מחזירים `dbError` גולמי (לפעמים מחרוזת חיבור). ב-production עדיף הודעה כללית.

`/api/auth/config` ציבורי ומחזיר Google `clientId` (סביר) ו-`allowSelfRegistration` (ברירת מחדל **true** — שרת פתוח להרשמה).

---

### 25. SSRF: כיסוי חלקי ב-IPv6 / פרוטוקול

`ssrf.ts` טוב יחסית (כולל DNS lookup pin). חסרים: NAT64 (`64:ff9b:`), IPv4-mapped בפורמטים אחרים, `0x7f000001`, מארח עם נקודה בסוף. `proxy.ts` לא בודק `http:`/`https:` לפני fetch. Redirect ל-host פרטי אמור להיתפס ב-lookup של undici — כדאי לוודא בטסט.

Capture forwarding משתמש ב-`fetch` הגלובלי **בלי** `createSafeLookup` (רק `assertSsrfSafe` לפני — TOCTOU / DNS rebind).

---

### 26. בדיקות

יש Playwright (`tests/`, `client/e2e/`) ו-Jest ל-DB. אין בדיקות יחידה ל-SSRF, ל-proxy, או ל-routes על SQL. Jest `globals.ts-jest` deprecated. `moduleNameMapper` מחליף `connect` רק בטסטים.

---

### 27. UI: AuthGuard כפול, שגיאות inline

`/admin` עטוף ב-`AuthGuard` פעמיים. הרבה `style={{}}` במקום Tailwind ב-`App.tsx`. אין טיפול אחיד ב-403 מול 401.

---

## P3 — ניקיון

- הערות `??` במקום emoji ב-`share.ts`
- `runner.ts` קובץ ריק כמעט
- `ensureDefaultAdmin` ב-`User.ts` כפול ל-bootstrap ב-`index.ts`
- `server/dist` ב-repo (אם committed — לא צריך)
- README עם backticks שבורים (`bash במקום ```bash`)
- שמות: התיקייה `postman`, המוצר Reqspace, DB default `postman_clone`
- `multer` / `http-proxy-middleware` / `archiver` / `postman-collection` — לבדוק אם בשימוש
- תעודות לקוח (מפתחות פרטיים) נשמרות ב-DB בטקסט גלוי

---

## מה כבר נראה טוב

אל תזרקו את זה בתיקון:

- JWT secret כבר לא `changeme` קשיח; יש דחיית ערכי דוגמה
- Cookie httpOnly + sameSite lax + secure ב-production
- Rate limit על login/register
- SSRF guard עם pin ב-connect (undici lookup)
- RBAC על collections לפי item (חלקי)
- Share create דורש editor
- Capture דורש authenticate + editor
- Audit log + masking של סודות ב-GET admin config
- CORS לא `*` ב-production
- סוקט לא מצטרף ל-workspace בלי membership

---

## טבלת בחירה — מה לתקן קודם

סמן / תגיד מספרים:

| # | עדיפות | נושא | מאמץ משוער |
|---|---|---|---|
| 1 | P0 | לאחד DB מאחורי repositories (SQL באמת עובד) | גדול |
| 2 | P0 | לחזק header-auth | קטן |
| 3 | P0 | לסגור share-proxy + לא לדלוף סודות ב-share | בינוני |
| 4 | P0 | OAuth redirectUri / state | קטן |
| 5 | P0 | Sandbox לסקריפטים + iframe visualizer | בינוני |
| 6 | P0 | Admin default / JWT ב-k8s / tlsInsecure | קטן |
| 7 | P0 | Mass assignment + WSDL/history save RBAC | בינוני |
| 8 | P0 | גבולות גודל/timeout/rate-limit ל-proxy + helmet | בינוני |
| 9 | P1 | לתקן `resolvedWorkspaceId` / שידורי socket | קטן |
| 10 | P1 | Escape regex בהזמנת משתמש | קטן |
| 11 | P1 | RBAC להיסטוריה | קטן |
| 12 | P1 | מחיקת תגובות רק לבעלים | קטן |
| 13 | P1 | Import/Export/Runner אמיתיים או להוריד מה-UI | גדול |
| 14 | P1 | Admin import לא דורס config גלובלי | קטן |
| 15 | P1 | מדיניות סיסמה + authType `sso` | קטן |
| 16 | P1 | clearCookie + trust proxy | קטן |
| 17 | P1 | ליישר Docker/k8s/PORT | קטן |
| 18 | P1 | לא `alter: true` ב-prod; db-config route | בינוני |
| 19 | P2 | Zod על קלטים | בינוני |
| 20 | P2 | Worker sandbox אחד | בינוני |
| 21 | P2 | לא persist סודות ב-localStorage | קטן |
| 22 | P2 | Socket events מדויקים במקום refetch | בינוני |
| 23 | P2 | לנקות תלויות (moment/lodash) | קטן |
| 24 | P2 | לא לדלוף dbError / הרשמה פתוחה כברירת מחדל | קטן |
| 25 | P2 | SSRF: capture עם lookup pin + protocol check | קטן |
| 26 | P2 | טסטים ל-SSRF/proxy/SQL routes | בינוני |

---

## קבצים מרכזיים שנסרקו

שרת: `index.ts`, `auth.ts` (middleware+routes), `rbac.ts`, `jwtSecret.ts`, `ssrf.ts`, `rateLimit.ts`, `proxy.ts`, `share.ts`, `shareProxy.ts`, `capture.ts`, `admin.ts`, `workspaces.ts`, `collections.ts`, `history.ts`, `environments.ts`, `importExport.ts`, `runner.ts`, `users.ts`, `connect.ts`, `dbConfig.ts`, `UserRepository.ts`, `socketUtils.ts`

קליינט: `App.tsx`, `axios.ts`, `scripts.ts`, `sandbox/worker.ts`, `ResponseViewer.tsx`, `SocketSync.tsx`, `requestStore.ts`, `LoadTestModal.tsx`, `OAuthCallbackPage.tsx`, `ImportModal.tsx`

תשתית: `Dockerfile`, `k8s/*`, `main.js`, `package.json` (root/client/server)
