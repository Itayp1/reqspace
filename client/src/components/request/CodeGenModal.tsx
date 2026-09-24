import React, { useState, useMemo } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useRequestStore } from '../../store/requestStore';

interface CodeGenModalProps {
  onClose: () => void;
}

type Language = 'curl' | 'fetch' | 'axios' | 'python-requests' | 'python-httpx' | 'go' | 'csharp' | 'java' | 'ruby' | 'php' | 'swift' | 'dart';

import { resolveAllVariables } from '../../utils/variables';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'axios', label: 'JavaScript (axios)' },
  { id: 'python-requests', label: 'Python (requests)' },
  { id: 'python-httpx', label: 'Python (httpx)' },
  { id: 'go', label: 'Go' },
  { id: 'csharp', label: 'C# (HttpClient)' },
  { id: 'java', label: 'Java' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'swift', label: 'Swift' },
  { id: 'dart', label: 'Dart' },
];

function generateCode(language: Language, req: ReturnType<typeof useRequestStore.getState>['activeRequest']): string {
  if (!req) return '';

  const { method, collectionId } = req;
  const url = resolveAllVariables(req.url || '', collectionId);
  const enabledHeaders = (req.headers || [])
    .filter(h => h.enabled && h.key.trim())
    .map(h => ({ ...h, value: resolveAllVariables(h.value, collectionId) }));
  const hasBody = req.body?.mode === 'raw' && req.body.raw;
  const bodyStr = hasBody ? resolveAllVariables(req.body!.raw!, collectionId) : '';

  switch (language) {
    case 'curl': {
      const parts = [`curl -X ${method} '${url}'`];
      for (const h of enabledHeaders) parts.push(`  -H '${h.key}: ${h.value}'`);
      if (hasBody) parts.push(`  -d '${bodyStr.replace(/'/g, "\\'")}'`);
      return parts.join(' \\\n');
    }

    case 'fetch': {
      const headersObj = Object.fromEntries(enabledHeaders.map(h => [h.key, h.value]));
      const code = `const response = await fetch('${url}', {
  method: '${method}',
  headers: ${JSON.stringify(headersObj, null, 4).replace(/\n/g, '\n  ')},${hasBody ? `\n  body: JSON.stringify(${bodyStr}),` : ''}
});
const data = await response.json();
console.log(data);`;
      return code;
    }

    case 'axios': {
      const headersObj = Object.fromEntries(enabledHeaders.map(h => [h.key, h.value]));
      return `import axios from 'axios';

const response = await axios({
  method: '${method.toLowerCase()}',
  url: '${url}',
  headers: ${JSON.stringify(headersObj, null, 2).replace(/\n/g, '\n  ')},${hasBody ? `\n  data: ${bodyStr},` : ''}
});
console.log(response.data);`;
    }

    case 'python-requests': {
      const headersObj = Object.fromEntries(enabledHeaders.map(h => [h.key, h.value]));
      return `import requests

headers = ${JSON.stringify(headersObj, null, 4)}
${hasBody ? `payload = ${bodyStr}\n` : ''}
response = requests.${method.toLowerCase()}(
    '${url}',
    headers=headers,${hasBody ? '\n    json=payload,' : ''}
)
print(response.json())`;
    }

    case 'python-httpx': {
      const headersObj = Object.fromEntries(enabledHeaders.map(h => [h.key, h.value]));
      return `import httpx

with httpx.Client() as client:
    response = client.${method.toLowerCase()}(
        '${url}',
        headers=${JSON.stringify(headersObj, null, 8)},${hasBody ? `\n        json=${bodyStr},` : ''}
    )
    print(response.json())`;
    }

    case 'go': {
      return `package main

import (
    "fmt"
    "io"
    "net/http"
    "strings"
)

func main() {
    ${hasBody ? `body := strings.NewReader(\`${bodyStr}\`)
    req, _ := http.NewRequest("${method}", "${url}", body)` : `req, _ := http.NewRequest("${method}", "${url}", nil)`}
${enabledHeaders.map(h => `    req.Header.Set("${h.key}", "${h.value}")`).join('\n')}
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    data, _ := io.ReadAll(resp.Body)
    fmt.Println(string(data))
}`;
    }

    case 'csharp': {
      return `using System.Net.Http;
using System.Text;

var client = new HttpClient();
var request = new HttpRequestMessage(HttpMethod.${method[0] + method.slice(1).toLowerCase()}, "${url}");
${enabledHeaders.map(h => `request.Headers.Add("${h.key}", "${h.value}");`).join('\n')}
${hasBody ? `request.Content = new StringContent(@"${bodyStr}", Encoding.UTF8, "application/json");` : ''}
var response = await client.SendAsync(request);
var body = await response.Content.ReadAsStringAsync();
Console.WriteLine(body);`;
    }

    case 'java':
      return `var client = java.net.http.HttpClient.newHttpClient();\nvar request = java.net.http.HttpRequest.newBuilder()\n    .uri(java.net.URI.create("${url}"))\n    .method("${method}", ${hasBody ? `java.net.http.HttpRequest.BodyPublishers.ofString(${JSON.stringify(bodyStr)})` : 'java.net.http.HttpRequest.BodyPublishers.noBody()'})\n    .build();\nvar response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());`;
    case 'ruby':
      return `require 'net/http'\nuri = URI('${url}')\nhttp = Net::HTTP.new(uri.host, uri.port)\nrequest = Net::HTTP::${method[0] + method.slice(1).toLowerCase()}.new(uri)\n${enabledHeaders.map(h => `request['${h.key}'] = '${h.value}'`).join('\n')}\n${hasBody ? `request.body = ${JSON.stringify(bodyStr)}\n` : ''}response = http.request(request)\nputs response.body`;
    case 'php':
      return `<?php\n$ch = curl_init('${url}');\ncurl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method}');\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n${hasBody ? `curl_setopt($ch, CURLOPT_POSTFIELDS, ${JSON.stringify(bodyStr)});\n` : ''}echo curl_exec($ch);`;
    case 'swift':
      return `var request = URLRequest(url: URL(string: "${url}")!)\nrequest.httpMethod = "${method}"\n${hasBody ? `request.httpBody = Data(${JSON.stringify(bodyStr)}.utf8)\n` : ''}let (data, _) = try await URLSession.shared.data(for: request)\nprint(String(data: data, encoding: .utf8)!)`;
    case 'dart':
      return `import 'package:http/http.dart' as http;\n\nfinal response = await http.${method.toLowerCase()}(Uri.parse('${url}')${hasBody ? `, body: ${JSON.stringify(bodyStr)}` : ''});\nprint(response.body);`;
    default:
      return '';
  }
}

export const CodeGenModal: React.FC<CodeGenModalProps> = ({ onClose }) => {
  const { activeRequest } = useRequestStore();
  const [language, setLanguage] = useState<Language>('curl');
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => generateCode(language, activeRequest), [language, activeRequest]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard API can be denied (permissions, insecure context) — fail visibly instead of silently
      console.error('Failed to copy code to clipboard');
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">Generate Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>

        {/* Language Selector */}
        <div className="flex gap-1 p-3 border-b border-gray-800 overflow-x-auto flex-shrink-0">
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              onClick={() => setLanguage(lang.id)}
              className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors ${
                language === lang.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Code Block */}
        <div className="flex-1 overflow-y-auto relative">
          <pre className="p-4 text-xs text-gray-200 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CodeGenModal;
