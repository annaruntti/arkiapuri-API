const { gql } = require("apollo-server-express")
const AuthorTypeDef = gql`
  type Author {
    id: ID
    name: String
    description: String
    email: String
    # authorImage: File
  }
  type Query {
    getAllAuthors: [Author]
    getSingleAuthor(id: ID): Author
  }
  input AuthorInput {
    name: String
    description: String
    email: String
    # authorImage: File
  }
  type Mutation {
    createAuthor(author: AuthorInput): Author
    updateAuthor(id: String, author: AuthorInput): Author
    deleteAuthor(id: String): String
  }
`

module.exports = AuthorTypeDef
