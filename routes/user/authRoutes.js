const express = require('express');
const userController = require('../../controllers/users/authController');
const userRouter = express();
const passport = require("passport");
require("../../config/passport");
const userProductRouter = require('../../routes/user/productRoutes');
const { isAuthenticated, isNotAuthenticated } = require('../../middlewares/auth');
const {upload} = require('../../middlewares/uploads');
const profileRouter = require('../../routes/user/userProfileRoutes');
const orderRouter = require('../../routes/user/orderRoutes');
const {loginLimiter,otpLimiter} = require('../../middlewares/rateLimiter');

userRouter.use('/',orderRouter);
userRouter.use('/',profileRouter);
userRouter.use('/', userProductRouter);

userRouter.get("/google", 
  userController.initiateGoogleAuth,
  passport.authenticate("google", { scope: ["profile", "email"] })
);

userRouter.get("/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/user/google/failure"
  }),
  userController.googleCallback
);

userRouter.get("/google/failure",userController.googleAuthFailure);

userRouter.get('/signup', isNotAuthenticated, userController.loadRegister);
userRouter.post('/verify', loginLimiter,isNotAuthenticated, userController.verifyRegister);
userRouter.get("/enterOtp", isNotAuthenticated, userController.loadOtpPage);
userRouter.post("/verify-otp", otpLimiter,isNotAuthenticated, userController.verifyOtp);
userRouter.post("/resend-otp",otpLimiter,isNotAuthenticated, userController.resendOtp);

userRouter.get('/login', isNotAuthenticated, userController.loadLogin);
userRouter.post('/login',loginLimiter,isNotAuthenticated, userController.verifyLogin);

userRouter.get('/forgot-password', isNotAuthenticated, userController.loadForgotPassword);
userRouter.post('/forgot-password', isNotAuthenticated, userController.forgotPassword);
userRouter.get('/reset-password/:token', isNotAuthenticated, userController.loadResetPassword);
userRouter.put('/reset-password/:token', isNotAuthenticated, userController.resetPassword);

userRouter.get('/home', userController.loadHomepage);
userRouter.post('/logout', userController.loadLogout);

module.exports = userRouter;