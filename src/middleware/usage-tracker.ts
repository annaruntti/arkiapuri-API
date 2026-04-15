import { Request, Response, NextFunction } from "express"

// Placeholder – full UsageTracker implementation pending
const UsageTracker = {
  async trackRequest(userId: string): Promise<boolean> {
    try {
      // TODO: Integrate Usage model
      return true // Fail open
    } catch (error) {
      console.error("Usage tracking error:", error)
      return true
    }
  },
}

export default UsageTracker
