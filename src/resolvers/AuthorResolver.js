// AuthorModal that defined for MongoDB Author Schema.
const Author = require("../models/AuthorModal")

const AuthorResolver = {
  Query: {
    getAllAuthors: async (parent, args, context, info) => {
      return await Author.find().populate("author")
    },

    getSingleAuthor: async (parent, args, context, info) => {
      return await Author.findById(args.id).populate("author")
    },
  },

  Mutation: {
    createAuthor: async (parent, args, context, info) => {
      const Author = new Author(args.Author)

      await Author.save()

      return Author
    },

    updateAuthor: async (parent, args, context, info) => {
      const { id } = args

      const Author = await Author.findByIdAndUpdate(id, args.Author)

      return Author
    },

    deleteAuthor: async (parent, args, context, info) => {
      const { id } = args

      await Author.findByIdAndDelete(id)

      console.log("Author deleted successfully")

      return "Author deleted successfully"
    },
  },
}

module.exports = AuthorResolver
