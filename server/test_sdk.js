const { Collection } = require('postman-collection');
const fs = require('fs');

const json = {
  "info": {
    "name": "TESTS",
    "schema": "https://schema.getreqSpace.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "https://itay-office.tail8a006d.ts.net:8443/",
      "request": {
        "method": "GET",
        "url": {
          "raw": "https://itay-office.tail8a006d.ts.net:8443/",
          "protocol": "https",
          "host": [
            "itay-office",
            "tail8a006d",
            "ts",
            "net"
          ],
          "port": "8443",
          "path": []
        },
        "header": [
          {
            "key": "dsfsdfds6",
            "value": "{{test}}",
            "description": ""
          },
          {
            "key": "Authorization",
            "value": "Basic Z2ZoZ2Y6ZHNmc2Rm",
            "description": ""
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    }
  ]
};

const myCollection = new Collection(json);
const req = myCollection.items.members[0].request;

console.log('Method:', req.method);
console.log('URL String:', req.url.toString());
console.log('Headers:', req.headers.members.map(h => h.key + ': ' + h.value));
console.log('Body Mode:', req.body.mode);
console.log('Body Raw:', req.body.raw);
console.log('Body Options:', JSON.stringify(req.body.options));

