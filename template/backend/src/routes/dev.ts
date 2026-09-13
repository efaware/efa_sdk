import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

/**
 * Dev-only routes. Registered in index.ts only when ENVIRONMENT !== 'production'.
 * The Dockerfile sets ENVIRONMENT=production, so these are never active in deployed containers.
 */
const router = Router();

router.get('/token', (req: Request, res: Response) => {
  // Double-guard in case someone registers this router incorrectly
  if (process.env.ENVIRONMENT === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const privateKey = process.env.JWT_PRIVATE_KEY;
  if (!privateKey) {
    res.status(500).json({ error: 'JWT_PRIVATE_KEY not set – generate with scripts/generate-jwt-keys.sh' });
    return;
  }

  // Mock JWT matching the Converge JwtPayload shape (RS256, identity only).
  // Permissions are NOT in the JWT — they come from converge_access live per request.
  // In single-app local dev without the Converge stack, converge_access is unreachable,
  // so permission-guarded routes will respond 503. Start the full stack or set
  // CONVERGE_GATEWAY_URL/REGISTRY_API_KEY to point at a running converge_access.
  const token = jwt.sign(
    {
      sub: 'dev-user-001',
      name: 'dev',
      email: 'dev@local',
      tenant: 'default',
    },
    Buffer.from(privateKey, 'base64').toString('utf8'),
    // iss/aud müssen zum gehärteten Exchange-Verifier passen (Finding #9), sonst
    // scheitert der lokale /dev/token-Login. jti: ab @efa-one/sdk 1.17 lehnt der
    // Exchange Tokens ohne jti ab (Bindung an die Kernel-Sitzung, efa-Task #137).
    // Geschützte Routen fragen den Sitzungsstatus dann live beim Kernel ab und
    // antworten ohne laufenden Stack mit 503.
    { algorithm: 'RS256', expiresIn: '8h', issuer: 'converge', audience: 'converge', jwtid: randomUUID() },
  );

  res.json({ token });
});

export default router;
