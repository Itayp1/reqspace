import { Transport, TransportRequest, TransportResponse } from './types';

export class BrowserTransport implements Transport {
  async send(req: TransportRequest): Promise<TransportResponse> {
    const startTime = Date.now();
    const headers = new Headers(req.headers as any);
    const fetchOptions: RequestInit = {
      method: req.method.toUpperCase(),
      headers,
    };
    
    if (!['GET', 'HEAD'].includes(req.method.toUpperCase()) && req.body !== undefined) {
      if (req.body._isFormData) {
        const formData = new FormData();
        for (const item of req.body.items) {
          if (item.type === 'file') {
            // Note: In browser, full file path might not be available or base64 decoding needed
            const buffer = Uint8Array.from(atob(item.content), c => c.charCodeAt(0));
            const blob = new Blob([buffer]);
            formData.append(item.key, blob, item.filename);
          } else {
            formData.append(item.key, item.value);
          }
        }
        fetchOptions.body = formData;
      } else {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    const controller = new AbortController();
    let timeoutId: any;
    if (req.timeout && req.timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), req.timeout);
    }
    fetchOptions.signal = controller.signal;
    if (req.followRedirects === false) {
      fetchOptions.redirect = 'manual';
    }

    try {
      const response = await fetch(req.url, fetchOptions);
      if (timeoutId) clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const arrayBuffer = await response.arrayBuffer();
      
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });

      const contentType = (responseHeaders['content-type'] || '').toLowerCase();
      const isBinary = contentType.includes('image/') || contentType.includes('application/pdf') || contentType.includes('audio/') || contentType.includes('video/') || contentType.includes('application/octet-stream');
      
      // Basic buffer to string conversion for browser
      let responseBody = '';
      if (isBinary) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        responseBody = btoa(binary);
      } else {
        responseBody = new TextDecoder('utf-8').decode(arrayBuffer);
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        isBase64: isBinary,
        responseTime,
        size: arrayBuffer.byteLength,
      };
    } catch (err: unknown) {
      const elapsed = Date.now() - startTime;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timed out after ${elapsed}ms`);
      }
      throw err;
    }
  }
}
