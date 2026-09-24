import { Router, Response } from 'express';
import { io } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { assertSsrfSafe, createSafeLookup, SsrfBlockedError } from '../utils/ssrf';
import { isValidId } from '../utils/ids';
import { readCappedBody } from '../utils/proxyLimits';

const router = Router();

// ── ALL /api/capture/:workspaceId/* ──────────────────────────────────────────
// This endpoint writes captured traffic into a workspace AND makes the
// server issue an outbound request to whatever URL the caller supplies — so
// it must never be reachable without proving membership in that workspace
// first (previously it had no auth at all: anyone on the internet could
// write into any workspace by guessing its id and use this server as an
// open SSRF relay).
router.all('/:workspaceId/*', authenticate, async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const targetPath = req.params[0];

  if (!isValidId(workspaceId)) {
    return res.status(400).json({ message: 'Invalid workspace ID' });
  }

  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace' });
    }
  }

  try {
    // 1. Find or create the "Captured Requests" collection
    let collection = await CollectionRepository.findByWorkspaceAndName(workspaceId, 'Captured Requests');
    if (!collection) {
      collection = await CollectionRepository.create({
        workspaceId,
        name: 'Captured Requests',
        description: 'Automatically captured proxy requests',
        createdBy: String(req.user!._id),
      });
    }

    // 2. Extract target URL from path or header
    const headerTarget = req.headers['x-target-url'];
    let targetUrl = Array.isArray(headerTarget) ? headerTarget[0] : headerTarget;
    if (!targetUrl && targetPath) {
      // If path looks like a URL without protocol
      if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
        targetUrl = targetPath;
      } else {
        targetUrl = `https://${targetPath}`;
      }
    }

    // Include query parameters in target URL
    const queryString = Object.keys(req.query).length > 0 
      ? '?' + new URLSearchParams(req.query as any).toString() 
      : '';
    
    const finalUrl = (targetUrl || '') + queryString;

    // 3. Construct Headers for DB
    const headers = [];
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'x-target-url') continue;
      if (key.toLowerCase() === 'host') continue;
      
      if (Array.isArray(value)) {
        headers.push({ key, value: value.join(', '), enabled: true });
      } else if (value) {
        headers.push({ key, value: value.toString(), enabled: true });
      }
    }

    // 4. Construct Body for DB
    let requestBody: any = { mode: 'none' };
    const contentType = req.headers['content-type'] || '';
    
    if (Object.keys(req.body || {}).length > 0 || (req.body && typeof req.body === 'string')) {
      if (contentType.includes('application/json')) {
        requestBody = { mode: 'raw', rawLanguage: 'json', raw: JSON.stringify(req.body, null, 2) };
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const items = [];
        for (const [key, value] of Object.entries(req.body)) {
          items.push({ key, value: String(value), enabled: true });
        }
        requestBody = { mode: 'urlencoded', urlencoded: items };
      } else {
        requestBody = { mode: 'raw', rawLanguage: 'text', raw: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) };
      }
    }

    // 5. Create Request Document
    const newRequest = await RequestRepository.create({
      collectionId: collection._id,
      name: `Captured: ${req.method} ${targetUrl ? new URL(finalUrl).hostname : finalUrl || 'Unknown'}`,
      method: req.method,
      url: finalUrl,
      headers,
      body: requestBody,
      createdBy: String(req.user!._id),
    });

    // 6. Notify connected clients
    io.to(`workspace:${workspaceId}`).emit('collection:update', {
      action: 'create-request',
      data: newRequest
    });
    
    // We also might want to notify about the collection if we created it
    io.to(`workspace:${workspaceId}`).emit('collection:update', {
      action: 'create',
      data: collection
    });

    // 7. Forward request if target is known
    if (finalUrl) {
      try {
        const systemConfig = await SystemConfigRepository.getConfig();
        const allowPrivate = systemConfig?.proxy?.allowPrivateTargets ?? false;
        await assertSsrfSafe(finalUrl, allowPrivate);

        const outHeaders = new Headers(req.headers as any);
        outHeaders.delete('host');
        outHeaders.delete('x-target-url');

        const { fetch: undiciFetch, Agent } = await import('undici');
        const fetchOptions: any = {
          method: req.method,
          headers: outHeaders,
          dispatcher: new Agent({ connect: { lookup: createSafeLookup(allowPrivate) } }),
        };

        if (!['GET', 'HEAD'].includes(req.method) && requestBody.mode !== 'none') {
          fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const response = await undiciFetch(finalUrl, fetchOptions);
        const responseBody = (await readCappedBody(response.body as any)).toString('utf8');
        
        // Forward status and headers
        res.status(response.status);
        response.headers.forEach((val, key) => {
          try { res.setHeader(key, val); } catch (e) {}
        });
        
        return res.send(responseBody);
      } catch (err: any) {
        const status = err instanceof SsrfBlockedError ? 400 : 502;
        return res.status(status).json({ error: 'Proxy forwarding failed', details: err.message, capturedId: newRequest._id });
      }
    } else {
      return res.status(200).json({ message: 'Request captured successfully (no target to forward)', capturedId: newRequest._id });
    }
  } catch (err: any) {
    console.error('Capture error:', err);
    return res.status(500).json({ message: 'Error capturing request', error: err.message });
  }
});

export default router;
