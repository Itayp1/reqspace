const fs = require('fs');
const https = require('https');

async function downloadSchema() {
  const res = await fetch('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  return res.json();
}

function generatePostmanExport(collection, folders, requests) {
  const buildItems = (parentFolderId) => {
    const items = [];
    
    const subFolders = folders.filter(f => f.parentFolderId === parentFolderId);
    for (const folder of subFolders) {
      items.push({
        name: folder.name,
        item: buildItems(folder._id),
      });
    }
    
    const reqs = requests.filter(r => r.folderId === parentFolderId);
    for (const rawReq of reqs) {
      const req = rawReq;
      
      const header = (req.headers || []).filter(h => h.key).map(h => {
        const out = {
          key: h.key,
          value: h.value || '',
          description: h.description || '',
        };
        if (!h.enabled) out.disabled = true;
        return out;
      });

      let body = undefined;
      if (req.body && req.body.mode !== 'none') {
        body = { mode: req.body.mode };
        if (req.body.mode === 'raw') {
          body.raw = req.body.raw || '';
          body.options = { raw: { language: req.body.rawLanguage === 'json' ? 'json' : 'text' } };
        } else if (req.body.mode === 'urlencoded') {
          body.urlencoded = (req.body.urlencoded || []).filter(i => i.key).map(i => {
            const out = { key: i.key, value: i.value || '' };
            if (!i.enabled) out.disabled = true;
            return out;
          });
        } else if (req.body.mode === 'form-data') {
          body.formdata = (req.body.formData || []).filter(i => i.key).map(i => {
            const out = { key: i.key, value: i.value || '', type: i.type || 'text' };
            if (!i.enabled) out.disabled = true;
            return out;
          });
        }
      }
      
      let urlObj = req.url || '';
      if ((req.params && req.params.length > 0) || req.url) {
        urlObj = { raw: req.url || '' };
        try {
          const parsed = new URL(req.url || 'http://localhost');
          urlObj.protocol = parsed.protocol.replace(':', '');
          urlObj.host = parsed.hostname.split('.');
          if (parsed.port) urlObj.port = parsed.port;
          urlObj.path = parsed.pathname.split('/').filter(x => x);
        } catch (e) {
          // keep raw only
        }
        if (req.params && req.params.length > 0) {
          urlObj.query = req.params.filter(p => p.key).map(p => {
            const out = {
              key: p.key,
              value: p.value || '',
              description: p.description || ''
            };
            if (!p.enabled) out.disabled = true;
            return out;
          });
        }
      }

      const item = {
        name: req.name,
        request: {
          method: req.method || 'GET',
          url: urlObj,
          header,
          body,
        },
      };

      if (body && ['GET', 'HEAD', 'OPTIONS'].includes(req.method?.toUpperCase())) {
        item.protocolProfileBehavior = { disableBodyPruning: true };
      }

      items.push(item);
    }
    return items;
  };

  return {
    info: { 
      name: collection.name, 
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' 
    },
    item: buildItems(null),
  };
}

const mockCollection = { _id: "c1", name: "Test Collection" };
const mockFolders = [
  { _id: "f1", name: "Folder 1", parentFolderId: null, collectionId: "c1" }
];
const mockRequests = [
  {
    _id: "r1",
    name: "Request 1",
    folderId: "f1",
    collectionId: "c1",
    method: "POST",
    url: "https://api.example.com:8443/api/v1/users?test=1",
    headers: [
      { key: "Content-Type", value: "application/json", enabled: true }
    ],
    params: [
      { key: "test", value: "1", enabled: true }
    ],
    body: {
      mode: "raw",
      raw: "{\"key\": \"val\"}",
      rawLanguage: "json"
    }
  },
  {
    _id: "r2",
    name: "Request 2",
    folderId: null,
    collectionId: "c1",
    method: "GET",
    url: "https://itay-office.tail8a006d.ts.net:8443/",
    headers: [
      { key: "Authorization", value: "Basic 123", enabled: true },
      { key: "disabled-header", value: "123", enabled: false }
    ],
    params: [],
    body: { mode: "none" }
  }
];

async function main() {
  console.log('Downloading schema...');
  const schema = await downloadSchema();
  console.log('Schema downloaded.');

  const generatedJson = generatePostmanExport(mockCollection, mockFolders, mockRequests);
  
  fs.writeFileSync('test_export.json', JSON.stringify(generatedJson, null, 2));
  console.log('Exported JSON to test_export.json');
  
  const Ajv = require('ajv');
  const ajv = new Ajv({ schemaId: 'auto' });
  ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));
  
  const validate = ajv.compile(schema);
  const valid = validate(generatedJson);
  
  if (!valid) {
    console.log('Validation failed!');
    console.log(JSON.stringify(validate.errors, null, 2));
  } else {
    console.log('Validation SUCCESS! The exported JSON is 100% compliant with Postman v2.1.0 schema.');
  }
}

main().catch(console.error);
