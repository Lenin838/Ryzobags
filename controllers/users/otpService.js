const nodemailer = require("nodemailer");
require("dotenv").config(); 

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, 
    auth: {
        user: process.env.ADMIN_EMAIL,
        pass: process.env.ADMIN_EMAIL_APP_PASS,
    },
});


const sendOtpEmail = async (email, otp) => {
    try {
        console.log(`Attempting to send OTP to: ${email}, OTP: ${otp}`);
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP for Email Verification",
            html: `<p>Your OTP for verification is: <b>${otp}</b></p><p>This OTP is valid for 5 minutes.</p>`,
        };

        await transporter.sendMail(mailOptions);
        console.log("OTP sent successfully to", email);
    } catch (error) {
        console.error("Error sending email:", error);
    }
};


module.exports = sendOtpEmail;
