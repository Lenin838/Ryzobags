const signupOtpTemplate = (otp,expiryMinutes = 5) =>`
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
    <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">
      
      <!-- Brand Header -->
      <div style="text-align: center; margin-bottom: 28px;">
        <h1 style="color: #4f46e5; margin: 0; font-size: 26px;">RyzoBags</h1>
        <p style="color: #6b7280; margin: 6px 0 0 0; font-size: 14px;">Signup Verification</p>
      </div>

      <!-- Title + Intro -->
      <h2 style="color: #111827; margin: 0 0 12px 0; font-size: 20px;">Your One-Time Password (OTP)</h2>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 18px 0; font-size: 15px;">
        Use the OTP below to complete your <strong>signup</strong>. Do not share this code with anyone.
      </p>

      <!-- OTP Block -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 22px; text-align: center; border-radius: 10px; margin: 24px 0;">
        <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 13px; font-weight: 600; letter-spacing: .4px;">Your OTP</p>
        <div style="background: rgba(255,255,255,0.18); padding: 14px 22px; border-radius: 8px; display: inline-block;">
          <span style="color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 8px; font-family: 'Courier New', monospace; display: inline-block;">
            ${otp}
          </span>
        </div>
      </div>

      <!-- Expiry Notice -->
      <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 18px 0;">
        <p style="color: #92400e; margin: 0; font-size: 14px;">
          ⏰ <strong>Important:</strong> This OTP expires in ${expiryMinutes} minute${expiryMinutes === 1 ? '' : 's'}.
        </p>
      </div>

      <!-- Security Tip -->
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 22px 0 0 0;">
        If you did not request this, please ignore this email — your account remains secure.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;">

      <!-- Footer -->
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        This is an automated message from RyzoBags. Please do not reply to this email.
      </p>
    </div>
  </div>
`;

const placeOrderTemplate = (message) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #f9f9f9; border-radius: 8px; padding: 20px; border: 1px solid #ddd;">
    <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eee;">
      <h2 style="color: #ff6600; margin: 0;">RyzoBags</h2>
    </div>

    <div style="padding: 20px; text-align: center;">
      <h3 style="color: #333;">Order Confirmation</h3>
      <p style="color: #555; font-size: 16px; line-height: 1.5;">
        Your order has been <strong style="color: #28a745;">successfully placed</strong> and will be delivered within 
        <strong>7 working days</strong>.
      </p>
      <p style="color: #555; font-size: 16px; line-height: 1.5;">
        Thank you for shopping with <span style="color: #ff6600; font-weight: bold;">RyzoBags</span>!
      </p>
    </div>

    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
      <p style="font-size: 14px; color: #999;">If you have any questions, contact our support team.</p>
    </div>
  </div>
`;

const cancelOrderTemplate = (orderId) =>`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Order Cancelled</title>
<style>
    body {
        font-family: Arial, sans-serif;
        background-color: #f7f7f7;
        margin: 0;
        padding: 0;
    }
    .container {
        background-color: #ffffff;
        max-width: 600px;
        margin: 40px auto;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #ddd;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .header {
        background-color: #e74c3c;
        padding: 20px;
        text-align: center;
        color: white;
    }
    .header h2 {
        margin: 0;
        font-size: 24px;
    }
    .content {
        padding: 20px;
        color: #333;
        font-size: 16px;
        line-height: 1.5;
    }
    .order-id {
        font-weight: bold;
        color: #e74c3c;
    }
    .footer {
        background-color: #f0f0f0;
        padding: 15px;
        text-align: center;
        font-size: 14px;
        color: #777;
    }
</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Order Cancelled</h2>
        </div>
        <div class="content">
            <p>Your order <span class="order-id">${orderId}</span> has been successfully cancelled.</p>
            <p>If you believe this is a mistake or want to reorder, please contact our support team.</p>
        </div>
        <div class="footer">
            &copy; ${new Date().getFullYear()} Your Company. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
const emailChangingOtpTemplate = (otp) =>`
  <div style="
    font-family: Arial, sans-serif;
    background-color: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    max-width: 500px;
    margin: auto;
    border: 1px solid #ddd;
  ">
    <h2 style="color: #2c3e50; text-align: center;">Welcome to <span style="color: #ff6600;">RyzoBags</span></h2>
    
    <p style="font-size: 16px; color: #555; text-align: center;">
      Your Email Change OTP is:
    </p>

    <div style="
      background-color: #ff6600;
      color: white;
      padding: 15px;
      font-size: 28px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 4px;
      border-radius: 6px;
    ">
      ${otp}
    </div>

    <p style="font-size: 14px; color: #777; text-align: center; margin-top: 15px;">
      This OTP will expire in <strong>5 minutes</strong>.
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

    <p style="font-size: 12px; color: #aaa; text-align: center;">
      If you did not request this change, please ignore this email.
    </p>
  </div>
`;

const passwordChangeOtpTemplate = (otp) => `
  <div style="font-family: Arial, sans-serif; background-color: #f6f8fa; padding: 20px;">
    <div style="max-width: 500px; margin: auto; background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
      
      <h2 style="color: #2d3748; text-align: center;">Welcome to <span style="color: #e63946;">RyzoBags</span></h2>
      
      <p style="font-size: 16px; color: #4a5568; text-align: center;">
        Your password change OTP is:
      </p>
      
      <h1 style="color: #e63946; font-size: 36px; text-align: center; letter-spacing: 5px; margin: 20px 0;">
        ${otp}
      </h1>
      
      <p style="font-size: 14px; color: #718096; text-align: center;">
        This OTP will expire in <b>5 minutes</b>. Please use it before it expires.
      </p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">
      
      <p style="font-size: 12px; color: #a0aec0; text-align: center;">
        If you didn’t request a password change, you can safely ignore this email.
      </p>
    </div>
  </div>
`;


module.exports = {
    signupOtpTemplate,
    placeOrderTemplate,
    cancelOrderTemplate,
    emailChangingOtpTemplate,
    passwordChangeOtpTemplate,
}