import mongoose, { Document } from "mongoose";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";
export interface IInvitation extends Document {
    email: string;
    household: mongoose.Types.ObjectId;
    invitedBy: mongoose.Types.ObjectId;
    invitationToken: string;
    status: InvitationStatus;
    createdAt: Date;
    expiresAt: Date;
    acceptedAt?: Date;
    acceptedBy?: mongoose.Types.ObjectId;
    updatedAt: Date;
    isValid(): boolean;
    markExpired(): Promise<IInvitation>;
}
declare const _default: mongoose.Model<IInvitation, {}, {}, {}, mongoose.Document<unknown, {}, IInvitation, {}, {}> & IInvitation & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=invitation.d.ts.map