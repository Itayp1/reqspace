const fs = require('fs');
let s = fs.readFileSync('server/src/routes/auth.ts', 'utf8');

const additionalRoutes = 
// ?? PUT /api/auth/settings ???????????????????????????????????????????
router.put('/settings', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  try {
    const updatedUser = await UserRepository.update(user._id || user.id, { settings: { ...user.settings, ...req.body } } as any);
    return res.json(updatedUser.settings);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ?? POST /api/auth/certificates ??????????????????????????????????????
router.post('/certificates', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { hostname, cert, key, passphrase } = req.body;
  if (!hostname || !cert || !key) return res.status(400).json({ message: 'hostname, cert, and key are required' });
  
  try {
    const newCert = {
      _id: new mongoose.Types.ObjectId(),
      hostname,
      cert,
      key,
      passphrase,
      createdAt: new Date()
    };
    const updatedCerts = [...(user.clientCertificates || []), newCert];
    const updatedUser = await UserRepository.update(user._id || user.id, { clientCertificates: updatedCerts } as any);
    return res.status(201).json(updatedUser.clientCertificates);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ?? DELETE /api/auth/certificates/:id ????????????????????????????????
router.delete('/certificates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  try {
    const updatedCerts = (user.clientCertificates || []).filter((c) => String(c._id) !== req.params.id);
    const updatedUser = await UserRepository.update(user._id || user.id, { clientCertificates: updatedCerts } as any);
    return res.json(updatedUser.clientCertificates);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});
;

s = s.replace('export default router;', additionalRoutes + '\n\nexport default router;');
fs.writeFileSync('server/src/routes/auth.ts', s);
