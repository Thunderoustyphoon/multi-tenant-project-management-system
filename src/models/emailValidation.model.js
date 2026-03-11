const mongoose = require("mongoose")

const emailVerificationSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  token: {
    type: String,
    required: true
  },

  expiresAt: {
    type: Date,
    required: true
  }

},
{ timestamps: true }
)

module.exports = mongoose.model("EmailVerification", emailVerificationSchema)