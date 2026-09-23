const fs = require('fs');

// Patch collections.ts
let colCode = fs.readFileSync('c:/projects/reqspace/server/src/routes/collections.ts', 'utf8');

const sizeCheck = `
      if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > 5 * 1024 * 1024) {
        return res.status(400).json({ message: 'Request exceeds maximum allowed size of 5MB' });
      }
`;

colCode = colCode.replace(
  "async (req: AuthRequest, res: Response) => {\n      const count = await ApiRequest.countDocuments({",
  "async (req: AuthRequest, res: Response) => {" + sizeCheck + "\n      const count = await ApiRequest.countDocuments({"
);

colCode = colCode.replace(
  "checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {\n    const request = await ApiRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });",
  "checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {" + sizeCheck + "\n    const request = await ApiRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });"
);

fs.writeFileSync('c:/projects/reqspace/server/src/routes/collections.ts', colCode, 'utf8');
