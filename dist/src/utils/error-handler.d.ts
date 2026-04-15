import { Request, Response, NextFunction } from "express";
interface AppError extends Error {
    status?: number;
}
declare const errorHandler: (err: AppError, req: Request, res: Response, next: NextFunction) => void;
export default errorHandler;
//# sourceMappingURL=error-handler.d.ts.map