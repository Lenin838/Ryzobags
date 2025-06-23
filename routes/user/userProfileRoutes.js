const express = require('express');
const userProfileRouter = express.Router();
const userProfileController = require('../../controllers/users/userProfileController');
const { isAuthenticated } = require('../../middlewares/auth');

// Profile routes
userProfileRouter.get('/profile', isAuthenticated, userProfileController.getProfile);
userProfileRouter.get('/profile/edit', isAuthenticated, userProfileController.getEditProfile);
userProfileRouter.post('/profile/edit', isAuthenticated, userProfileController.updateProfile);
userProfileRouter.post('/profile/upload-image', isAuthenticated, userProfileController.uploadProfileImage);

// Email change routes
userProfileRouter.post('/profile/change-email', isAuthenticated, userProfileController.initiateEmailChange);
userProfileRouter.post('/profile/verify-email', isAuthenticated, userProfileController.verifyEmailChange);
userProfileRouter.get('/profile/check-email-change-status', isAuthenticated, userProfileController.checkEmailChangeStatus);

// Password change routes
userProfileRouter.get('/change-password', isAuthenticated, userProfileController.getChangePassword);
userProfileRouter.post('/change-password', isAuthenticated, userProfileController.changePassword);
userProfileRouter.post('/request-password-change-otp', isAuthenticated, userProfileController.requestPasswordChangeOtp);
userProfileRouter.post('/verify-otp-and-change-password', isAuthenticated, userProfileController.verifyOtpAndChangePassword);

// Address routes
userProfileRouter.get('/profile/address/add', isAuthenticated, userProfileController.getAddAddress);
userProfileRouter.post('/profile/address/add', isAuthenticated, userProfileController.postAddAddress);
userProfileRouter.get('/profile/address/edit/:index', isAuthenticated, userProfileController.getEditAddress);
userProfileRouter.post('/profile/address/edit/:index', isAuthenticated, userProfileController.postEditAddress);
userProfileRouter.post('/profile/address/delete/:index', isAuthenticated, userProfileController.deleteAddress);
userProfileRouter.post('/profile/address/set-default/:index', isAuthenticated, userProfileController.setDefaultAddress);

// Wallet and referral routes
userProfileRouter.get('/wallet-status', isAuthenticated, userProfileController.getWalletStatus);
userProfileRouter.get('/wallet-history', isAuthenticated, userProfileController.getWalletHistory);
userProfileRouter.get('/referrals', isAuthenticated, userProfileController.getReferrals);

// Logout route
userProfileRouter.get('/logout', userProfileController.logout);

module.exports = userProfileRouter;