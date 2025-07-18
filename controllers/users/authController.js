const User = require('../../models/User');
const Product=require("../../models/product")
const Brand=require("../../models/brand")
const Category=require("../../models/category")
const sendOtpEmail = require('./otpService');
const otpGenerator = require('otp-generator');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Order = require('../../models/order');
const {upload, saveUserImage} = require('../../middlewares/uploads');
const Coupon = require('../../models/coupon');


const generateReferralCode = async () => {
    let referralCode;
    let isUnique = false;
    while(!isUnique){
        referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const existingUser = await User.findOne({referralCode});
        if(!existingUser){
            isUnique = true;
        }
    }
    return referralCode;
}

const generateCouponCode = async () => {
    let couponCode;
    let isUnique = false;
    while(!isUnique){
        couponCode = `RYZO${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const existingCoupon = await Coupon.findOne({code: couponCode});
        if(!existingCoupon){
            isUnique = true;
        }
    }
    return couponCode;
}

const createReferralCoupon = async (userId) => {
    try{
        const couponCode = await generateCouponCode();
        const expiresAt = new Date(Date.now()+30*24*60*60*1000);
        const coupon = new Coupon({
            code: couponCode,
            discountAmount: 100,
            minCartAmount: 500,
            maxDiscount: 200,
            expiresAt,
            usageLimit:1,
            isActive:true,
            userId: [userId],
        });
        const savedCoupon = await coupon.save();
        console.log(`Coupon created for user ${userId}: ${savedCoupon.code}`);
        return savedCoupon;
    }catch (error){
        console.error(`Error creating coupon for user ${userId}:`, error);
        throw error;
    }
}



const generateOtpCode=()=>Math.floor(100000 +Math.random() * 900000).toString();

const userController = {
    loadRegister: async (req, res) => {
        try {
            res.render('user/signup');
        } catch (error) {
            console.error('Load register error:', error.message);
            res.status(500).send('Server Error');
        }
    },

    verifyRegister: async (req, res) => {
        try {
            const { fullname, email, phone, password, confirmPassword ,referralCode} = req.body;
            console.log("body:.....",req.body)
            let errors = {};

            if (!fullname || fullname.trim() === "") {
                errors.fullname = "Full Name is required.";
            } else if (!/^[A-Za-z\s]+$/.test(fullname)) {
                errors.fullname = "Name must contain only alphabets and spaces.";
            } else if (fullname.length < 3) {
                errors.fullname = "Name must be at least 3 characters.";
            }

            if (!email || email.trim() === "") {
                errors.email = "Email is required.";
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errors.email = "Invalid email format.";
            }

            if (!phone || phone.trim() === "") {
                errors.phone = "Phone number is required.";
            } else if (!/^\d{10}$/.test(phone)) {
                errors.phone = "Phone number must be exactly 10 digits.";
            }

            if (!password || password.trim() === "") {
                errors.password = "Password is required.";
            } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password)) {
                errors.password = "Password must be at least 8 characters long with an uppercase, lowercase, number, and special character.";
            }

            if (!confirmPassword || confirmPassword.trim() === "") {
                errors.confirmPassword = "Confirm Password is required.";
            } else if (confirmPassword !== password) {
                errors.confirmPassword = "Passwords do not match.";
            }

            let referrer = null;
            if(referralCode && referralCode.trim()!==""){
                referrer = await User.findOne({referralCode: referralCode.toUpperCase()});
                if(!referrer){
                    errors.referralCode = "Invalid referral code.";
                }
            }
            console.log("1",referrer)

            if (Object.keys(errors).length > 0) {
                return res.status(400).json({ errors });
            }
            console.log(errors)

            try {
                const existingUser = await User.findOne({ email });
                console.log("existing",existingUser)
                if (existingUser) {
                    return res.status(400).json({ 
                        message: "User already exists. Please log in." 
                    });
                }
            } catch (dbError) {
                console.error('Database error checking existing user:', dbError);
                return res.status(500).json({ 
                    message: "Database error. Please try again." 
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newReferralCode = await generateReferralCode();
            console.log("hashedPassword","newReferralCode",newReferralCode,hashedPassword)
            req.session.fullname = fullname;
            req.session.email = email;
            req.session.phone = phone;
            req.session.password = hashedPassword;
            req.session.referralCode = referralCode?.toUpperCase() || null;
            req.session.newReferralCode = newReferralCode;

            const otpCode = generateOtpCode();
            console.log("2",otpCode)
            req.session.otp = otpCode;
            req.session.otpExpire = Date.now() + 1 * 60 * 1000;

            console.log("Generated OTP:", otpCode);
            console.log("Session Data:", {
                fullname: req.session.fullname,
                email: req.session.email,
                phone: req.session.phone,
                otpExpire: new Date(req.session.otpExpire),
                referralCode : req.session.referralCode,
                newReferralCode: req.session.newReferralCode,
                
            });

            try {
                await sendOtpEmail(email, otpCode);
                console.log("OTP email sent successfully");
            } catch (emailError) {
                console.error('Email sending error:', emailError);
                return res.status(500).json({ 
                    message: "Failed to send OTP email. Please try again." 
                });
            }

            return res.status(200).json({ 
                message: "Signup successful! OTP sent to your email.", 
                redirecturl: '/user/enterOtp' 
            });

            } catch (error) {
                console.error('Verify register error:', error.message);
                res.status(500).json({ message: "Server error: " + error.message });
            }
    },

    loadOtpPage: async (req, res) => {
            try {
                if (!req.session.email) {
                    return res.redirect('/user/signup');
                }
                res.render("user/otp");
            } catch (error) {
                console.log('Load OTP page error:', error.message);
                res.status(500).send('Server Error');
            }
    },

    verifyOtp: async (req, res) => {
        try {
            console.log("=== OTP VERIFICATION DEBUG ===");
            console.log("Stored OTP:", req.session.otp);
            console.log("Stored Email:", req.session.email);
            console.log("Stored Expiry:", req.session.otpExpire, "Current Time:", Date.now());
            console.log("Session fullname:", req.session.fullname);
            console.log("Session phone:", req.session.phone);
            console.log("Session referralCode:", req.session.referralCode);
            console.log("Session newReferralCode:", req.session.newReferralCode);

            const { otp } = req.body;

            if (!req.session.otp || !req.session.email || !req.session.fullname || !req.session.password) {
            console.log("Missing session data");
            return res.status(400).json({
                message: "Session expired. Please restart the signup process.",
                success: false,
            });
            }

            if (Date.now() > req.session.otpExpire) {
            console.log("OTP expired");
            return res.status(400).json({
                message: "OTP has expired. Please request a new one.",
                success: false,
            });
            }

            if (otp !== req.session.otp) {
            console.log("Invalid OTP provided");
            return res.status(400).json({
                message: "Invalid OTP. Please try again.",
                success: false,
            });
            }

            const userData = {
            fullname: req.session.fullname,
            email: req.session.email,
            phoneNumber: req.session.phone,
            password: req.session.password,
            referralCode: req.session.newReferralCode,
            referredBy: req.session.referralCode
                ? (await User.findOne({ referralCode: req.session.referralCode }).select('_id'))?._id
                : null,
            isVerified: true,
            };

            console.log("Creating user with data:", userData);

            try {
            const user = new User(userData);
            const savedUser = await user.save();
            console.log("User saved successfully:", savedUser._id);

            if (req.session.referralCode) {
                const referrer = await User.findOne({ referralCode: req.session.referralCode });
                console.log("Referrer found:", referrer ? referrer._id : "No referrer found");

                if (referrer && referrer.canGiveReferralRewards) {
                try {
                    const refereeCoupon = await createReferralCoupon(savedUser._id);
                    console.log(`Coupon generated for referee: ${savedUser._id}, Coupon code: ${refereeCoupon.code}`);

                    const referrerCoupon = await createReferralCoupon(referrer._id);
                    console.log(`Coupon generated for referrer: ${referrer._id}, Coupon code: ${referrerCoupon.code}`);
                } catch (couponError) {
                    console.error("Coupon creation failed:", couponError);
                }
                } else if (referrer) {
                console.log(`Referrer ${referrer._id} is not eligible to give referral rewards`);
                } else {
                console.log(`No referrer found for referralCode: ${req.session.referralCode}`);
                }
            }

            req.session.otp = null;
            req.session.email = null;
            req.session.fullname = null;
            req.session.phone = null;
            req.session.password = null;
            req.session.otpExpire = null;
            req.session.referralCode = null;
            req.session.newReferralCode = null;

            res.status(200).json({
                message: "Email verified. Signup successful!",
                success: true,
            });
            } catch (saveError) {
            console.error("Database save error:", saveError);
            if (saveError.code === 11000) {
                const field = Object.keys(saveError.keyPattern)[0];
                return res.status(400).json({
                message: `${field} already exists. Please use a different ${field}.`,
                success: false,
                });
            }
            if (saveError.name === 'ValidationError') {
                const validationErrors = Object.values(saveError.errors).map((err) => err.message);
                return res.status(400).json({
                message: "Validation error: " + validationErrors.join(', '),
                success: false,
                });
            }
            return res.status(500).json({
                message: "Failed to create user account. Please try again.",
                success: false,
            });
            }
        } catch (error) {
            console.error('Verify OTP error:', error.message);
            res.status(500).json({
            message: "Server error: " + error.message,
            success: false,
            });
        }
    },

    resendOtp: async (req, res) => {
            try {
                console.log("Resend OTP requested. Session email:", req.session.email);

                if (!req.session.email) {
                    return res.status(400).json({ 
                        message: "Session expired. Please restart the signup process.",
                        success: false 
                    });
                }

                const newOtp = generateOtpCode(); 
                req.session.otp = newOtp;
                req.session.otpExpire = Date.now() + 5 * 60 * 1000; 

                console.log("New OTP generated:", newOtp);

                try {
                    await sendOtpEmail(req.session.email, newOtp);
                    console.log("New OTP sent to:", req.session.email);

                    return res.status(200).json({ 
                        message: "A new OTP has been sent to your email.",
                        success: true 
                    });
                } catch (emailError) {
                    console.error("Error sending new OTP:", emailError);
                    return res.status(500).json({ 
                        message: "Failed to send new OTP. Please try again.",
                        success: false 
                    });
                }

            } catch (error) {
                console.error("Error resending OTP:", error.message);
                res.status(500).json({ 
                    message: "Server error. Please try again later.",
                    success: false 
                });
            }
    },

    verifyLogin: async (req, res) => {
            try {
                const { email, password } = req.body;
                let errors = {};

                if (!email || email.trim() === "") {
                    errors.email = "Email is required.";
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    errors.email = "Invalid email format.";
                }

                if (!password || password.trim() === "") {
                    errors.password = "Password is required.";
                }

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({ errors });
                }

                const user = await User.findOne({ email });
                if (!user) {
                    return res.status(400).json({ 
                        message: "User not found. Please sign up." 
                    });
                }

                if (!user.isActive) {
                    return res.status(400).json({ 
                        message: "Your account has been deactivated. Please contact support." 
                    });
                }

                if (!user.isVerified) {
                    return res.status(400).json({ 
                        message: "Please verify your email before logging in." 
                    });
                }

                if (!user.password) {
                    return res.status(400).json({ 
                        message: "Please login using Google or reset your password." 
                    });
                }

                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.status(400).json({ 
                        message: "Invalid credentials. Please try again." 
                    });
                }

                req.session.user = {
                    _id: user._id,
                    email: user.email,
                    fullname: user.fullname,
                    phoneNumber: user.phoneNumber,
                    profileImage: user.profileImage
                };

                return res.status(200).json({ 
                    message: "Login successful!", 
                    redirecturl: "/user/home" 
                });

            } catch (error) {
                console.error('Login error:', error.message);
                res.status(500).json({ message: "Server error: " + error.message });
            }
    },

    loadLogin: async (req, res) => {
            try {
                res.render('user/login');
            } catch (error) {
                console.log('Load login error:', error.message);
                res.status(500).send('Server Error');
            }
    },

    loadHomepage: async (req, res) => {
            try {
                const products = await Product.find({ isDeleted: false, isListed: true })
                    .populate("category brand")
                    .limit(4);
                const categories = await Category.find({ isActive: true });
                const brands = await Brand.find({ isActive: true });

                const validProducts = products
                    .filter((product) => product.variants && product.variants.length > 0)
                    .map((product) => {
                        const variants = product.variants.map((variant) => {
                            const basePrice = variant.regularPrice;
                            const productDiscount = product.offer?.discountPercentage || 0;
                            const categoryDiscount = product.category?.offer?.discountPercentage || 0;
                            const maxDiscount = Math.max(productDiscount, categoryDiscount);
                            const discountedPrice = Math.round(
                                basePrice - basePrice * (maxDiscount / 100)
                            );
                            return {
                                ...variant.toObject(),
                                regularPrice: basePrice,
                                discountedPrice,
                                maxDiscount,
                            };
                        });
                        const firstVariant = variants[0];
                        const basePrice = firstVariant.regularPrice;
                        const productDiscount = product.offer?.discountPercentage || 0;
                        const categoryDiscount = product.category?.offer?.discountPercentage || 0;
                        const maxDiscount = Math.max(productDiscount, categoryDiscount);
                        const discountedPrice = Math.round(
                            basePrice - basePrice * (maxDiscount / 100)
                        );

                        return {
                            ...product.toObject(),
                            variants,
                            variantPrice: basePrice,
                            discountedPrice: discountedPrice,
                            maxDiscount: maxDiscount,
                        };
                    });

                res.render("user/home", {
                    products: validProducts,
                    categories,
                    brands,
                });
            } catch (error) {
                console.error("Error loading homepage:", error.message);
                res.status(500).send("Internal Server Error");
            }
    },

    loadForgotPassword: async (req,res) => {
            try {
                res.render("user/forgotPassword");
            } catch (error) {
                console.log(error.message);
                
            }
    },

    forgotPassword: async (req, res) => {
            try {
                const { email } = req.body;
                if (!email) {
                    return res.status(400).json({ message: "Email is required" });
                }

                const user = await User.findOne({ email });
                if (!user) {
                    return res.status(400).json({ message: "User not found" });
                }

                const resetToken = crypto.randomBytes(32).toString("hex");

                user.resetToken = resetToken;
                user.resetTokenExpire = Date.now() + 3600000; 
                await user.save();

                console.log("Generated reset token for", email, ":", resetToken);
                console.log("Token expiry:", new Date(user.resetTokenExpire));

                const resetLink = `${req.protocol}://${req.get('host')}/user/reset-password/${resetToken}`;
                console.log("Reset link:", resetLink);

                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: process.env.ADMIN_EMAIL,
                        pass: process.env.ADMIN_EMAIL_APP_PASS
                    }
                });

                await transporter.sendMail({
                    from: process.env.ADMIN_EMAIL,
                    to: user.email,
                    subject: "Password Reset Request - RYZO Bags",
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h1 style="color: #4F46E5;">RYZO Bags</h1>
                            </div>
                            
                            <h2 style="color: #333;">Password Reset Request</h2>
                            <p>Hello,</p>
                            <p>You requested a password reset for your RYZO Bags account associated with <strong>${email}</strong>.</p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${resetLink}" 
                                style="background-color: #4F46E5; 
                                        color: white; 
                                        padding: 15px 30px; 
                                        text-decoration: none; 
                                        border-radius: 8px; 
                                        display: inline-block; 
                                        font-weight: bold;">
                                    Reset Your Password
                                </a>
                            </div>
                            
                            <p>Or copy and paste this link in your browser:</p>
                            <p style="word-break: break-all; 
                                    background-color: #f5f5f5; 
                                    padding: 10px; 
                                    border-radius: 4px; 
                                    font-family: monospace;">
                                ${resetLink}
                            </p>
                            
                            <div style="margin-top: 30px; 
                                    padding: 15px; 
                                    background-color: #fff3cd; 
                                    border: 1px solid #ffeaa7; 
                                    border-radius: 6px;">
                                <p style="margin: 0; color: #856404;">
                                    <strong>⚠️ Important:</strong> This link will expire in 1 hour for security reasons.
                                </p>
                            </div>
                            
                            <p style="margin-top: 30px; color: #666;">
                                If you didn't request this password reset, please ignore this email. 
                                Your password will remain unchanged.
                            </p>
                            
                            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                © 2025 RYZO Bags. All rights reserved.
                            </p>
                        </div>
                    `
                });

                console.log("Password reset email sent successfully to:", email);

                res.status(200).json({ 
                    message: "Password reset link has been sent to your email",
                    success: true 
                });

            } catch (error) {
                console.error("Forgot password error:", error);
                try {
                    if (req.body.email) {
                        await User.findOneAndUpdate(
                            { email: req.body.email },
                            { 
                                $unset: { 
                                    resetToken: 1, 
                                    resetTokenExpire: 1 
                                } 
                            }
                        );
                    }
                } catch (cleanupError) {
                    console.error("Error cleaning up token:", cleanupError);
                }
                
                res.status(500).json({ 
                    message: "Failed to send reset email. Please try again.",
                    success: false 
                });
            }
    },
    
    loadResetPassword: async (req, res) => {
            try {
                const token = req.params.token;
                console.log("Loading reset password page for token:", token);
                const user = await User.findOne({
                    resetToken: token,
                    resetTokenExpire: { $gt: Date.now() }
                });
                
                console.log("User found with token:", user ? "Yes" : "No");
                console.log("Current time:", Date.now());
                if (user) {
                    console.log("Token expiry:", user.resetTokenExpire);
                }
                
                if (!user) {
                    console.log("Token is invalid or expired");
                    return res.render('user/resetPassword', {
                        errors: { token: 'Invalid or expired token. Please request a new password reset.' },
                        token: "", 
                        success: null,
                        tokenValid: false
                    });
                }
                console.log("Token is valid, rendering form");
                res.render('user/resetPassword', {
                    errors: {},
                    token: token, 
                    success: null,
                    tokenValid: true
                });
            } catch (error) {
                console.error("Load reset password error:", error.message);
                res.status(500).render('user/resetPassword', {
                    errors: { server: 'Server error occurred. Please try again.' },
                    token: "",
                    success: null,
                    tokenValid: false
                });
            }
    },

    resetPassword: async (req, res) => {
            try {
                const { token } = req.params;
                const { password, confirmPassword } = req.body;

                console.log("Reset password attempt for token:", token);
                console.log("Current time:", Date.now());

                const user = await User.findOne({
                    resetToken: token,
                    resetTokenExpire: { $gt: Date.now() }
                });

                console.log("User found:", user ? "Yes" : "No");
                if (user) {
                    console.log("Token expiry:", user.resetTokenExpire);
                    console.log("Time remaining:", user.resetTokenExpire - Date.now(), "ms");
                }

                if (!user) {
                    console.log("No user found with valid token");
                    return res.status(400).json({
                        success: false,
                        message: "Invalid or expired token. Please request a new password reset."
                    });
                }

                let errors = {};
                
                if (!password || password.length < 8) {
                    errors.password = "Password must be at least 8 characters";
                }
                
                if (!password.match(/[0-9]/)) {
                    errors.password = "Password must contain at least one number";
                }
                
                if (!password.match(/[^a-zA-Z0-9]/)) {
                    errors.password = "Password must contain at least one special character";
                }

                if (password !== confirmPassword) {
                    errors.confirmPassword = "Passwords do not match";
                }

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({
                        success: false,
                        errors: errors
                    });
                }

                user.password = await bcrypt.hash(password, 10);
                user.resetToken = undefined;
                user.resetTokenExpire = undefined;
                await user.save();

                console.log("Password reset successful for user:", user.email);

                return res.status(200).json({
                    success: true,
                    message: "Password reset successful! You can now login with your new password."
                });

            } catch (error) {
                console.error("Reset password error:", error);
                return res.status(500).json({
                    success: false,
                    message: "Server error: " + error.message
                });
            }
    },

    googleCallback: async (req, res) => {
            try {
            const { id, emails, displayName, photos } = req.user;
            const email = emails[0].value;
            const fullname = displayName;
            const profileImage = photos && photos[0] ? photos[0].value : null;
            let user = await User.findOne({ 
                $or: [
                { email: email },
                { googleId: id }
                ]
            });

            if (user) {
                if (!user.googleId) {
                user.googleId = id;
                user.isVerified = true;
                if (profileImage && !user.profileImage) {
                    user.profileImage = profileImage;
                }
                await user.save();
                }
                user.isActive = true;
                await user.save();
            } else {
                user = new User({
                email: email,
                fullname: fullname,
                googleId: id,
                profileImage: profileImage,
                isVerified: true, 
                isActive: true
                });
                await user.save();
            }

            req.session.user = {
                _id: user._id,
                email: user.email,
                fullname: user.fullname,
                profileImage: user.profileImage,
                isVerified: user.isVerified,
                googleId: user.googleId
            };

            console.log('Google user saved/updated successfully:', user.email);
            res.redirect("/user/home");
            
            } catch (error) {
            console.error('Error saving Google user:', error);
            res.redirect("/user/login?error=auth_failed");
            }
    },

    googleAuthFailure: (req, res) => {
            console.log('Google authentication failed');
            res.redirect("/user/login?error=google_auth_failed");
    },

    initiateGoogleAuth: (req, res, next) => {
            next();
    },

    loadLogout: (req,res) => {
            req.session.destroy((err)=>{
                if(err){
                    console.log(err);
                }
                return res.redirect('/user/login');
            })
    }
};

module.exports = userController;