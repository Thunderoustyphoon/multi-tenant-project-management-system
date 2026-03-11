const mongoose = require("mongoose")

const fileSchema = new mongoose.Schema(
{
  filename: String,

  url: String,

  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace"
  }

},
{ timestamps: true }
)

module.exports = mongoose.model("File", fileSchema)