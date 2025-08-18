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
    tls:{
        rejectUnauthorized: false
    },
    logger: true,
    debug: true
});


const sendOtpEmail = async (to,subject,html) => {
    try{
        const mailOptions = {
            from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
            to,
            subject,
            html,
        };
        await transporter.sendMail(mailOptions);
        console.log(`email sent to: ${to}`);
    }catch(err){
        console.error("Error in email sending:",err);
    }
};


module.exports = sendOtpEmail;