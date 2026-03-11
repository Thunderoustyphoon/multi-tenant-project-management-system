const mongoose = require("mongoose")

const projectSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: ""
  },

  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

},
{ timestamps: true }
)

module.exports = mongoose.model("Project", projectSchema)