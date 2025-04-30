const User = require('../../models/User');
const Product=require("../../models/product")
const Brand=require("../../models/brand")
const Catogory=require("../../models/category")
const sendOtpEmail = require('./otpService');
const otpGenerator = require('otp-generator');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Order = require('../../models/order');
const {upload, saveUserImage} = require('../../middlewares/uploads');

const generateOtpCode=()=>Math.floor(100000 +Math.random() * 900000).toString()

const userController = {
    loadRegister: async (req, res) => {
        try {
            res.render('user/signup');
        } catch (error) {
            console.error(error.message);
        }
    },

    verifyRegister: async (req, res) => {
        try {
            const { fullname, email, phone, password, confirmPassword } = req.body;
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

            if (Object.keys(errors).length > 0) {
                return res.status(400).json({ errors });
            }

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User already exists. Please log in." });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            req.session.fullname = fullname;
            req.session.email = email;
            req.session.phone = phone;
            req.session.password = hashedPassword;

            const otpCode = generateOtpCode();
            req.session.otp = otpCode;
            req.session.otpExpire = Date.now() + 5 * 60 * 1000;

            console.log("Generated OTP:", otpCode);
            console.log("Session Data:", req.session);

            await sendOtpEmail(email, otpCode);

            return res.status(200).json({ 
                message: "Signup successful! OTP sent to your email.", 
                redirecturl: '/user/enterOtp' 
            });

        } catch (error) {
            console.error(error.message);
            res.status(500).json({ message: "Server error" });
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

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ 
                    message: "Invalid credentials. Please try again." 
                });
            }

            req.session.user = {
                _id: user._id,
                email: user.email,
                fullname: user.fullname
            };
            return res.status(200).json({ 
                message: "Login successful!", 
                redirecturl: "/user/home" 
            });

        } catch (error) {
            console.error(error.message);
            res.status(500).json({ message: "Server error" });
        }
    },
    
    loadOtpPage:async (req,res) => {
        try {
            res.render("user/otp")
        } catch (error) {
            console.log(error.message)
        }
    },

    verifyOtp: async (req, res) => {
        try {
            console.log("Stored OTP:", req.session.otp);
            console.log("Stored Email:", req.session.email);
            console.log("Stored Expiry:", req.session.otpExpire, "Current Time:", Date.now());
    
            const { otp } = req.body;
    
            if (!req.session.otp || !req.session.email) {
                return res.status(400).json({ 
                    message: "OTP session expired. Please request a new one.",
                    success: false 
                });
            }
    
            if (Date.now() > req.session.otpExpire) {
                return res.status(400).json({ 
                    message: "OTP has expired. Please request a new one.",
                    success: false 
                });
            }
    
            if (otp !== req.session.otp) {
                return res.status(400).json({ 
                    message: "Invalid OTP. Please try again.",
                    success: false 
                });
            }
    
            const user = new User({
                fullname: req.session.fullname, 
                email: req.session.email,
                phoneNumber: req.session.phone,  
                password: req.session.password,  
            });
    
            await user.save();
    
            req.session.otp = null;
            req.session.email = null;
            req.session.otpExpire = null;
    
            res.status(200).json({ 
                message: "Email verified. Signup successful!",
                success: true 
            });
    
        } catch (error) {
            console.error(error.message);
            res.status(500).json({ 
                message: "Server error",
                success: false 
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
    
            await sendOtpEmail(req.session.email, newOtp);
            console.log("New OTP sent to:", req.session.email);
    
            return res.status(200).json({ 
                message: "A new OTP has been sent to your email.",
                success: true 
            });
    
        } catch (error) {
            console.error("Error resending OTP:", error.message);
            res.status(500).json({ 
                message: "Server error. Please try again later.",
                success: false 
            });
        }
    },
    loadLogin:async (req,res) => {
        try {
            res.render('user/login')
        } catch (error) {
            console.log(error.message);
        }
    },


    loadHomepage: async (req, res) => {
        try {
            const products = await Product.find().limit(4);
            const categories = await Catogory.find(); 
            const brands = await Brand.find();
            console.log("ppp",products)
            res.render('user/home', { 
                products, 
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
    
            const resetLink = `http://localhost:4000/user/reset-password/${resetToken}`;
    
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
                subject: "Password Reset Request",
                html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link is valid for 1 hour.</p>`
            });
    
            res.status(200).json({ message: "Password reset link is sent to your email" });
        } catch (error) {
            console.log(error.message);
            res.status(500).json({ message: "Server error" });
        }
    },
    

    loadResetPassword: async (req, res) => {
        try {
            const token = req.params.token;
            
            if (!req.session.resetToken || req.session.resetToken !== token || 
                Date.now() > req.session.resetTokenExpire) {
                return res.render('user/resetPassword', {
                    errors: { token: 'Invalid or expired token' },
                    email: "",
                    token: "", 
                    success: null
                });
            }
            
           
            res.render('user/resetPassword', {
                errors: {},
                token: token, 
                success: null
            });
        } catch (error) {
            console.log(error.message);
            res.status(500).render('user/resetPassword', {
                errors: { server: 'Server error' },
                email: "",
                token: "",
                success: null
            });
        }
    },
   
    resetPassword: async (req, res) => {
        try {
            const { token } = req.params;
            const { password, confirmPassword } = req.body;
    
            const user = await User.findOne({
                resetToken: token,
                resetTokenExpire: { $gt: Date.now() }
            });
    
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired token"
                });
            }
    
            if (!password || password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be at least 8 characters"
                });
            }
    
            if (password !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Passwords do not match"
                });
            }
    
            user.password = await bcrypt.hash(password, 10);
            user.resetToken = undefined;
            user.resetTokenExpire = undefined;
            await user.save();
    
            return res.status(200).json({
                success: true,
                message: "Password reset successful!"
            });
    
        } catch (error) {
            console.error("🔥 Controller error:", error);
            return res.status(500).json({
                success: false,
                message: "Server error: " + error.message
            });
        }
    },
};

    
  
    

module.exports = userController;
