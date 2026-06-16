import type { NextFunction, Request, Response } from "express";

/**
 * Conservative security headers. We don't serve third-party content, so deny
 * framing, sniffing, and referrer leakage. (No external dep — keeps the image
 * lean; swap for helmet if the surface grows.)
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Tiny in-memory fixed-window rate limiter, keyed by client IP. Guards the API
 * (especially the LLM-backed routes) from runaway loops or abuse. Per-process
 * only — fine for a single Fly machine; move to Redis if we scale horizontally.
 */
export function rateLimit(
  opts: { windowMs?: number; max?: number } = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? Number(process.env.RATE_LIMIT_MAX ?? 120);
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - b.count)));
    if (b.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests — slow down." });
      return;
    }
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    next();
  };
}
