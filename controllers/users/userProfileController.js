const User = require("../../models/User");
const Order = require("../../models/order");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const sendEmail = async (email, subject, html) => {
  const transporter = nodemailer.createTransport({/* SMTP config */});
  await transporter.sendMail({ from: '"Your App" <noreply@yourapp.com>', to: email, subject, html });
};

const userProductController = {
  getProfile: async (req, res) => {
    const user = await User.findById(req.session.user._id).populate("addresses");
    const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 });
    res.render("user/profile", { user, orders });
  },

  getEditProfile: async (req, res) => {
    const user = await User.findById(req.session.user._id);
    res.render("user/editProfile", { user });
  },

  postEditProfile: async (req, res) => {
    const user = await User.findById(req.session.user._id);
    const { name, email } = req.body;

    if (email !== user.email) {
      const token = crypto.randomBytes(20).toString("hex");
      user.emailToken = token;
      user.emailTokenExpires = Date.now() + 3600000;
      user.tempEmail = email;

      const html = `<p>Click to verify new email: <a href="http://localhost:4000/email/verify?token=${token}">Verify</a></p>`;
      await sendEmail(email, "Verify your new email", html);
    }

    if (req.file) {
      const filename = `user-${user._id}-${Date.now()}.jpeg`;
      const filePath = path.join(__dirname, "../public/images/users", filename);

      await sharp(req.file.buffer)
        .resize(300, 300)
        .jpeg({ quality: 90 })
        .toFile(filePath);

      user.profileImage = `/images/users/${filename}`;
    }

    user.name = name;
    await user.save();
    res.redirect("/user/profile");
  },

  requestEmailVerification: async (req, res) => {
    const user = await User.findById(req.session.user._id);
    const token = crypto.randomBytes(20).toString("hex");
    user.emailToken = token;
    user.emailTokenExpires = Date.now() + 3600000;
    await user.save();

    const html = `<p>Click to verify: <a href="http://localhost:3000/email/verify?token=${token}">Verify</a></p>`;
    await sendEmail(user.tempEmail, "Verify email", html);
    res.redirect("/profile/edit");
  },

  verifyEmailUpdate: async (req, res) => {
    const { token } = req.query;
    const user = await User.findOne({ emailToken: token, emailTokenExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).send("Token invalid or expired");

    user.email = user.tempEmail;
    user.emailToken = undefined;
    user.emailTokenExpires = undefined;
    user.tempEmail = undefined;
    await user.save();
    res.redirect("/user/profile");
  },

  getChangePassword: async (req, res) => {
    res.render("user/changePassword");
  },

  postChangePassword: async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.session.user._id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.render("user/changePassword", { error: "Current password is incorrect." });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.redirect("/user/profile");
  },

  getUserOrders: async (req, res) => {
    const orders = await Order.find({ user: req.session.user._id });
    res.render("user/orders", { orders });
  },

  cancelOrder: async (req, res) => {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id, user: req.session.user._id });
    if (!order || order.status === "Cancelled") return res.redirect("/orders");

    order.status = "Cancelled";
    await order.save();
    res.redirect("/user/orders");
  },

  getForgotPassword: (req, res) => {
    res.render("user/forgotPassword");
  },

  postForgotPassword: async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render("user/forgotPassword", { error: "No account with this email." });

    const token = crypto.randomBytes(20).toString("hex");
    user.resetToken = token;
    user.resetExpires = Date.now() + 3600000;
    await user.save();

    const html = `<a href="http://localhost:4000/reset-password/${token}">Reset Password</a>`;
    await sendEmail(email, "Reset Password", html);
    res.render("user/forgotPassword", { success: "Email sent!" });
  },

  getResetPassword: async (req, res) => {
    const user = await User.findOne({ resetToken: req.params.token, resetExpires: { $gt: Date.now() } });
    if (!user) return res.send("Token expired.");
    res.render("user/resetPassword", { token: req.params.token });
  },

  postResetPassword: async (req, res) => {
    const user = await User.findOne({ resetToken: req.params.token, resetExpires: { $gt: Date.now() } });
    if (!user) return res.send("Invalid or expired token.");

    user.password = await bcrypt.hash(req.body.newPassword, 10);
    user.resetToken = undefined;
    user.resetExpires = undefined;
    await user.save();
    res.redirect("/user/login");
  },

    uploadProfileImage : async (req, res) => {
        try {
        const userId = req.session.user._id;
        const file = req.file;
    
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
    
        const imagePath = await saveUserImage(req, file);
    
        if (!imagePath) {
            return res.status(500).json({ success: false, message: 'Failed to save image' });
        }
    
        // Update user in DB
        await User.findByIdAndUpdate(userId, { image: imagePath });
    
        // Optionally update session user data
        req.session.user.image = imagePath;
    
        // You can redirect or send a JSON response
        return res.status(200).json({ success: true, image: imagePath });
    
        } catch (error) {
        console.error('Error uploading profile image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
        }
    },

    uploadCroppedImage : async (req, res) => {
        try {
            const base64 = req.body.croppedImage;

            if (!base64) {
            return res.status(400).send('No image data provided.');
            }

            // Decode base64 and convert to buffer
            const matches = base64.match(/^data:image\/\w+;base64,(.+)$/);
            const buffer = Buffer.from(matches[1], 'base64');

            // Generate filename and path
            const filename = `profile_${Date.now()}.jpg`;
            const uploadPath = path.join(__dirname, '/public/images/users', filename);

            // Resize and save using sharp
            await sharp(buffer)
            .resize(300, 300)
            .jpeg({ quality: 90 })
            .toFile(uploadPath);

            const imagePath = `/images/users/${filename}`;

            // Save to DB
            const userId = req.session.user._id;
            await User.findByIdAndUpdate(userId, { profileImage: imagePath });

            req.session.user.profileImage = imagePath;
            res.redirect('/user/profile');
        } catch (err) {
            console.error('Error uploading cropped image:', err);
            res.status(500).send('Server error');
        }
    }
};

module.exports = userProductController;
