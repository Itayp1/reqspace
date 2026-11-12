/**
 * Keeps a history entry's request body bounded: form-data file parts lose their
 * base64 content (only name/size are kept) and an oversized string body is cut
 * with a marker, the same way the response body is.
 */
export function sanitizeRequestSnapshot(snapshot: Record<string, unknown>, maxBodyBytes: number): Record<string, unknown> {
  const body: any = snapshot.body;
  if (typeof body === 'string' && Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
    return { ...snapshot, body: body.substring(0, maxBodyBytes) + '... [truncated]', bodyTruncated: true };
  }
  if (body && typeof body === 'object' && body._isFormData && Array.isArray(body.items)) {
    const items = body.items.map((item: any) => {
      if (item?.type !== 'file') return item;
      const { content, ...rest } = item;
      return { ...rest, size: typeof content === 'string' ? Math.floor(content.length * 3 / 4) : undefined };
    });
    return { ...snapshot, body: { ...body, items } };
  }
  if (body && typeof body === 'object' && Array.isArray(body.formData)) {
    const formData = body.formData.map((item: any) => {
      if (item?.type !== 'file') return item;
      const { value, content, ...rest } = item;
      const raw = typeof value === 'string' ? value : typeof content === 'string' ? content : undefined;
      return { ...rest, value: '', size: raw !== undefined ? Math.floor(raw.length * 3 / 4) : item.size, contentOmitted: true };
    });
    return { ...snapshot, body: { ...body, formData } };
  }
  return snapshot;
}
