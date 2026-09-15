import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { env } from "../config/env";

/**
 * SIMPLIFICATION FOR THIS PORTFOLIO PROJECT: admin routes are protected by
 * a single shared secret read from an environment variable, rather than
 * per-admin credentials with session/JWT-based auth and RBAC. Documented
 * here and in the README so it isn't mistaken for a production pattern.
 *
 * The comparison itself, however, IS done properly: `timingSafeEqual`
 * compares in constant time regardless of where the strings first differ,
 * which prevents an attacker from guessing the key one byte at a time by
 * measuring response-time differences (a real, if slow, attack against
 * naive `===`/`!==` string comparison of secrets).
 */
function isValidAdminKey(provided: string | undefined): boolean {
  if (!provided) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(env.adminApiKey);

  // timingSafeEqual throws if buffer lengths differ, so check that first —
  // this length check does leak key length via timing, but not any of its
  // content, which is the part actually worth protecting.
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isValidAdminKey(req.header("X-Admin-Key"))) {
    return res.status(403).json({
      error: "forbidden",
      message: "Missing or invalid admin credentials.",
    });
  }
  next();
}
