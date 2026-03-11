const authService = require("./auth.service")
const { registerSchema, loginSchema } = require("./auth.validation")


const register = async (req, res, next) => {

  try {

    const data = registerSchema.parse(req.body)

    const user = await authService.registerUser(data)

    res.status(201).json({
      message: "User registered",
      user
    })

  } catch (err) {
    next(err)
  }

}


const login = async (req, res, next) => {

  try {

    const data = loginSchema.parse(req.body)

    const result = await authService.loginUser(data, req)

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict"
    })

    res.json({
      accessToken: result.accessToken,
      user: result.user
    })

  } catch (err) {
    next(err)
  }

}


const refreshToken = async (req, res, next) => {
  try {

    const refreshToken = req.cookies.refreshToken

    if (!refreshToken) {
      throw new Error("Refresh token missing")
    }

    const accessToken = await authService.refreshAccessToken(refreshToken)

    res.json({
      accessToken
    })

  } catch (err) {
    next(err)
  }
}


const logout = async (req, res, next) => {
  try {

    const refreshToken = req.cookies.refreshToken

    if (!refreshToken) {
      throw new Error("Refresh token missing")
    }

    await authService.logoutUser(refreshToken)

    res.clearCookie("refreshToken")

    res.json({
      message: "Logged out successfully"
    })

  } catch (err) {
    next(err)
  }
}

module.exports= {
    register, login, refreshToken, logout
}

