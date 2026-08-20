import mongoose from "mongoose"
import type { Model } from "mongoose"
import type { IHousehold } from "../../models/household"
import type { IUser } from "../../models/user"
import { resolveModule } from "../../helpers/controllerUtils"
import { resolveHouseholdId } from "../../helpers/householdHelpers"
import { getAiConfig, currentUsagePeriod } from "./config"
import { AiUsage } from "../../models/aiUsage"
import type { AiEntitlement, AiPlan } from "./types"

const Household = resolveModule<Model<IHousehold>>(
  require("../../models/household")
)

const asPlan = (value: unknown): AiPlan =>
  value === "premium" ? "premium" : "free"

const populatedHousehold = (user: IUser): IHousehold | null => {
  const household = user.household as unknown
  if (household && typeof household === "object" && "members" in household) {
    return household as IHousehold
  }
  return null
}

export const getAiEntitlement = async (user: IUser): Promise<AiEntitlement> => {
  const config = getAiConfig()
  const householdId = resolveHouseholdId(user)
  const household =
    populatedHousehold(user) ||
    (householdId ? await Household.findById(householdId) : null)

  const ownerType = household ? "household" : "user"
  const ownerId = household
    ? String(household._id)
    : String(user._id)
  const memberCount = household?.members?.length || 1
  const storedPlan = asPlan(household ? (household as IHousehold & { plan?: AiPlan }).plan : (user as IUser & { plan?: AiPlan }).plan)
  const plan: AiPlan = config.grantPremium ? "premium" : storedPlan

  const usage = await AiUsage.findOne({
    ownerType,
    ownerId: new mongoose.Types.ObjectId(ownerId),
    period: currentUsagePeriod(),
  })
  const creditsUsed = usage?.creditsUsed || 0
  const remainingCredits = Math.max(0, config.monthlyCreditLimit - creditsUsed)

  const base: AiEntitlement = {
    hasAccess: true,
    plan,
    ownerType,
    ownerId,
    creditLimit: config.monthlyCreditLimit,
    creditsUsed,
    remainingCredits,
    memberCount,
  }

  if (!config.apiKey) {
    return { ...base, hasAccess: false, denyCode: "not_configured" }
  }

  if (plan !== "premium") {
    return { ...base, hasAccess: false, denyCode: "upgrade_required" }
  }

  if (
    household &&
    memberCount > config.householdMemberLimit &&
    !config.grantPremium
  ) {
    return { ...base, hasAccess: false, denyCode: "household_too_large" }
  }

  return base
}
