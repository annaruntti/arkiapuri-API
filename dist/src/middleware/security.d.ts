declare const securityMiddleware: {
    rateLimiter: import("express-rate-limit").RateLimitRequestHandler;
    helmet: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: (err?: unknown) => void) => void;
};
export declare const rateLimiter: import("express-rate-limit").RateLimitRequestHandler;
export default securityMiddleware;
//# sourceMappingURL=security.d.ts.map