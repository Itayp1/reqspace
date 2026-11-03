# פירוט בדיקות שנפלו

מקור: ריצת Playwright המלאה על פרויקט `sqlite` (`npx playwright test --project=sqlite`), 28 בספטמבר 2026.

סיכום הריצה: **118 עברו**, **1 נכשלה**, **1 לא יציבה** (נכשלה ואז עברה בניסיון השני). סה״כ 121 בדיקות.

בדיקות היחידה של הקליינט (6) ובדיקות השרת (186 עברו, 2 דולגו) לא נכשלו.

שתי הנפילות הן באותו קובץ ובאותה נקודה: אחרי התחברות מחדש ובחירת סביבת העבודה, האוסף `Test Collection` לא נמצא בסיידבר.

## 1. נכשלה

**שם:** `Request Operations › URL-encoded body persists and sends as application/x-www-form-urlencoded`

**קובץ:** `tests/e2e/requests.spec.ts`, שורה 238

**שגיאה:**

```
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('node-Test Collection')
Expected: visible
Timeout: 5000ms
Error: element(s) not found
```

הנפילה בשורה 240, מיד אחרי `workspace-select.selectOption(workspaceId)`, לפני שהבדיקה ממלאת גוף URL-encoded או שולחת בקשה.

**מה היה על המסך:** סביבת העבודה `Request Workspace` נבחרה, ופאנל האוספים הראה `No collections yet` וכפתור `+ Create Collection`.

**למה זה מפיל את הבדיקה:** הקובץ רץ במצב `serial`. הבדיקה הראשונה יוצרת את `Test Collection` פעם אחת, וכל בדיקה אחר כך מתחברת מחדש (`beforeEach` עושה login) ומצפה שהאוסף עדיין קיים באותה סביבת עבודה. כאן הרשימה נטענה ריקה, ולכן הבדיקה לא הגיעה לשמירת הבקשה, לריענון, או לבדיקת `application/x-www-form-urlencoded`.

הניסיון החוזר נכשל באותה טענה. שאר הבדיקות שאחריה באותו קובץ רצו מחדש בגלל המצב הסדרתי.

## 2. לא יציבה (נכשלה, ואז עברה)

**שם:** `Request Operations › Basic auth persists and resolves after save+reload`

**קובץ:** `tests/e2e/requests.spec.ts`, שורה 131

**שגיאה בניסיון הראשון:**

```
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('node-Test Collection')
Expected: visible
Timeout: 5000ms
Error: element(s) not found
```

הנפילה בשורה 133, באותו תנאי כמו הבדיקה שנכשלה: אחרי בחירת סביבת העבודה, `node-Test Collection` לא הופיע תוך 5 שניות. הבדיקה לא הגיעה למילוי Basic Auth או לשליחת הבקשה.

הניסיון השני עבר, ולכן Playwright סימן אותה כ-flaky ולא ככישלון סופי.
