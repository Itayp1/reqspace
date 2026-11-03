# תוכנית לייצוב Playwright E2E (tests/e2e)

## רקע

תשתית הטסטים תוקנה ואומתה (ראה היסטוריית שיחה / commits): פורט 3005 בכל מקום,
בידוד workspace בין קבצי `server/src/tests/*.e2e.test.ts` (jest), סדר
wipe→start נכון ב-Playwright, `reuseExistingServer` נכון (false מקומית /
true ב-CI), ותיקון ה-`:memory:` sqlite שגרם ל-Playwright לקרוס כמעט לגמרי
(2 עוברים בלבד) בגלל connection pool של Sequelize שפותח כמה DB-ים נפרדים
בו-זמנית ל-`:memory:`. אחרי המעבר לקובץ זמני ייחודי (כמו ש-CI כבר עושה עם
`/tmp/ci.sqlite`): **74/124 עוברים**.

מסמך זה עוסק **רק** ב-~28 הכשלים שנשארו ב-`tests/e2e/*.spec.ts` — אלה כבר לא
בעיית תשתית (שרת/DB/פורט), אלא בעיות ברמת הטסט/אפליקציה עצמם.

## אבחנה של הבעיה בשורש

Playwright מריץ **שרת אחד חי אחד לכל הריצה כולה** (`fullyParallel: false`,
`workers: 1`), וכל 28 קבצי ה-spec מתחברים לאותו admin גלובלי יחיד שנוצר פעם
אחת ב-bootstrap. זו בדיוק אותה בעיה שתוקנה כבר ב-jest e2e (`wss[0]` שגוי) —
אבל **לא** תוקנה כאן. ככל שהריצה מתקדמת, ה-admin צובר עוד ועוד workspaces
מקבצי spec קודמים, ובדיקות שמניחות הנחות כמו "ה-workspace שיצרתי הוא הנבחר
כרגע ב-dropdown" נשברות כשיש כבר עשרות workspaces ישנים במערכת.

דוגמה מאומתת (`collection.spec.ts:7`):
```
Locator: getByTestId('workspace-select')
Expected substring: "Test Workspace"
Received string:    "Admin's Workspace"
```
ה-workspace שנוצר בטסט לא הפך לנבחר אוטומטית — כי כבר יש הרבה workspaces
אחרים במערכת מריצות קודמות, וההנחה הישנה ("אין עדיין אחרים, אז החדש יהיה
הראשון/הנבחר") כבר לא מחזיקה.

**לא כל הכשלים מאותה סיבה.** נמצא גם באג נפרד לגמרי:

דוגמה מאומתת (`client-proxy.spec.ts:16`):
```
Locator: getByTestId('sidebar-workspaces')
```
ה-testid `sidebar-workspaces` **לא קיים בכלל** בקוד הקליינט (`client/src`) —
טסט ישן/שבור שמחפש אלמנט שכבר לא קיים, לא קשור ל-state משותף.

מסקנה: יש **לפחות שתי קטגוריות שונות** של כשל, וצריך לאבחן כל spec בנפרד
לפני שמתקנים — לא להניח שהכל אותה סיבה.

## רשימת הקבצים שנכשלים (הרצה אחרונה, sqlite)

```
auth.spec.ts            (2 טסטים — כנראה לא קשור ל-state, ראה הערה למטה)
client-proxy.spec.ts    (2 טסטים — testid שבור, מאומת)
collection.spec.ts      — state משותף, מאומת
concurrency.spec.ts
conflict.spec.ts
crud-rename.spec.ts
edgecases.spec.ts
environments.spec.ts
history.spec.ts
import-export.spec.ts
rbac.spec.ts
requests.spec.ts
response.spec.ts        (2 טסטים)
runner.spec.ts          (4 טסטים)
scripts-scope.spec.ts
scripts.spec.ts
share.spec.ts
socket-advanced.spec.ts
socket-events.spec.ts
socket-sync.spec.ts
tabs.spec.ts             (2 טסטים)
workspace.spec.ts        (2 טסטים)
```
(+ "20 did not run" — כנראה נחתכו מזמן/תקציב ריטריי; לבדוק מחדש אחרי שהרשימה
למעלה תרד).

הערה על `auth.spec.ts`: שני הכשלים שם (`should enforce forced first-login
password change`, `should handle expired session gracefully`) **לא** קשורים
כנראה ל-state משותף — הראשון עושה מוק מלא של הרשת (`page.route`) ולא נוגע
בשרת האמיתי בכלל, אז חייב להיות באג בקליינט או חוסר-התאמה בין המוק לצורת
ה-response האמיתית היום. השני תלוי בטסט שלפניו (state בתוך אותו קובץ, לא
חוצה-קבצים). לבדוק את שניהם **בנפרד**, לא כחלק מתיקון ה-workspace collision.

## תוכנית עבודה מוצעת

### שלב 0 — אבחון (לפני כל תיקון)
להריץ כל spec כושל **בבידוד מלא** (`npx playwright test tests/e2e/X.spec.ts
--project=sqlite`, שרת טרי לכל קובץ) ולראות אם הוא עובר לבד. זה ממפה מיד
לשתי קבוצות:
- **עובר לבד, נכשל ברצף המלא** → בעיית state משותף (הרוב, כנראה).
- **נכשל גם לבד** → באג אמיתי בטסט/באפליקציה (כמו `client-proxy.spec.ts`
  ו-`auth.spec.ts`), לא קשור לסדר ריצה.

זה חוסך זמן: אין טעם "לתקן בידוד" על טסט ששבור גם ככה.

### שלב 1 — תיקון קבוצת ה-state המשותף
לכל spec בקבוצה הזו: להחליף הנחות כמו "יש רק workspace אחד" / "ה-workspace
האחרון שנוצר הוא הנבחר" בבחירה מפורשת ואקטיבית — בדיוק כמו התיקון שכבר בוצע
ב-jest (`server/src/tests/*.e2e.test.ts`):
- אחרי יצירת workspace חדש ב-UI, לבחור אותו במפורש
  (`selectOption` / `page.getByTestId('workspace-select').selectOption(...)`)
  במקום להניח שהוא כבר נבחר.
- כל spec שיוצר workspace/collection בשם קבוע ("Test Workspace" וכו') —
  להוסיף סיומת ייחודית (`Date.now()` / `uuidv4()`) כדי לא להתנגש בין ריצות
  ובין קבצים, בדיוק כמו שכבר נעשה ב-`client-proxy.spec.ts` (המשתמש שם כבר
  ב-`uuidv4()` — תבנית טובה להעתיק לשאר).

### שלב 2 — תיקון קבוצת הבאגים האמיתיים
- `client-proxy.spec.ts`: להחליף `getByTestId('sidebar-workspaces')`
  ב-testid שבאמת קיים בסיידבר (יש `workspace-select` פעיל בעמוד, ראה
  ה-snapshot שנתפס), או להוסיף את ה-testid החסר לקליינט אם זה הכוונה
  המקורית.
- `auth.spec.ts` — "forced first-login password change": לבדוק מול הקוד
  הנוכחי (`client/src`, קומפוננטת הלוגין) איזו צורת response/state הוא
  מצפה לה היום, ולעדכן את המוק ב-`page.route` בהתאם. "expired session
  gracefully": לתקן אחרי ששני הטסטים שלפניו באותו קובץ יציבים.

### שלב 3 — הרצה מלאה + חזרה
אחרי כל שינוי: להריץ `npm run test:e2e -- --project=sqlite` פעם אחת מלאה
(לא רק את הקובץ הבודד) כדי לוודא שהתיקון לא שבר משהו אחר ב-state המשותף.
לחזור על זה 2-3 פעמים ברצף (כמו שנעשה ל-jest) כדי לוודא שאין flakiness
חדש.

### שלב 4 (רחוק יותר, אופציונלי)
לשקול אם שווה להנהיג isolation אמיתי גם ב-Playwright — למשל כל spec יוצר
לעצמו user/admin משלו במקום להסתמך על ה-admin הגלובלי (כמו שכבר נעשה
ב-jest). זה משנה ארכיטקטורה, לא רק תיקון נקודתי — כדאי להחליט על זה רק אחרי
ששלבים 0-3 יראו כמה מהכשלים באמת נפתרים בלי זה.
