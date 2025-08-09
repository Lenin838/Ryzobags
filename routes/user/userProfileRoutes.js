const express = require('express');
const userProfileRouter = express.Router();
const userProfileController = require('../../controllers/users/userProfileController');
const { isAuthenticated } = require('../../middlewares/auth');
const {otpLimiter,globalLimiter} = require('../../middlewares/rateLimiter');

userProfileRouter.get('/profile', isAuthenticated,globalLimiter, userProfileController.getProfile);
userProfileRouter.get('/profile/edit', isAuthenticated,globalLimiter, userProfileController.getEditProfile);
userProfileRouter.put('/profile/edit', isAuthenticated,globalLimiter, userProfileController.updateProfile);
userProfileRouter.put('/profile/upload-image', isAuthenticated,globalLimiter, userProfileController.uploadProfileImage);

userProfileRouter.post('/profile/change-email', isAuthenticated,globalLimiter, userProfileController.initiateEmailChange);
userProfileRouter.post('/profile/verify-email', isAuthenticated,globalLimiter, userProfileController.verifyEmailChange);
userProfileRouter.get('/profile/check-email-change-status', isAuthenticated, globalLimiter,userProfileController.checkEmailChangeStatus);

userProfileRouter.get('/change-password', isAuthenticated, globalLimiter,userProfileController.getChangePassword);
userProfileRouter.put('/change-password', isAuthenticated,globalLimiter, userProfileController.changePassword);
userProfileRouter.post('/request-password-change-otp',otpLimiter,isAuthenticated, userProfileController.requestPasswordChangeOtp);
userProfileRouter.put('/verify-otp-and-change-password', isAuthenticated,globalLimiter, userProfileController.verifyOtpAndChangePassword);

userProfileRouter.get('/profile/address/add', isAuthenticated,globalLimiter, userProfileController.getAddAddress);
userProfileRouter.post('/profile/address/add', isAuthenticated,globalLimiter, userProfileController.postAddAddress);
userProfileRouter.get('/profile/address/edit/:id', isAuthenticated,globalLimiter, userProfileController.getEditAddress);
userProfileRouter.put('/profile/address/edit/:id', isAuthenticated,globalLimiter, userProfileController.postEditAddress);
userProfileRouter.post('/profile/address/delete/:id', isAuthenticated,globalLimiter, userProfileController.deleteAddress);
userProfileRouter.put('/profile/address/set-default/:id', isAuthenticated,globalLimiter, userProfileController.setDefaultAddress);
userProfileRouter.get('/wallet-status', isAuthenticated,globalLimiter, userProfileController.getWalletStatus);
userProfileRouter.get('/referrals', isAuthenticated, globalLimiter,userProfileController.getReferrals);

module.exports = userProfileRouter;