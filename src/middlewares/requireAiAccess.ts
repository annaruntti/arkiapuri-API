import { Request, Response, NextFunction } from "express"
import type { IUser } from "../models/user"
import { getAiEntitlement } from "../services/ai/entitlement"
import { FEATURE_CREDIT_COST, getAiConfig } from "../services/ai/config"
import { isGlobalBudgetExceeded } from "../services/ai/aiUsage"
import type { AiEntitlement, AiFeature } from "../services/ai/types"

declare global {
  namespace Express {
    interface Request {
      aiEntitlement?: AiEntitlement
      aiFeature?: AiFeature
    }
  }
}

const DENY_MESSAGES: Record<string, string> = {
  upgrade_required:
    "AI-ominaisuudet kuuluvat maksulliseen sopimukseen. Päivitä tilaus käyttääksesi pentteriskannausta.",
  quota_exceeded:
    "Tämän kuun AI-kiintiö on käytetty. Kiintiö nollautuu seuraavan laskutuskauden alussa.",
  budget_exceeded:
    "AI-palvelu on tilapäisesti pois käytöstä. Yritä myöhemmin uudelleen.",
  household_too_large:
    "Perheessä on liikaa jäseniä tälle sopimukselle. Enintään 6 jäsentä voi jakaa AI-kiintiön.",
  not_configured: "AI-palvelua ei ole vielä otettu käyttöön.",
}

export const requireAiAccess =
  (feature: AiFeature) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "unauthorized access!" })
      return
    }

    const entitlement = await getAiEntitlement(req.user as IUser)
    if (!entitlement.hasAccess) {
      res.status(403).json({
        success: false,
        code: entitlement.denyCode,
        message: DENY_MESSAGES[entitlement.denyCode || "upgrade_required"],
        entitlement,
      })
      return
    }

    const cost = FEATURE_CREDIT_COST[feature]
    if (entitlement.remainingCredits < cost) {
      res.status(403).json({
        success: false,
        code: "quota_exceeded",
        message: DENY_MESSAGES.quota_exceeded,
        entitlement: {
          ...entitlement,
          remainingCredits: entitlement.remainingCredits,
        },
      })
      return
    }

    if (await isGlobalBudgetExceeded()) {
      res.status(503).json({
        success: false,
        code: "budget_exceeded",
        message: DENY_MESSAGES.budget_exceeded,
      })
      return
    }

    const config = getAiConfig()
    if (!config.apiKey) {
      res.status(503).json({
        success: false,
        code: "not_configured",
        message: DENY_MESSAGES.not_configured,
      })
      return
    }

    req.aiEntitlement = entitlement
    req.aiFeature = feature
    next()
  }
