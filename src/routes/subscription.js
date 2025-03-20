const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

router.post("/subscribe", async (req, res) => {
  const { tier, paymentMethodId } = req.body

  try {
    const subscription = await stripe.subscriptions.create({
      customer: req.user.stripeCustomerId,
      items: [{ price: TIER_PRICE_IDS[tier] }],
      payment_method: paymentMethodId,
    })

    // Update user tier
    await User.findByIdAndUpdate(req.user.id, { tier })

    res.json({ success: true, subscription })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})
