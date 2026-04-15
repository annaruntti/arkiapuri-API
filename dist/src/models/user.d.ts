import mongoose, { Document, Model } from "mongoose";
export interface IUser extends Document {
    username?: string;
    name?: string;
    email: string;
    password?: string;
    avatar?: string;
    profilePicture?: string;
    googleId?: string;
    facebookId?: string;
    appleId?: string;
    isEmailVerified: boolean;
    foodItems: mongoose.Types.ObjectId[];
    meals: mongoose.Types.ObjectId[];
    profileImage?: {
        url?: string;
        publicId?: string;
    };
    resetPasswordToken?: string;
    resetPasswordExpiry?: Date;
    household?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
    comparePassword(password: string): Promise<boolean>;
}
export interface IUserModel extends Model<IUser> {
    isThisEmailInUse(email: string): Promise<boolean>;
}
declare const _default: IUserModel;
export default _default;
//# sourceMappingURL=user.d.ts.map