const { gql } = require("apollo-server-express")
const FamilyMemberTypeDef = gql`
  # Author
  type Author {
    id: ID
    authorName: String
    description: String
    email: String
  }
  # FamilyMember
  type FamilyMember {
    id: ID
    name: String
    description: String
    age: Int
    # profileImage: File
  }
  type Query {
    getAllFamilyMembers: [FamilyMember]
    getFamilyMembersByAuthor(id: ID): [FamilyMember]
    getSingleFamilyMember(id: ID): FamilyMember
  }
  input FamilyMemberInput {
    name: String
    description: String
    # profileImage: File
  }
  type Mutation {
    createFamilyMember(FamilyMember: FamilyMemberInput): FamilyMember
    updateFamilyMember(
      id: String
      FamilyMember: FamilyMemberInput
    ): FamilyMember
    deleteFamilyMember(id: String): String
    deleteAllFamilyMembers: String
  }
`

module.exports = FamilyMemberTypeDef
