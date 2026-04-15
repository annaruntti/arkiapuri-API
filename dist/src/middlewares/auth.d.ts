import { Request, Response, NextFunction } from "express";
import { IUser } from "../models/user";
declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}
export declare const isAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.d.ts.map