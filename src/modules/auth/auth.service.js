const argon2 = require("argon2")
const jwt = require("jsonwebtoken")
const { v4: uuidv4 } = require("uuid")

const User = require("../../models/user.model")
const Session = require("../../models/session.model")


const registerUser = async ({ name, email, password }) => {

  const existingUser = await User.findOne({ email })

  if (existingUser) {
    throw new Error("User already exists")
  }

  const hashedPassword = await argon2.hash(password)

  const user = await User.create({
    name,
    email,
    password: hashedPassword
  })

  return user
}


const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  )
}

const generateRefreshToken = () => {
  return uuidv4()
}



const loginUser = async ({ email, password }, req) => {

  const user = await User.findOne({ email })

  if (!user) {
    throw new Error("Invalid credentials")
  }

  const isValid = await argon2.verify(user.password, password)

  if (!isValid) {
    throw new Error("Invalid credentials")
  }

  const accessToken = generateAccessToken(user)

  const refreshToken = generateRefreshToken()

  const session = await Session.create({
    user: user._id,
    refreshToken,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  })

  return {
    user,
    accessToken,
    refreshToken
  }
}


const refreshAccessToken = async (refreshToken) => {

  const session = await Session.findOne({ refreshToken })

  if (!session) {
    throw new Error("Invalid refresh token")
  }

  if (session.expiresAt < new Date()) {
    throw new Error("Session expired")
  }

  const user = await User.findById(session.user)

  const accessToken = generateAccessToken(user)

  return accessToken
}


const logoutUser = async (refreshToken) => {

  await Session.deleteOne({ refreshToken })

}


module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    generateAccessToken,
    refreshAccessToken,
    generateRefreshToken
}