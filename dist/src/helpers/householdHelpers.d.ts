import { Request, Response, NextFunction } from "express";
import { IUser } from "../models/user";
import mongoose from "mongoose";
/**
 * Helper middleware to populate household data for authenticated user
 */
export declare const populateUserHousehold: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Build query object for fetching household or user-specific data
 */
export declare const getDataQuery: (user: IUser, userField?: string) => Record<string, unknown>;
/**
 * Get household ID or user ID for creating new data
 */
export declare const getDataOwnership: (user: IUser) => {
    userId: mongoose.Types.ObjectId;
    household: mongoose.Types.ObjectId | null;
};
//# sourceMappingURL=householdHelpers.d.ts.map