const express = require('express');
const userController = require('../../controllers/users/authController');
const userRouter = express();
const passport = require("passport");
require("../../config/passport");
const userProductRouter = require('../../routes/user/productRoutes');
const { isAuthenticated, isNotAuthenticated } = require('../../middlewares/auth');
const {upload} = require('../../middlewares/uploads');
const profileRouter = require('../../routes/user/userProfileRoutes');

userRouter.use('/',profileRouter);
userRouter.use('/', userProductRouter);

// Google Auth Routes
userRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

userRouter.get("/google/callback",
    passport.authenticate("google", {
        failureRedirect: "/auth/login"
    }),
    (req, res) => {
        req.session.user = req.user;
        res.redirect("/user/home");
    }
);

// Auth and Registration Routes
userRouter.get('/signup', isNotAuthenticated, userController.loadRegister);
userRouter.post('/verify', isNotAuthenticated, userController.verifyRegister);
userRouter.get("/enterOtp", isNotAuthenticated, userController.loadOtpPage);
userRouter.post("/verify-otp", isNotAuthenticated, userController.verifyOtp);
userRouter.post("/resend-otp", isNotAuthenticated, userController.resendOtp);

userRouter.get('/login', isNotAuthenticated, userController.loadLogin);
userRouter.post('/login', isNotAuthenticated, userController.verifyLogin);

// Forgot and Reset Password
userRouter.get('/forgot-password', isNotAuthenticated, userController.loadForgotPassword);
userRouter.post('/forgot-password', isNotAuthenticated, userController.forgotPassword);
userRouter.get('/reset-password/:token', isNotAuthenticated, userController.loadResetPassword);
userRouter.post('/reset-password/:token', isNotAuthenticated, userController.resetPassword);

userRouter.get('/home', isAuthenticated, userController.loadHomepage);
userRouter.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect('/user/login');
    });
});

module.exports = userRouter;