import { test, expect } from './fixtures';
import http from 'http';
import net from 'net';
import type { AddressInfo } from 'net';
import { apiAsAdmin } from './helpers';

const wsdl = (port: number) => `<?xml version="1.0"?>
<definitions name="Q86" targetNamespace="http://q86.test/" xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:tns="http://q86.test/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <message name="PingReq"><part name="msg" type="xsd:string"/></message>
  <message name="PingRes"><part name="out" type="xsd:string"/></message>
  <portType name="Q86Port"><operation name="Ping"><input message="tns:PingReq"/><output message="tns:PingRes"/></operation></portType>
  <binding name="Q86Binding" type="tns:Q86Port">
    <soap:binding style="rpc" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="Ping"><soap:operation soapAction="ping"/>
      <input><soap:body use="literal" namespace="http://q86.test/"/></input>
      <output><soap:body use="literal" namespace="http://q86.test/"/></output></operation>
  </binding>
  <service name="Q86Service"><port name="Q86Port" binding="tns:Q86Binding"><soap:address location="http://127.0.0.1:${port}/soap"/></port></service>
</definitions>`;

test.describe('Q8.6 allowPrivateTargets switch', () => {
  test('[Q8.6] WSDL import from a private address is blocked when off and allowed when on', async () => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/xml');
      res.end(wsdl((server.address() as AddressInfo).port));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/q86.wsdl`;
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    const original = !!before.proxy?.allowPrivateTargets;
    try {
      const wsList = await (await admin.get('/api/workspaces')).json();
      const workspaceId = (Array.isArray(wsList) ? wsList : wsList.workspaces)[0]._id ?? (Array.isArray(wsList) ? wsList : wsList.workspaces)[0].id;

      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: false } } })).ok()).toBeTruthy();
      const blocked = await admin.post('/api/import/wsdl', { data: { url, workspaceId } });
      expect(blocked.status()).toBe(400);
      expect((await blocked.json()).message).toMatch(/private|internal|blocked/i);

      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } })).ok()).toBeTruthy();
      const allowed = await admin.post('/api/import/wsdl', { data: { url, workspaceId } });
      const body = await allowed.json();
      expect(JSON.stringify(body)).not.toMatch(/private|internal|blocked/i);
      expect(allowed.status()).toBe(200);
      expect(body.collectionId).toBeTruthy();
    } finally {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: original } } });
      server.close();
    }
  });

  test('[Q8.6] SMTP Test Connection to a private address is blocked when off and reaches the host when on', async () => {
    // Minimal SMTP responder: greets, answers EHLO, accepts QUIT.
    let hits = 0;
    const CRLF = String.fromCharCode(13, 10);
    const smtp = net.createServer((sock) => {
      hits++;
      sock.write('220 q86.test ESMTP' + CRLF);
      sock.on('data', (d) => {
        const line = d.toString().toUpperCase();
        if (line.startsWith('EHLO') || line.startsWith('HELO')) sock.write('250 q86.test' + CRLF);
        else if (line.startsWith('QUIT')) sock.end('221 bye' + CRLF);
        else sock.write('250 OK' + CRLF);
      });
    });
    await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
    const port = (smtp.address() as AddressInfo).port;
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    const original = !!before.proxy?.allowPrivateTargets;
    try {
      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: false } } })).ok()).toBeTruthy();
      const blocked = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port } });
      expect(blocked.status()).toBe(400);
      expect((await blocked.json()).message).toMatch(/private|internal|blocked/i);
      expect(hits).toBe(0);

      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } })).ok()).toBeTruthy();
      // Wait out the 1s duplicate-check cooldown is unnecessary: the guard key includes the policy.
      const allowed = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port } });
      const body = await allowed.json();
      expect(allowed.status()).toBe(200);
      expect(body.message).toContain(`127.0.0.1:${port}`);
      expect(hits).toBeGreaterThan(0);
    } finally {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: original } } });
      smtp.close();
    }
  });
});
