// FamilyMemberModal that defined for MongoDB FamilyMember Schema.
const FamilyMember = require("../models/FamilyMemberModal")

const FamilyMemberResolver = {
  Query: {
    getAllFamilyMembers: async (parent, args, context, info) => {
      return await FamilyMember.find().populate("author")
    },

    getSingleFamilyMember: async (parent, args, context, info) => {
      return await FamilyMember.findById(args.id).populate("author")
    },

    getFamilyMembersByAuthor: async (parent, args, context, info) => {
      let FamilyMembers = await FamilyMember.find({ author: args.id })
      return FamilyMembers
    },
  },

  Mutation: {
    createFamilyMember: async (parent, args, context, info) => {
      const FamilyMember = new FamilyMember(args.FamilyMember)

      await FamilyMember.save()

      return FamilyMember
    },

    updateFamilyMember: async (parent, args, context, info) => {
      const { id } = args

      const FamilyMember = await FamilyMember.findByIdAndUpdate(
        id,
        args.FamilyMember
      )

      return FamilyMember
    },

    deleteFamilyMember: async (parent, args, context, info) => {
      const { id } = args

      await FamilyMember.findByIdAndDelete(id)

      console.log("FamilyMember deleted successfully")

      return "FamilyMember deleted successfully"
    },

    deleteAllFamilyMembers: async (parent, args, context, info) => {
      await FamilyMember.deleteMany()

      return "FamilyMembers deleted successfully"
    },
  },
}

module.exports = FamilyMemberResolver
