import mongoose, { Document } from "mongoose";
export interface IUsage extends Document {
    userId: mongoose.Types.ObjectId;
    month: number;
    year: number;
    requests: number;
    lastRequest: Date;
}
declare const _default: mongoose.Model<IUsage, {}, {}, {}, mongoose.Document<unknown, {}, IUsage, {}, {}> & IUsage & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=Usage.d.ts.map