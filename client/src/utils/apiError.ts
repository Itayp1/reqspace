/** The server's validation `issues[].message` (what the user must fix) when present, else its message, else the fallback. */
export function apiErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const issues: any[] = Array.isArray(data?.issues) ? data.issues : [];
  const text = issues.map((i) => i?.message).filter(Boolean).join('. ');
  return text || data?.message || fallback;
}
