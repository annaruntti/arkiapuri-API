const Pantry = require("../models/pantry")

exports.getPantry = async (req, res) => {
  try {
    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({ userId: req.user._id, items: [] })
      await pantry.save()
    }
    res.json({ success: true, pantry })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.addPantryItem = async (req, res) => {
  try {
    const { foodId, name, quantity, unit, expirationDate } = req.body

    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({ userId: req.user._id, items: [] })
    }

    pantry.items.push({
      foodId,
      name,
      quantity,
      unit,
      expirationDate,
    })

    await pantry.save()
    res.json({ success: true, pantry })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.updatePantryItem = async (req, res) => {
  try {
    const { itemId } = req.params
    const update = req.body

    const pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      return res.status(404).json({
        success: false,
        message: "Pantry not found",
      })
    }

    const item = pantry.items.id(itemId)
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in pantry",
      })
    }

    Object.assign(item, update)
    await pantry.save()

    res.json({ success: true, pantry })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.removePantryItem = async (req, res) => {
  try {
    const { itemId } = req.params

    const pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      return res.status(404).json({
        success: false,
        message: "Pantry not found",
      })
    }

    pantry.items.pull(itemId)
    await pantry.save()

    res.json({ success: true, message: "Item removed from pantry" })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}
