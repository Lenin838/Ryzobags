// routes/userRoutes.js

const express = require("express");
const profileRouter = express.Router();
const userProfileController = require("../../controllers/users/userProfileController");
const { isAuthenticated, isNotAuthenticated } = require('../../middlewares/auth');
const {upload,saveUserImage} = require('../../middlewares/uploads');

// Profile & Edit
profileRouter.get("/profile", isAuthenticated, userProfileController.getProfile);
profileRouter.get("/profile/edit", isAuthenticated, userProfileController.getEditProfile);
profileRouter.post("/profile/edit", isAuthenticated, userProfileController.postEditProfile);

// Email verification
profileRouter.post("/email/request-verification", isAuthenticated, userProfileController.requestEmailVerification);
profileRouter.post("/email/verify", isAuthenticated, userProfileController.verifyEmailUpdate);

// Password change
profileRouter.get("/profile/change-password", isAuthenticated, userProfileController.getChangePassword);
profileRouter.post("/profile/change-password", isAuthenticated, userProfileController.postChangePassword);

// Orders
profileRouter.get("/orders", isAuthenticated, userProfileController.getUserOrders);
profileRouter.post("/orders/:id/cancel", isAuthenticated, userProfileController.cancelOrder);

// Forgot Password
profileRouter.get("/forgot-password", userProfileController.getForgotPassword);
profileRouter.post("/forgot-password", userProfileController.postForgotPassword);
profileRouter.get("/reset-password/:token", userProfileController.getResetPassword);
profileRouter.post("/reset-password/:token", userProfileController.postResetPassword);
profileRouter.post('/profile/upload-image', isAuthenticated, upload.single('profileImage'), userProfileController.uploadProfileImage);
profileRouter.post('/profile/image',isAuthenticated, userProfileController.uploadCroppedImage);


module.exports = profileRouter;
