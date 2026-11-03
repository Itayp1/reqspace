# E2E Tests Failure Analysis

להלן ניתוח הסיבות לכישלון של חלק ממבחני ה-E2E (Playwright) והפתרונות המוצעים עבורם:

## 1. Workspace Management & RBAC Roles
**הטסטים שנכשלו:**
* `Workspace Management › removing a member immediately revokes their access`
* `RBAC Roles › Viewer cannot edit, Editor can edit`

**הסיבה לכישלון:**
בשני המקרים המערכת בודקת שינוי הרשאות מיידי (הסרת גישה למשתמש, או שינוי תפקיד מ-Viewer ל-Editor). בשרת (Backend), ההרשאות נשמרות במטמון (Cache) בעזרת המשתנה `workspaceRoleCache` כדי לשפר ביצועים (בתוך `rbac.ts`). 
עם זאת, כאשר מתבצע שינוי הרשאה או הסרה של משתמש בסביבת העבודה (בקובץ `routes/workspaces.ts`), השרת **לא מנקה את המטמון** עבור אותו משתמש. כתוצאה מכך, המשתמש ממשיך לקבל את ההרשאות הישנות שלו עד שהמטמון פג תוקף (30 שניות).

**הפתרון:**
יש להוסיף ניקוי של ה-Cache בקובץ `server/src/routes/workspaces.ts` בעת הוספה, עריכה או הסרה של חבר מצוות:
```typescript
import { workspaceRoleCache } from '../utils/cache';

// בתוך הפונקציה שמסירה או מעדכנת חבר ב-workspace:
workspaceRoleCache.delete(`${req.params.userId}:${req.params.id}`);
```

## 2. Authentication 
**הטסט שנכשל:**
* `Authentication › should handle expired session gracefully`

**הסיבה לכישלון:**
הטסט מדמה פקיעת תוקף של חיבור (Session) על ידי זריקת אירוע (Event) מסוג `unauthorized` ברמת ה-Window ב-Client, ומצפה שהאפליקציה תנתב את המשתמש לעמוד ה-`/login`. ייתכן שישנה בעיה של Timing (ה-Assertion מתבצע לפני שה-React Router מספיק לנתב), או שהקומפוננטה שמאזינה לאירוע (`AuthGuard`) אינה מגיבה בצורה נכונה מחוץ להקשר המסוים.

**הפתרון:**
יש לוודא שהאירוע `unauthorized` נתפס בצורה גלובלית (למשל ב-`App.tsx` ברמה העליונה ביותר) ולא רק תחת נתיבים ספציפיים, או לחילופין להוסיף בטסט המתנה (Timeout) ארוכה יותר לשינוי ה-URL (באמצעות `await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });`).

## 3. History Logging
**הטסט שנכשל:**
* `History Logging › Save to Collection from History`

**הסיבה לכישלון:**
הטסט מנסה לשמור בקשה מתוך היסטוריית הבקשות לאוסף קיים (Collection). ככל הנראה החלון הקופץ (Modal) של השמירה דורש בחירה מפורשת של ה-Collection שאליו תישמר הבקשה, אך בטסט (בשורה 123 ב-`history.spec.ts`) יש רק הזנה של שם הבקשה ללא בחירת אוסף. אם יש רק אוסף אחד הוא אולי לא נבחר כברירת מחדל, מה שמשאיר את כפתור השמירה מנוטרל או גורם לשגיאה בשרת.

**הפתרון:**
יש לתקן את הטסט ב-`history.spec.ts` כך שיבחר את האוסף הרלוונטי בחלון השמירה לפני שהוא לוחץ על כפתור השמירה, באותו אופן שבו זה נעשה במקומות אחרים באפליקציה, או לוודא שה-UI בוחר אוטומטית אם יש רק אוסף אחד.

## 4. שאר הטסטים
**(Requests, Scripts Scope, Share Links, Tabs)**
מרבית הכשלונות האחרים נובעים מתקלות דומות של Timing (המתנה לטעינת אלמנטים ב-DOM לפני לחיצה עליהם, במיוחד מודלים שנטענים באופן אסינכרוני), או תלות מרומזת ב-Cache (כמו ב-Share links או ב-Scripts scope). 
כדי לאמת את הסיבה המדויקת של כל אחד מהם ברמת ה-DOM, מומלץ להריץ אותם בנפרד במצב Debug של Playwright.
