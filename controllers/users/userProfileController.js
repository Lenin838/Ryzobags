const User = require("../../models/User");
const Order = require("../../models/order");
const Address = require("../../models/address");
const WalletTransaction = require("../../models/wallet");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const util = require("util");
const sendOtpEmail = require("../../controllers/users/otpService");
const template = require('../../controllers/users/emailTemplates');
const sharp = require("sharp");
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');

const mkdir = util.promisify(fs.mkdir);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const saveUserImage = async (req, file) => {
  if (!file || !file.buffer) {
    console.error("Invalid file input:", file);
    return null;
  }

  try {
    const userId = req.user ? req.user._id : "unknown";
    const uploadPath = path.join(process.cwd(), "public/uploads/ProfileImages");
    await mkdir(uploadPath, { recursive: true });

    const filename = `${userId}-${crypto.randomBytes(6).toString("hex")}-${Date.now()}.webp`;
    const outputPath = path.join(uploadPath, filename);

    await sharp(file.buffer)
      .resize(300, 300)
      .webp({ quality: 80 })
      .toFile(outputPath);

    return `/uploads/ProfileImages/${filename}`;
  } catch (err) {
    console.error("Error saving user image:", err);
    return null;
  }
};

const cleanExpiredOtps = async (req, res, next) => {
  try {
    if (req.user && req.path !== '/profile/verify-email') {
      const user = await User.findById(req.user._id);
      if (user?.otpExpiresAt && user.otpExpiresAt < new Date()) {
        console.log(`🧹 Cleaning expired OTP for user ${req.user._id}`);
        user.otp = null;
        user.otpExpiresAt = null;
        user.newEmail = null;
        await user.save();
        req.session.pendingEmail = null;
      }
    }
  } catch (err) {
    console.error('❌ Error cleaning expired OTPs:', err);
  }
  next();
};

const userProfileController = {
  getProfile: async (req, res) => {
    try {
      const { tab = "profile", search, page = 1,walletPage = 1 } = req.query;
      const user = await User.findById(req.user._id).select("-password").lean();
      const ordersLimit = 5;
      const ordersSkip = (page - 1) * ordersLimit;
      const walletLimit = 5;
      const walletSkip = (walletPage - 1) * walletLimit;

      let ordersQuery = { userId: req.user._id };
      if (search) {
        ordersQuery.orderId = { $regex: search, $options: "i" };
      }

      const orders = await Order.find(ordersQuery)
        .populate("items.productId")
        .sort({ orderDate: -1 })
        .skip(ordersSkip)
        .limit(ordersLimit)
        .lean();

      const ordersTotal = await Order.countDocuments(ordersQuery);
      const ordersTotalPages = Math.ceil(ordersTotal / ordersLimit);

      const addressDoc = await Address.findOne({ userId: req.user._id}).lean();

      const addresses = addressDoc && addressDoc.address 
        ? addressDoc.address.filter((addr) => addr.status === "active")
        : [];

      const lastTx = await WalletTransaction.findOne({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
      const walletBalance = lastTx ? lastTx.wallet.balance : 0;

      const history = await WalletTransaction.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(walletSkip)
        .limit(walletLimit)
        .lean();

      const walletTotal = await WalletTransaction.countDocuments({userId: req.user._id});
      const walletTotalPages = Math.ceil(walletTotal / walletLimit);

      const referrals = [];


      res.render("user/profile", {
        user,
        addresses,
        orders,
        walletBalance,
        history,
        referrals,
        activeTab: tab,
        searchQuery: search || "",
        currentPage: parseInt(page),
        ordersTotal,
        ordersTotalPages,
        ordersLimit,
        walletCurrentPage: parseInt(walletPage),
        walletTotal,
        walletTotalPages,
        walletLimit,
        success: req.flash("success"),
        error: req.flash("error"),
      });
    } catch (err) {
      console.error(err);
      req.flash("error", "Server Error");
      res.status(statusCode.INTERNAL_SERVER_ERROR).redirect("/user/profile");
    }
  },

  getWalletStatus: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select("-password").lean();
      const lastTx = await WalletTransaction.findOne({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
      const walletBalance = lastTx ? lastTx.wallet.balance : 0;

      res.render("user/profile", {
        user,
        walletBalance,
        activeTab: "wallet-status",
        addresses: [],
        orders: [],
        history: [],
        referrals: [],
        success: req.flash("success"),
        error: req.flash("error"),
      });
    } catch (err) {
      console.error(err);
      req.flash("error", "Unable to load wallet status");
      res.redirect("/user/profile");
    }
  },

  getAddAddress: (req, res) => {
    res.render("user/addressForm", {
      action: "/user/profile/address/add",
      address: {},
      success: req.flash("success"),
      error: req.flash("error"),
    });
  },

  postAddAddress: async (req, res) => {
    try {
      const { name, landMark, city, state, pincode, phone, addressType, isDefault } = req.body;

      if (!name || !city || !state || !pincode || !phone) {
        return res.status(statusCode.BAD_REQUEST).json({success:false,message:message.ALL_FIELDS_ARE_REQUIRED});
      }

      const addressData = {
        name,
        landMark: landMark || "",
        city,
        state,
        pincode,
        phone,
        addressType: addressType || "Home",
        isDefault: isDefault === "on",
      };

      let addressDoc = await Address.findOne({ userId: req.user._id });
      if (addressDoc) {
        if (addressData.isDefault) {
          addressDoc.address.forEach((addr) => (addr.isDefault = false));
        }
        addressDoc.address.push(addressData);
        addressDoc.markModified('address');
        await addressDoc.save();
      } else {
        addressDoc = await Address.create({
          userId: req.user._id,
          address: [addressData],
        });
      }

      return res.status(statusCode.OK).json({success:true,message:message.ADDRESS_ADDEDD_SUCCESSFULLY});
    } catch (err) {
      console.error(err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({success:false,message:message.INTERNAL_SERVER_ERROR});
    }
  },

  getEditAddress: async (req, res) => {
  try {
    const { id } = req.params;
    const addressDoc = await Address.findOne({ userId: req.user._id }).lean();

    if (!addressDoc) {
      req.flash("error", "No addresses found");
      return res.redirect("/user/profile?tab=addresses");
    }

    const address = addressDoc.address.find(addr => addr._id.toString() === id);
    
    if (!address) {
      req.flash("error", "Address not found");
      return res.redirect("/user/profile?tab=addresses");
    }

    res.render("user/addressForm", {
      action: `/user/profile/address/edit/${id}`,
      address: address,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Error loading address");
    res.redirect("/user/profile?tab=addresses");
  }
  },

  postEditAddress: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, landMark, city, state, pincode, phone, addressType, isDefault } = req.body;

      if (!name || !city || !state || !pincode || !phone) {
        return res.status(statusCode.BAD_REQUEST).json({success:false,message:message.ALL_FIELDS_ARE_REQUIRED});
      }

      const addressDoc = await Address.findOne({ userId: req.user._id });
      if (!addressDoc) {
        return res.status(statusCode.NOT_FOUND).json({success:false,message:message.ADDRESS_NOT_FOUND});
      }

      const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === id);
      
      if (addressIndex === -1) {
       return res.status(statusCode.NOT_FOUND).json({success:false,message:message.ADDRESS_NOT_FOUND});
      }

      if (isDefault === "on") {
        addressDoc.address.forEach((addr) => (addr.isDefault = false));
      }

      addressDoc.address[addressIndex] = {
        _id: addressDoc.address[addressIndex]._id, 
        name,
        landMark: landMark || "",
        city,
        state,
        pincode,
        phone,
        addressType: addressType || "Home",
        isDefault: isDefault === "on",
        status: addressDoc.address[addressIndex].status || "active",
        createdAt: addressDoc.address[addressIndex].createdAt || new Date(),
      };

      addressDoc.markModified('address');
      await addressDoc.save();
      return res.status(statusCode.OK).json({success:true,message:message.ADDRESS_UPDATED_SUCCESSFULLY});
    } catch (err) {
      console.error(err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({success:false,message:message.INTERNAL_SERVER_ERROR});
    }
  },

  deleteAddress: async (req, res) => {
    try {
      const { id } = req.params;
      const addressDoc = await Address.findOne({ userId: req.user._id });

      if (!addressDoc) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          return res.status(statusCode.NOT_FOUND).json({ 
            success: false, 
            message: message.ADDRESS_NOT_FOUND 
          });
        }
        req.flash("error", "No addresses found");
        return res.redirect("/user/profile?tab=addresses");
      }

      const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === id);
      
      if (addressIndex === -1) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          return res.status(statusCode.NOT_FOUND).json({ 
            success: false, 
            message: message.ADDRESS_NOT_FOUND 
          });
        }
        req.flash("error", "Address not found");
        return res.redirect("/user/profile?tab=addresses");
      }

      const wasDefault = addressDoc.address[addressIndex].isDefault;
      
      addressDoc.address[addressIndex].status = "inactive";
      if (wasDefault) {
        const firstActiveAddress = addressDoc.address.find(addr => 
          addr.status === "active" && addr._id.toString() !== id
        );
        if (firstActiveAddress) {
          firstActiveAddress.isDefault = true;
        }
      }

      addressDoc.markModified('address');
      await addressDoc.save();
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ 
          success: true, 
          message: message.ADDRESS_DELETED_SUCCESSFULLY
        });
      }

      req.flash("success", "Address deleted successfully");
      res.redirect("/user/profile?tab=addresses");
      
    } catch (err) {
      console.error(err);
      
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ 
          success: false, 
          message: "Error deleting address" 
        });
      }
      
      req.flash("error", "Error deleting address");
      res.redirect("/user/profile?tab=addresses");
    }
  },

  setDefaultAddress: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "Address ID is required" });
      }

      const addressDoc = await Address.findOne({ userId: req.user._id });
      if (!addressDoc || !addressDoc.address || addressDoc.address.length === 0) {
        return res.status(statusCode.NOT_FOUND).json({ success: false, message: message.ADDRESS_NOT_FOUND });
      }

      const targetAddress = addressDoc.address.find(addr => addr._id.toString() === id);
      
      if (!targetAddress) {
        return res.status(statusCode.NOT_FOUND).json({ success: false, message: message.ADDRESS_NOT_FOUND });
      }

      if (targetAddress.status === "inactive") {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: message.ADDRESS_INACTIVE });
      }

      if (targetAddress.isDefault) {
        return res.status(statusCode.OK).json({ success: true, message: message.ADDRESS_ALREADY_DEFAULT });
      }

      addressDoc.address.forEach((addr) => {
        addr.isDefault = false;
      });

      targetAddress.isDefault = true;
      addressDoc.markModified('address');

      await addressDoc.save();

      const verifyDoc = await Address.findOne({ userId: req.user._id });
      const defaultAddress = verifyDoc.address.find((addr) => addr.isDefault);

      return res.status(statusCode.OK).json({ success: true, message: message.DEFAULT_UPDATED});
    } catch (err) {
      console.error("❌ Error setting default address:", err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Error setting default address: " + err.message });
    }
  },

  getEditProfile: [cleanExpiredOtps, async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select("-password").lean();
      const pendingEmail = req.session.pendingEmail || user.newEmail || '';

      res.render("user/editProfile", {
        user,
        newEmail: pendingEmail,
        success: req.flash("success"),
        error: req.flash("error"),
      });
    } catch (err) {
      console.error('❌ Error in getEditProfile:', err);
      req.flash("error", "Server error");
      res.status(statusCode.INTERNAL_SERVER_ERROR).redirect("/user/profile");
    }
  }],

  updateProfile: [
    upload.single("profileImage"),
    async (req, res) => {
      try {
        const { fullname, phoneNumber } = req.body;
        const updates = { fullname, phoneNumber };

        const errors = {};

        if (!fullname || fullname.trim() === "") {
                errors.fullname = "Full Name is required.";
            } else if (!/^[A-Za-z\s]+$/.test(fullname)) {
                errors.fullname = "Name must contain only alphabets and spaces.";
            } else if (fullname.length < 3) {
                errors.fullname = "Name must be at least 3 characters.";
            }
        
        if (!phoneNumber || phoneNumber.trim() === "") {
                errors.phoneNumber = "Phone number is required.";
            } else if (!/^\d{10}$/.test(phoneNumber)) {
                errors.phoneNumber = "Phone number must be exactly 10 digits.";
            }

        if (Object.keys(errors).length > 0) {
              return res.status(400).json({ errors });
            } 

        if (req.file) {
          const imagePath = await saveUserImage(req, req.file);
          if (imagePath) {
            updates.profileImage = imagePath;
          }
        }

        await User.findByIdAndUpdate(req.user._id, updates);
        return res.status(statusCode.OK).json({success: true,message:message.PROFILE_UPDATED});
      } catch (err) {
        console.error(err);
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({success:false,message:message.INTERNAL_SERVER_ERROR});
      }
    },
  ],

  uploadProfileImage: [
    upload.single("profileImage"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(statusCode.BAD_REQUEST).json({ success: false, message: message.NO_IMAGE });
        }

        const imagePath = await saveUserImage(req, req.file);
        if (!imagePath) {
          return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message.IMAGE_FAILED });
        }

        const user = await User.findById(req.user._id);
        if (user.profileImage && user.profileImage !== "/images/default-profile.png") {
          const oldImagePath = path.join(process.cwd(), "public", user.profileImage);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }

        user.profileImage = imagePath;
        await user.save();

        res.json({ success: true, imageUrl: imagePath });
      } catch (err) {
        console.error("Error in uploadProfileImage:", err);
        res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message.SERVER_ERROR});
      }
    },
  ],

  initiateEmailChange: async (req, res) => {
    try {
      const { newEmail } = req.body;

      if (!newEmail || !newEmail.trim()) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "Please provide a valid email address" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail.trim())) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: message.INVALID_EMAIL });
      }

      const existingUser = await User.findOne({ email: newEmail.trim() });
      if (existingUser) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "Email already in use" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(statusCode.NOT_FOUND).json({ success: false, message: message.USER_NOT_FOUND });
      }

      if (user.email === newEmail.trim()) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: message.EMAIL_SAME });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      console.log(`🔐 Generated OTP for user ${user._id}: ${otp}`);

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          otp: otp,
          otpExpiresAt: otpExpiresAt,
          newEmail: newEmail.trim()
        },
        { 
          new: true,
          runValidators: true
        }
      );

      if (!updatedUser) {
        console.error('❌ Failed to update user document');
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to save user data. Please try again." });
      }

      console.log('✅ User updated with OTP and newEmail:', {
        userId: updatedUser._id,
        otp: updatedUser.otp,
        otpExpiresAt: updatedUser.otpExpiresAt,
        newEmail: updatedUser.newEmail,
      });

      const verifyUser = await User.findById(req.user._id).select('otp otpExpiresAt newEmail');
      console.log('🔍 Verification check after save:', {
        otp: verifyUser.otp,
        otpExpiresAt: verifyUser.otpExpiresAt,
        newEmail: verifyUser.newEmail,
      });

      req.session.pendingEmail = newEmail.trim();
      req.session.pendingOtp = otp;
      req.session.otpExpiresAt = otpExpiresAt.getTime();


      try {
        await sendOtpEmail(newEmail,"Email Change Otp",template.emailChangingOtpTemplate(otp))
        
        return res.json({ success: true, message: `Verification email sent to ${newEmail.trim()}. Please check your inbox.` });
      } catch (emailError) {
        console.error('❌ Email sending failed:', emailError);
        
        await User.findByIdAndUpdate(req.user._id, {
          otp: null,
          otpExpiresAt: null,
          newEmail: null
        });
        req.session.pendingEmail = null;
        req.session.pendingOtp = null;
        req.session.otpExpiresAt = null;
        
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send verification email. Please check the email address and try again." });
      }
    } catch (err) {
      console.error('❌ Error in initiateEmailChange:', err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message.SERVER_ERROR });
    }
  },

  verifyEmailChange: async (req, res) => {
    try {
      const { otp } = req.body;
      console.log('📥 Received OTP for verification:', otp);

      if (!req.user?._id) {
        return res.status(statusCode.UNAUTHORIZED).json({ success: false, message: message.USER_NOT_AUTHENTICATED });
      }

      if (!otp || !otp.trim()) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "Please enter the OTP" });
      }

      const userCheck = await User.findById(req.user._id).select('otp otpExpiresAt newEmail email');

      let validOtp, validExpiresAt, validNewEmail;
      
      if (userCheck?.otp && userCheck?.otpExpiresAt && userCheck?.newEmail) {
        validOtp = userCheck.otp;
        validExpiresAt = userCheck.otpExpiresAt;
        validNewEmail = userCheck.newEmail;
      } else if (req.session.pendingOtp && req.session.otpExpiresAt && req.session.pendingEmail) {
        validOtp = req.session.pendingOtp;
        validExpiresAt = new Date(req.session.otpExpiresAt);
        validNewEmail = req.session.pendingEmail;
      } else {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "No pending email verification found. Please request a new verification email." });
      }

      if (validExpiresAt < new Date()) {
        await User.findByIdAndUpdate(req.user._id, {
          otp: null,
          otpExpiresAt: null,
          newEmail: null
        });
        req.session.pendingEmail = null;
        req.session.pendingOtp = null;
        req.session.otpExpiresAt = null;
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "OTP has expired. Please request a new verification email." });
      }

      if (validOtp !== otp.trim().toString()) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message: "Invalid OTP. Please check and try again." });
      }

      const emailExists = await User.findOne({ 
        email: validNewEmail,
        _id: { $ne: req.user._id }
      });
      
      if (emailExists) {
        await User.findByIdAndUpdate(req.user._id, {
          otp: null,
          otpExpiresAt: null,
          newEmail: null
        });
        req.session.pendingEmail = null;
        req.session.pendingOtp = null;
        req.session.otpExpiresAt = null;
        return res.status(statusCode.BAD_REQUEST).json({ success: false, message:message.EMAIL_IN_USE});
      }

      const oldEmail = userCheck.email;  

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          email: validNewEmail,
          newEmail: null,
          otp: null,
          otpExpiresAt: null
        },
        { new: true }
      );

      if (!updatedUser) {
        console.error('❌ Failed to update user email');
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to save email update." });
      }

      console.log(`✅ Successfully updated email to ${validNewEmail} for user ${updatedUser._id}`);

      req.session.pendingEmail = null;
      req.session.pendingOtp = null;
      req.session.otpExpiresAt = null;
      console.log('📋 Cleared session data');

      try {
        await Promise.all([
          transporter.sendMail({
            from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
            to: oldEmail,
            subject: "Email Address Changed - RyzoBags",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #dc2626;">Email Address Changed</h2>
                <p>Your RyzoBags account email has been changed from <strong>${oldEmail}</strong> to <strong>${validNewEmail}</strong>.</p>
                <p>If you did not make this change, please contact our support team immediately.</p>
                <p style="margin-top: 30px; color: #6b7280;">
                  Best regards,<br>
                  RyzoBags Team
                </p>
              </div>
            `,
          }),
          transporter.sendMail({
            from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
            to: validNewEmail,
            subject: "Welcome to Your New Email - RyzoBags",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #059669;">Email Successfully Updated!</h2>
                <p>Your RyzoBags account email has been successfully changed to <strong>${validNewEmail}</strong>.</p>
                <p>You can now use this email address to log in to your account.</p>
                <p style="margin-top: 30px; color: #6b7280;">
                  Best regards,<br>
                  RyzoBags Team
                </p>
              </div>
            `,
          }),
        ]);
        console.log(`✅ Confirmation emails sent to ${oldEmail} and ${validNewEmail}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send confirmation emails:', emailError);
      }

      return res.json({ success: true, message:message.EMAIL_CHANGE_VERIFIED});
    } catch (err) {
      console.error('❌ Error in verifyEmailChange:', err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to verify email. Please try again." });
    }
  },

  checkEmailChangeStatus: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('email newEmail otp').lean();
      if (!user.newEmail && !user.otp) {
        return res.json({ success: true, message: message.EMAIL_CHANGE_VERIFIED, email: user.email });
      }
      return res.json({ success: false, message: message.EMAIL_CHANGE_PENDING, email: user.email });
    } catch (err) {
      console.error('❌ Error in checkEmailChangeStatus:', err.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message.SERVER_ERROR });
    }
  },

  getChangePassword: async(req, res) => {
    const user = await User.findById(req.user._id)
    res.render("user/changePassword", {
      user,
      activeTab: "change-password",
      success: req.flash("success"),
      error: req.flash("error"),
    });
  },

  changePassword: async (req, res) => {
    req.flash("error", "Please use the new secure password change process");
    res.redirect("/user/change-password");
  },

  requestPasswordChangeOtp: async (req, res) => {
    try {
      const { currentPassword } = req.body;

      if (!currentPassword) {
        return res.status(statusCode.BAD_REQUEST).json({ 
          success: false, 
          message: message.CURRENT_PASSWORD_REQUIRED
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(statusCode.NOT_FOUND).json({ 
          success: false, 
          message: message.USER_NOT_FOUND
        });
      }

      if (!user.googleId) {
        if (!user.password) {
          return res.status(statusCode.BAD_REQUEST).json({ 
            success: false, 
            message: message.NO_PASSWORD_SET
          });
        }
        
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          return res.status(statusCode.BAD_REQUEST).json({ 
            success: false, 
            message: message.CURRENT_PASSWORD_INCORRECT 
          });
        }
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      console.log(`🔐 Generated password change OTP for user ${user._id}: ${otp}`);

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          passwordChangeOtp: otp,
          passwordChangeOtpExpiresAt: otpExpiresAt
        },
        { new: true, runValidators: true }
      );

      if (!updatedUser) {
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ 
          success: false, 
          message: "Failed to save verification data" 
        });
      }

      req.session.passwordChangeOtp = otp;
      req.session.passwordChangeOtpExpiresAt = otpExpiresAt.getTime();

      
      try {
        await sendOtpEmail(user.email,"Password Change otp",template.passwordChangeOtpTemplate(otp));
        
        return res.json({ 
          success: true, 
          message: `Verification code sent to your email address. Please check your inbox.` 
        });
      } catch (emailError) {
        console.error('❌ Password change OTP email sending failed:', emailError);
        
        await User.findByIdAndUpdate(req.user._id, {
          passwordChangeOtp: null,
          passwordChangeOtpExpiresAt: null
        });
        req.session.passwordChangeOtp = null;
        req.session.passwordChangeOtpExpiresAt = null;
        
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ 
          success: false, 
          message: "Failed to send verification email. Please try again." 
        });
      }
    } catch (err) {
      console.error('❌ Error in requestPasswordChangeOtp:', err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ 
        success: false, 
        message:message.SERVER_ERROR
      });
    }
  },

  verifyOtpAndChangePassword: async (req, res) => {
    try {
      const { otp, newPassword, confirmPassword } = req.body;

      if (!otp || !newPassword || !confirmPassword) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.ALL_FIELDS_ARE_REQUIRED
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: "New passwords do not match"
        });
      }

      if (newPassword.length < 6) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.RESET_PASSWORD_TOO_SHORT
        });
      }

      const user = await User.findById(req.user._id).select('passwordChangeOtp passwordChangeOtpExpiresAt email');
      if (!user) {
        return res.status(statusCode.NOT_FOUND).json({
          success: false,
          message:message.USER_NOT_FOUND
        });
      }

      console.log('🔍 Password change verification attempt:', {
        userId: user._id,
        providedOtp: otp,
        storedOtp: user.passwordChangeOtp,
        expiresAt: user.passwordChangeOtpExpiresAt,
        currentTime: new Date()
      });

      let validOtp, validExpiresAt;
      
      if (user.passwordChangeOtp && user.passwordChangeOtpExpiresAt) {
        validOtp = user.passwordChangeOtp;
        validExpiresAt = user.passwordChangeOtpExpiresAt;
        console.log('✅ Using database OTP data');
      } else if (req.session.passwordChangeOtp && req.session.passwordChangeOtpExpiresAt) {
        validOtp = req.session.passwordChangeOtp;
        validExpiresAt = new Date(req.session.passwordChangeOtpExpiresAt);
        console.log('✅ Using session OTP data');
      } else {
        console.log('❌ No valid OTP data found');
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.NO_PENDING_REQUEST
        });
      }

      if (validExpiresAt < new Date()) {
        console.log('❌ Password change OTP expired');
        await User.findByIdAndUpdate(req.user._id, {
          passwordChangeOtp: null,
          passwordChangeOtpExpiresAt: null
        });
        req.session.passwordChangeOtp = null;
        req.session.passwordChangeOtpExpiresAt = null;
        
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: "Verification code has expired. Please request a new one."
        });
      }

      if (validOtp !== otp.trim()) {
        console.log(`❌ Invalid password change OTP. Provided: ${otp.trim()}, Expected: ${validOtp}`);
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: "Invalid verification code. Please check and try again."
        });
      }

      console.log('✅ OTP verified successfully, proceeding to change password');

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          password: hashedPassword,
          passwordChangeOtp: null,
          passwordChangeOtpExpiresAt: null
        },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(statusCode.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to update password"
        });
      }

      req.session.passwordChangeOtp = null;
      req.session.passwordChangeOtpExpiresAt = null;

      console.log(`✅ Password changed successfully for user ${updatedUser._id}`);

      try {
        await transporter.sendMail({
          from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
          to: user.email,
          subject: "Password Changed Successfully - RyzoBags",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #4f46e5; margin: 0;">RyzoBags</h1>
                  <p style="color: #6b7280; margin: 5px 0 0 0;">Security Update</p>
                </div>
                
                <h2 style="color: #059669; margin-bottom: 20px;">Password Changed Successfully!</h2>
                
                <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
                  Your RyzoBags account password has been successfully changed on ${new Date().toLocaleString()}.
                </p>
                
                <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; padding: 15px; margin: 20px 0;">
                  <p style="color: #047857; margin: 0; font-size: 14px;">
                    <strong>✅ Security Confirmed:</strong> Your account is now secured with your new password.
                  </p>
                </div>
                
                <p style="color: #374151; line-height: 1.6;">
                  If you did not make this change, please contact our support team immediately.
                </p>
                
                <p style="margin-top: 30px; color: #6b7280;">
                  Best regards,<br>
                  RyzoBags Security Team
                </p>
              </div>
            </div>
          `,
        });
        console.log('✅ Password change confirmation email sent');
      } catch (emailError) {
        console.error('⚠️ Failed to send password change confirmation email:', emailError);
      }

      return res.json({
        success: true,
        message: message.PASSWORD_CHANGED
      });

    } catch (err) {
      console.error('❌ Error in verifyOtpAndChangePassword:', err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: message.SERVER_ERROR
      });
    }
  },

  getReferrals: async (req, res) => {
    try {
      const referrals = [];
      const user = await User.findById(req.user._id).select("-password").lean();
      res.render("user/profile", {
        user,
        referrals,
        activeTab: "referrals",
        addresses: [],
        orders: [],
        walletBalance: 0,
        history: [],
        success: req.flash("success"),
        error: req.flash("error"),
      });
    } catch (err) {
      console.error(err);
      req.flash("error", "Unable to load referrals");
      res.redirect("/user/profile");
    }
  },
};

module.exports = userProfileController;

