# Failed Tests Summary

הטסטים הבאים נכשלו במהלך הריצה האחרונה. הכישלונות אינם קשורים לשינויים שבוצעו במשימה 10 (PERF-4), אלא נובעים מבעיות תשתיתיות בטסטים עצמם או ממשימות פיתוח שעוד לא הושלמו:

## 1. שגיאות אתחול / חיבור לשרת (E2E Tests)
מרבית טסטי ה-E2E נכשלים מאחר והשרת אינו מצליח לעלות בזמן, או שהפורט המבוקש (3005) תפוס / לא מאזין. 
השגיאות הנפוצות הן `Server not healthy`, `Exceeded timeout of 5000 ms for a hook` או `ECONNREFUSED ::1:3005`.
**הקבצים שנכשלו עקב כך:**
- `src/tests/auth.e2e.test.ts`
- `src/tests/feat10.e2e.test.ts`
- `src/tests/fix1.e2e.test.ts`
- `src/tests/sec1.e2e.test.ts`
- `src/tests/sec9.e2e.test.ts`
- `src/tests/sec10.e2e.test.ts`
- `src/tests/sec11.e2e.test.ts`

## 2. חוסר באתחול מסד נתונים
**קובץ:** `src/tests/collection-rbac.test.ts`
**שגיאה:** `Sequelize not initialized. Call initSequelize() first.`
**סיבה:** קובץ הטסט מנסה לגשת למסד הנתונים (`getSequelize()`) לפני שבוצע שלב האתחול ההכרחי (`initSequelize()`). מדובר בבאג בקובץ הטסט (setup לקוי). כמו כן יש שגיאה ב-`afterAll` כי המשתנים לא אותחלו בגלל שהטסט קרס לפני כן.

## 3. ולידציות חסרות (משימה פתוחה - SEC-9)
**קובץ:** `src/tests/sec9.test.ts`
**שגיאה:** 
```
The following routes are missing Zod validation:
put /api/user-profile-variables/
post /api/collections/:id/fork
post /api/collections/:id/sync-upstream
```
**סיבה:** טסט זה בודק שכל נתיבי ה-POST/PUT/PATCH מוגנים בולידציה. הוא נכשל כיוון שמשימת ה-SEC-9 עדיין לא הושלמה במלואה במערכת, וישנם נתיבים שחסרים בהם סכמות ולידציה של Zod.
