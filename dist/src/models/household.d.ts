import mongoose, { Document } from "mongoose";
export type HouseholdRole = "owner" | "admin" | "member";
export interface IHouseholdMember {
    userId: mongoose.Types.ObjectId;
    role: HouseholdRole;
    joinedAt: Date;
}
export interface IHouseholdSettings {
    allowMemberInvites: boolean;
    sharedData: {
        meals: boolean;
        shoppingLists: boolean;
        pantry: boolean;
        schedules: boolean;
    };
}
export interface IHousehold extends Document {
    name: string;
    owner: mongoose.Types.ObjectId;
    members: IHouseholdMember[];
    settings: IHouseholdSettings;
    createdAt: Date;
    updatedAt: Date;
    isMember(userId: mongoose.Types.ObjectId | string): boolean;
    getUserRole(userId: mongoose.Types.ObjectId | string): HouseholdRole | null;
    canInvite(userId: mongoose.Types.ObjectId | string): boolean;
}
declare const _default: mongoose.Model<IHousehold, {}, {}, {}, mongoose.Document<unknown, {}, IHousehold, {}, {}> & IHousehold & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=household.d.ts.map