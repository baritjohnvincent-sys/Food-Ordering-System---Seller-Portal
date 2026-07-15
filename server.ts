import express from "express";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.ts";
import { menuItems, orders, staff, users, auditLogs, sellers } from "./src/db/schema.ts";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Custom CORS middleware to support Customer and Admin modules calling from other origins
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Body parser limit increased to handle larger offline sales logs
  app.use(express.json({ limit: "15mb" }));

  // API Check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", serverTime: new Date().toISOString() });
  });

  // =============================================================
  // GMAIL SMTP MAIL TRANSPORT SERVICE
  // =============================================================
  const getTransporter = () => {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      console.warn("⚠️ [SMTP] GMAIL_USER and GMAIL_APP_PASSWORD environment variables are not set. Gmail SMTP is disabled.");
      return null;
    }
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    });
  };

  const sendSystemEmail = async (to: string, subject: string, htmlContent: string) => {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn(`⚠️ [SMTP] Transporter unconfigured. Bypassed email sending to: ${to}`);
      console.log(`Subject: ${subject}`);
      return false;
    }
    try {
      await transporter.sendMail({
        from: `"Seller Portal Support" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html: htmlContent,
      });
      console.log(`✓ [SMTP] Email successfully sent to: ${to}`);
      return true;
    } catch (error) {
      console.error(`❌ [SMTP Error] Failed sending email to ${to}:`, error);
      throw error;
    }
  };

  // =============================================================
  // REAL-TIME LOCAL BYPASS AUTHENTICATION & 2FA ENGINE
  // =============================================================
  const otpStore = new Map<string, { otp: string; expiresAt: number }>();
  const pendingRegistrations = new Map<string, {
    token: string;
    emailVerified: boolean;
    otp: string;
    otpExpiresAt: number;
    businessName: string;
    ownerName: string;
    phone: string;
    password: string;
    role: string;
  }>();
  const forgotPasswordStore = new Map<string, {
    otp: string;
    otpExpiresAt: number;
    otpVerified: boolean;
  }>();

  // 1. Send OTP 2FA Code via Gmail SMTP (or fallback local bypass)
  app.post("/api/auth/send-otp", async (req, res) => {
    const { email, type } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email address is required" });
    }

    const emailLower = email.toLowerCase();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration
      otpStore.set(emailLower, { otp, expiresAt });

      const isRegister = type === 'register';
      console.log(`[Security Engine] Generated ${isRegister ? 'Registration' : '2FA'} code [ ${otp} ] for user: ${emailLower}`);

      const subject = "Your Secure 2FA Login PIN - Seller Partner Portal";
      const body = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 20px; border: 1px solid #1e293b; color: #f8fafc;">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 40px;">🛡️</span>
            <h2 style="color: #6366f1; margin: 10px 0 0 0; font-size: 24px; font-weight: 800;">Two-Factor Authentication</h2>
          </div>
          <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
            Please use the following 6-digit verification security PIN to complete your login:
          </p>
          <div style="background-color: #020617; padding: 24px; border-radius: 16px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f59e0b; margin: 28px 0; border: 1px solid #1e293b; font-family: monospace;">
            ${otp}
          </div>
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            This security code is highly sensitive and is valid for exactly 5 minutes.
          </p>
        </div>
      `;

      const emailSent = await sendSystemEmail(emailLower, subject, body);

      res.json({ 
        success: true, 
        previewUrl: "",
        isFallback: !emailSent,
        localBypassOtp: otp
      });
    } catch (error: any) {
      console.error("[Security Engine] Error generating OTP:", error);
      res.status(500).json({ error: "Failed to generate security code" });
    }
  });

  // 2. Verify OTP 2FA Code
  app.post("/api/auth/verify-otp", (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP code are required" });
    }

    const record = otpStore.get(email.toLowerCase());
    if (!record) {
      return res.status(400).json({ error: "No verification code was requested for this email or it has expired" });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({ error: "Your verification code has expired (valid for 5 mins). Please request a new one." });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Incorrect verification code. Please check and try again." });
    }

    // Success! Consume code
    otpStore.delete(email.toLowerCase());
    res.json({ success: true });
  });

  // 3. REGISTRATION FLOW - Initialize Verification
  app.post("/api/auth/register-init", async (req, res) => {
    const { email, phone, businessName, ownerName, password, role } = req.body;
    if (!email || !phone || !businessName || !ownerName || !password) {
      return res.status(400).json({ error: "All registration fields are required" });
    }

    const emailLower = email.toLowerCase();

    // Check if email already registered in users or staff
    try {
      const existingUser = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
      const existingStaff = await db.select().from(staff).where(eq(staff.email, emailLower)).limit(1);
      if (existingUser.length > 0 || existingStaff.length > 0) {
        return res.status(400).json({ error: "This email is already registered." });
      }
    } catch (err: any) {
      console.warn("Error checking existing registration email:", err.message);
    }

    const token = crypto.randomBytes(16).toString("hex");
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = Date.now() + 3 * 60 * 1000; // 3-minute OTP countdown

    pendingRegistrations.set(emailLower, {
      token,
      emailVerified: false,
      otp,
      otpExpiresAt,
      businessName,
      ownerName,
      phone,
      password,
      role: role || 'Manager/Owner'
    });

    const host = req.get("host") || "localhost:3000";
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const verificationLink = `${protocol}://${host}/api/auth/verify-link?email=${encodeURIComponent(emailLower)}&token=${token}`;

    console.log(`[Registration Engine] Initiated for: ${emailLower}. Token: ${token}, OTP: ${otp}`);
    console.log(`[Registration Link] Link: ${verificationLink}`);

    const emailSubject = "Verify Your Business Registration - Seller Partner Portal";
    const emailBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 20px; border: 1px solid #1e293b; color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px;">🏪</span>
          <h2 style="color: #6366f1; margin: 10px 0 0 0; font-size: 24px; font-weight: 800;">Seller Partner Portal</h2>
        </div>
        <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px;">
          Hello <strong>${ownerName}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
          Thank you for registering <strong>${businessName}</strong>. To secure your account and proceed with registration, please click the verification button below:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationLink}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4); transition: background-color 0.2s;">
            Verify Email Address ✓
          </a>
        </div>
        <p style="font-size: 13px; line-height: 1.6; color: #94a3b8; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px;">
          If the button above does not work, copy and paste this link in your browser:
          <br/>
          <a href="${verificationLink}" style="color: #818cf8; word-break: break-all;">${verificationLink}</a>
        </p>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 40px;">
          This link is highly secure and valid only for your active registration session.
        </p>
      </div>
    `;

    try {
      const emailSent = await sendSystemEmail(emailLower, emailSubject, emailBody);
      res.json({
        success: true,
        email: emailLower,
        localBypassLink: !emailSent ? verificationLink : null,
        localBypassOtp: !emailSent ? otp : null
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to dispatch email verification link. " + err.message });
    }
  });

  // 4. Poll Email Verification Status
  app.get("/api/auth/check-verification", (req, res) => {
    const email = (req.query.email as string || '').toLowerCase();
    const reg = pendingRegistrations.get(email);
    if (!reg) {
      return res.status(404).json({ error: "Registration session not found or expired" });
    }
    res.json({ verified: reg.emailVerified });
  });

  // 5. GET Verification Link Action clicked in email
  app.get("/api/auth/verify-link", async (req, res) => {
    const email = (req.query.email as string || '').toLowerCase();
    const token = req.query.token as string || '';
    const reg = pendingRegistrations.get(email);

    if (!reg || reg.token !== token) {
      return res.send(`
        <html>
          <head>
            <title>Verification Error</title>
            <style>
              body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0a0a0a; color: #f8fafc; }
              .card { background-color: #0f172a; padding: 40px; border-radius: 20px; border: 1px solid #1e293b; text-align: center; max-width: 440px; }
              h2 { color: #f43f5e; margin: 0 0 12px 0; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>⚠️ Invalid or Expired Verification Link</h2>
              <p>The security token is invalid or the registration session has expired. Please return to the portal and register again.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Update state to Verified
    reg.emailVerified = true;

    // Send 6-Digit OTP via Gmail SMTP instantly
    const otpSubject = "Your Security Verification OTP Code";
    const otpBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 20px; border: 1px solid #1e293b; color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px;">🛡️</span>
          <h2 style="color: #6366f1; margin: 10px 0 0 0; font-size: 24px; font-weight: 800;">Email Verified Successfully!</h2>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px;">
          Hi <strong>${reg.ownerName}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
          Your email address has been successfully verified! Please enter the 6-digit OTP security code below in your registration terminal screen to complete your registration:
        </p>
        <div style="background-color: #020617; padding: 24px; border-radius: 16px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f59e0b; margin: 28px 0; border: 1px solid #1e293b; font-family: monospace;">
          ${reg.otp}
        </div>
        <p style="color: #ef4444; font-size: 13px; text-align: center; font-weight: 600;">
          ⚠️ This code is valid for exactly 3 minutes.
        </p>
      </div>
    `;

    try {
      await sendSystemEmail(email, otpSubject, otpBody);
    } catch (smtpErr) {
      console.error("[SMTP OTP dispatch failed during verification]", smtpErr);
    }

    res.send(`
      <html>
        <head>
          <title>Email Verification Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background-color: #0f172a; border: 1px solid #1e293b; padding: 50px 40px; border-radius: 24px; text-align: center; max-width: 480px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
            .badge { display: inline-block; background-color: #065f46; color: #34d399; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px; }
            h2 { margin: 0 0 16px 0; font-size: 26px; font-weight: 800; color: #38bdf8; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 30px; }
            .instruction { background-color: #020617; border: 1px solid #1e293b; padding: 12px 20px; border-radius: 12px; color: #fbbf24; font-size: 13px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">Verified ✓</span>
            <h2>Email Verification Successful</h2>
            <p>Your email address has been successfully verified! A 6-digit OTP security code has been transmitted to your email inbox. Please go back to your registration terminal screen to input the code and complete registration.</p>
            <div class="instruction">ℹ️ Please do not close your original registration terminal tab.</div>
          </div>
        </body>
      </html>
    `);
  });

  // 6. Verify Registration OTP and Complete
  app.post("/api/auth/register-verify-otp", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP code are required" });
    }

    const emailLower = email.toLowerCase();
    const reg = pendingRegistrations.get(emailLower);
    if (!reg) {
      return res.status(400).json({ error: "Registration session has expired or was not found. Please try again." });
    }

    if (Date.now() > reg.otpExpiresAt) {
      pendingRegistrations.delete(emailLower);
      return res.status(400).json({ error: "This OTP verification code has expired (valid for 3 minutes). Please try registering again." });
    }

    if (reg.otp !== otp) {
      return res.status(400).json({ error: "Incorrect verification PIN. Please verify your email inbox and try again." });
    }

    // Complete Registration Success
    pendingRegistrations.delete(emailLower);

    // Save to the correct table based on role
    try {
      const isStaffRole = reg.role === 'Staff';
      if (isStaffRole) {
        const existing = await db.select().from(staff).where(eq(staff.email, emailLower)).limit(1);
        if (existing.length > 0) {
          await db.update(staff).set({
            name: reg.ownerName,
            role: reg.role || 'Staff',
            phone: reg.phone,
            businessName: reg.businessName,
            password: reg.password,
            updatedAt: new Date()
          }).where(eq(staff.id, existing[0].id));
        } else {
          const uid = `stf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(staff).values({
            uid,
            email: emailLower,
            name: reg.ownerName,
            role: reg.role || 'Staff',
            phone: reg.phone,
            businessName: reg.businessName,
            password: reg.password,
            pin: '1234', // Default placeholder PIN
            status: 'active'
          });
        }
        console.log(`[Database] Staff registered/updated in staff table: ${emailLower}`);
      } else {
        const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
        if (existing.length > 0) {
          await db.update(users).set({
            name: reg.ownerName,
            role: reg.role || 'Manager/Owner',
            phone: reg.phone,
            businessName: reg.businessName,
            password: reg.password,
            updatedAt: new Date()
          }).where(eq(users.id, existing[0].id));
        } else {
          const uid = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(users).values({
            uid,
            email: emailLower,
            name: reg.ownerName,
            role: reg.role || 'Manager/Owner',
            phone: reg.phone,
            businessName: reg.businessName,
            password: reg.password,
          });
        }
        console.log(`[Database] Manager/Owner registered/updated in users table: ${emailLower}`);
      }
    } catch (dbErr: any) {
      console.error(`[Database Error] Failed to persist registered user:`, dbErr.message);
    }

    res.json({
      success: true,
      seller: {
        email: emailLower,
        phone: reg.phone,
        businessName: reg.businessName,
        ownerName: reg.ownerName,
        password: reg.password,
        role: reg.role || 'Manager/Owner'
      }
    });
  });

  // 7. FORGOT PASSWORD - Request OTP Code
  app.post("/api/auth/forgot-password-otp", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email address is required" });
    }

    const emailLower = email.toLowerCase();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = Date.now() + 3 * 60 * 1000; // 3-minute OTP countdown

    forgotPasswordStore.set(emailLower, {
      otp,
      otpExpiresAt,
      otpVerified: false
    });

    console.log(`[Forgot Password OTP] Generated code [ ${otp} ] for user: ${emailLower}`);

    const emailSubject = "Your Password Recovery OTP Code - Seller Partner Portal";
    const emailBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 20px; border: 1px solid #1e293b; color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px;">🔑</span>
          <h2 style="color: #ef4444; margin: 10px 0 0 0; font-size: 24px; font-weight: 800;">Password Recovery</h2>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px;">
          Hello,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
          We received a request to reset the password for your Seller Partner account. Please use the following 6-digit OTP code to verify your identity:
        </p>
        <div style="background-color: #020617; padding: 24px; border-radius: 16px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f59e0b; margin: 28px 0; border: 1px solid #1e293b; font-family: monospace;">
          ${otp}
        </div>
        <p style="color: #ef4444; font-size: 13px; text-align: center; font-weight: 600;">
          ⚠️ This code is valid for exactly 3 minutes.
        </p>
        <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px;">
          If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `;

    try {
      const emailSent = await sendSystemEmail(emailLower, emailSubject, emailBody);
      res.json({
        success: true,
        email: emailLower,
        localBypassOtp: !emailSent ? otp : null
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to dispatch password recovery OTP. " + err.message });
    }
  });

  // 8. FORGOT PASSWORD - Verify OTP
  app.post("/api/auth/forgot-verify-otp", (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP code are required" });
    }

    const emailLower = email.toLowerCase();
    const record = forgotPasswordStore.get(emailLower);
    if (!record) {
      return res.status(400).json({ error: "No active recovery session was found for this email address" });
    }

    if (Date.now() > record.otpExpiresAt) {
      forgotPasswordStore.delete(emailLower);
      return res.status(400).json({ error: "Your OTP recovery code has expired (valid for 3 minutes). Please request a new code." });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Incorrect OTP code. Please check your email inbox and try again." });
    }

    record.otpVerified = true;
    res.json({ success: true });
  });

  // 9. FORGOT PASSWORD - Save New Password
  app.post("/api/auth/reset-password-save", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and new password are required" });
    }

    const emailLower = email.toLowerCase();
    const record = forgotPasswordStore.get(emailLower);
    if (!record || !record.otpVerified) {
      return res.status(400).json({ error: "Unauthorized password reset attempt. Please complete OTP verification first." });
    }

    forgotPasswordStore.delete(emailLower);

    try {
      // Update in users table
      await db.update(users)
        .set({ password, updatedAt: new Date() })
        .where(eq(users.email, emailLower));

      // Update in staff table
      await db.update(staff)
        .set({ password, updatedAt: new Date() })
        .where(eq(staff.email, emailLower));

      console.log(`[Database] Seller password successfully updated in database: ${emailLower}`);
      res.json({ success: true, message: "Password updated successfully!" });
    } catch (dbErr: any) {
      console.error("[Database Error] Could not update seller password:", dbErr.message);
      res.status(500).json({ error: "Database error updating password" });
    }
  });

  // 10. GET ALL REGISTERED SELLERS (Sync with client local state)
  app.get("/api/auth/sellers", async (req, res) => {
    try {
      const allUsers = await db.select().from(users);
      const allStaff = await db.select().from(staff);

      const combinedSellers: any[] = [];

      // Add registered users (Managers) who have a password set
      for (const u of allUsers) {
        if (u.password) {
          combinedSellers.push({
            email: u.email,
            phone: u.phone,
            businessName: u.businessName,
            ownerName: u.name,
            password: u.password,
            role: u.role || 'Manager/Owner',
            photoUrl: u.photoUrl
          });
        }
      }

      // Add registered staff who have a password set
      for (const s of allStaff) {
        if (s.password && s.email) {
          combinedSellers.push({
            email: s.email,
            phone: s.phone,
            businessName: s.businessName,
            ownerName: s.name,
            password: s.password,
            role: s.role || 'Staff',
            photoUrl: s.photoUrl
          });
        }
      }

      res.json({ success: true, sellers: combinedSellers });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch registered sellers: " + err.message });
    }
  });

  // 11. UPDATE SELLER PROFILE PICTURE
  app.post("/api/auth/update-profile-picture", async (req, res) => {
    const { email, photoUrl } = req.body;
    if (!email || !photoUrl) {
      return res.status(400).json({ error: "Email and photoUrl are required" });
    }
    try {
      // Update in users table
      await db.update(users)
        .set({ photoUrl, updatedAt: new Date() })
        .where(eq(users.email, email.toLowerCase()));

      // Update in staff table
      await db.update(staff)
        .set({ photoUrl, updatedAt: new Date() })
        .where(eq(staff.email, email.toLowerCase()));

      console.log(`[Database] Profile picture updated for seller: ${email}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update profile picture: " + err.message });
    }
  });

  // =============================================================
  // PUBLIC INTEGRATION ENDPOINTS FOR CUSTOMER AND ADMIN MODULES
  // =============================================================

  // 1. GET /api/public/products - Customer App loads menu items
  app.get("/api/public/products", async (req, res) => {
    try {
      const items = await db.select().from(menuItems).where(eq(menuItems.status, "active"));
      res.json(items.map(item => ({
        ...item,
        price: parseFloat(item.price),
        ingredients: item.ingredientsJson ? JSON.parse(item.ingredientsJson) : [],
        allergens: item.allergensJson ? JSON.parse(item.allergensJson) : [],
      })));
    } catch (error: any) {
      console.error("Error fetching public products:", error);
      res.status(500).json({ error: error.message || "Failed to fetch products" });
    }
  });

  // 2. POST /api/public/orders - Customer checkout places order directly to Seller
  app.post("/api/public/orders", async (req, res) => {
    try {
      const {
        customerName,
        customerPhone,
        deliveryAddress,
        items, // array of { id, name, qty, price }
        paymentMethod = "cash",
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing or empty order items" });
      }

      // Calculate order total
      let total = 0;
      for (const item of items) {
        total += Number(item.price) * Number(item.qty);
      }

      const orderId = crypto.randomUUID();
      const orderNumber = `ORD-${Date.now().toString().slice(-4)}`;

      const newOrder = await db.insert(orders).values({
        id: orderId,
        orderNumber,
        customerName: customerName || "Online Customer",
        customerPhone: customerPhone || null,
        deliveryAddress: deliveryAddress || null,
        itemsJson: JSON.stringify(items),
        totalAmount: String(total),
        paymentStatus: "unpaid",
        paymentMethod: paymentMethod,
        orderStatus: "received",
        actionBy: "Online Order",
        stockReduced: false,
      }).returning();

      res.status(201).json({
        success: true,
        order: {
          ...newOrder[0],
          totalAmount: parseFloat(newOrder[0].totalAmount),
          items: JSON.parse(newOrder[0].itemsJson),
        }
      });
    } catch (error: any) {
      console.error("Error placing public order:", error);
      res.status(500).json({ error: error.message || "Failed to place order" });
    }
  });

  // 3. GET /api/public/orders/:id - Customer / Admin retrieve details of a specific order
  app.get("/api/public/orders/:id", async (req, res) => {
    try {
      const result = await db.select().from(orders).where(eq(orders.id, req.params.id));
      if (result.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json({
        ...result[0],
        totalAmount: parseFloat(result[0].totalAmount),
        items: JSON.parse(result[0].itemsJson),
      });
    } catch (error: any) {
      console.error("Error fetching specific order:", error);
      res.status(500).json({ error: error.message || "Failed to retrieve order" });
    }
  });

  // 4. GET /api/public/orders - Admin retrieves all orders
  app.get("/api/public/orders", async (req, res) => {
    try {
      const results = await db.select().from(orders);
      res.json(results.map(o => ({
        ...o,
        totalAmount: parseFloat(o.totalAmount),
        items: JSON.parse(o.itemsJson),
      })));
    } catch (error: any) {
      console.error("Error listing public orders:", error);
      res.status(500).json({ error: error.message || "Failed to list orders" });
    }
  });

  // 5. GET /api/public/stats - Admin retrieves general store sales performance and stats
  app.get("/api/public/stats", async (req, res) => {
    try {
      const dbOrders = await db.select().from(orders);
      const totalOrdersCount = dbOrders.length;
      let totalSales = 0;
      for (const order of dbOrders) {
        if (order.orderStatus === "completed") {
          totalSales += Number(order.totalAmount);
        }
      }
      res.json({
        totalOrdersCount,
        totalSales,
        averageOrderValue: totalOrdersCount > 0 ? (totalSales / totalOrdersCount) : 0,
      });
    } catch (error: any) {
      console.error("Error generating stats:", error);
      res.status(500).json({ error: error.message || "Failed to generate statistics" });
    }
  });

  // Public/Local bi-directional sync - no Firebase authorization required (for local/employee/PIN sessions)
  app.post("/api/public/sync", async (req, res) => {
    try {
      const {
        clientMenuItems = [],
        clientStaff = [],
        clientOrders = [],
        clientAuditLogs = [],
      } = req.body;

      // 1. MENU ITEMS SYNC
      const dbMenuItems = await db.select().from(menuItems);
      const menuItemMap = new Map<string, any>(dbMenuItems.map(item => [item.id, item]));

      for (const clientItem of clientMenuItems) {
        const serverItem = menuItemMap.get(clientItem.id);
        const clientUpdated = new Date(clientItem.updatedAt || 0).getTime();

        if (!serverItem) {
          await db.insert(menuItems).values({
            id: clientItem.id,
            name: clientItem.name,
            category: clientItem.category,
            price: String(clientItem.price),
            inventoryQty: clientItem.inventoryQty,
            sku: clientItem.sku || null,
            status: clientItem.status || "active",
            updatedAt: new Date(clientItem.updatedAt),
            ingredientsJson: clientItem.ingredients ? JSON.stringify(clientItem.ingredients) : null,
            allergensJson: clientItem.allergens ? JSON.stringify(clientItem.allergens) : null,
            image: clientItem.image || null,
          });
        } else {
          const serverUpdated = new Date(serverItem.updatedAt || 0).getTime();
          if (clientUpdated > serverUpdated) {
            await db.update(menuItems)
              .set({
                name: clientItem.name,
                category: clientItem.category,
                price: String(clientItem.price),
                inventoryQty: clientItem.inventoryQty,
                sku: clientItem.sku || null,
                status: clientItem.status || "active",
                updatedAt: new Date(clientItem.updatedAt),
                ingredientsJson: clientItem.ingredients ? JSON.stringify(clientItem.ingredients) : null,
                allergensJson: clientItem.allergens ? JSON.stringify(clientItem.allergens) : null,
                image: clientItem.image || null,
              })
              .where(eq(menuItems.id, clientItem.id));
          }
        }
      }

      // 2. STAFF SYNC
      const dbStaff = await db.select().from(staff);
      const staffMap = new Map<string, any>(dbStaff.map(member => [member.uid, member]));

      for (const clientMember of clientStaff) {
        const serverMember = staffMap.get(clientMember.uid);
        const clientUpdated = new Date(clientMember.updatedAt || 0).getTime();

        if (!serverMember) {
          await db.insert(staff).values({
            uid: clientMember.uid,
            name: clientMember.name,
            pin: clientMember.pin,
            role: clientMember.role || "Staff",
            status: clientMember.status || "active",
            photoUrl: clientMember.photoUrl || null,
            updatedAt: new Date(clientMember.updatedAt || Date.now()),
          });
        } else {
          const serverUpdated = new Date(serverMember.updatedAt || 0).getTime();
          if (clientUpdated > serverUpdated) {
            await db.update(staff)
              .set({
                name: clientMember.name,
                pin: clientMember.pin,
                role: clientMember.role || "Staff",
                status: clientMember.status || "active",
                photoUrl: clientMember.photoUrl || serverMember.photoUrl,
                updatedAt: new Date(clientMember.updatedAt),
              })
              .where(eq(staff.uid, clientMember.uid));
          }
        }
      }

      // 3. ORDERS SYNC
      const dbOrders = await db.select().from(orders);
      const ordersMap = new Map<string, any>(dbOrders.map(order => [order.id, order]));

      for (const clientOrder of clientOrders) {
        const serverOrder = ordersMap.get(clientOrder.id);
        const clientUpdated = new Date(clientOrder.updatedAt || 0).getTime();

        if (!serverOrder) {
          await db.insert(orders).values({
            id: clientOrder.id,
            orderNumber: clientOrder.orderNumber,
            customerName: clientOrder.customerName || null,
            customerPhone: clientOrder.customerPhone || null,
            deliveryAddress: clientOrder.deliveryAddress || null,
            itemsJson: JSON.stringify(clientOrder.items),
            totalAmount: String(clientOrder.totalAmount),
            paymentStatus: clientOrder.paymentStatus || "unpaid",
            paymentMethod: clientOrder.paymentMethod || "cash",
            orderStatus: clientOrder.orderStatus || "received",
            actionBy: clientOrder.actionBy || "System",
            stockReduced: clientOrder.stockReduced || false,
            createdAt: new Date(clientOrder.createdAt),
            updatedAt: new Date(clientOrder.updatedAt),
          });
        } else {
          const serverUpdated = new Date(serverOrder.updatedAt || 0).getTime();
          if (clientUpdated > serverUpdated) {
            await db.update(orders)
              .set({
                orderNumber: clientOrder.orderNumber,
                customerName: clientOrder.customerName || null,
                customerPhone: clientOrder.customerPhone || null,
                deliveryAddress: clientOrder.deliveryAddress || null,
                itemsJson: JSON.stringify(clientOrder.items),
                totalAmount: String(clientOrder.totalAmount),
                paymentStatus: clientOrder.paymentStatus || "unpaid",
                paymentMethod: clientOrder.paymentMethod || "cash",
                orderStatus: clientOrder.orderStatus || "received",
                actionBy: clientOrder.actionBy || "System",
                stockReduced: clientOrder.stockReduced || false,
                updatedAt: new Date(clientOrder.updatedAt),
              })
              .where(eq(orders.id, clientOrder.id));
          }
        }
      }

      // 4. AUDIT LOGS SYNC
      const dbAuditLogs = await db.select().from(auditLogs);
      const logsMap = new Map(dbAuditLogs.map(log => [log.id, log]));

      for (const clientLog of clientAuditLogs) {
        const serverLog = logsMap.get(clientLog.id);
        if (!serverLog) {
          await db.insert(auditLogs).values({
            id: clientLog.id,
            employeeName: clientLog.employeeName,
            role: clientLog.role,
            action: clientLog.action,
            timestamp: new Date(clientLog.timestamp),
          });
        }
      }

      // Fetch consolidated latest status to return to client
      const finalMenuItems = await db.select().from(menuItems);
      const finalStaff = await db.select().from(staff);
      const finalOrders = await db.select().from(orders);
      const finalAuditLogs = await db.select().from(auditLogs);

      res.json({
        success: true,
        menuItems: finalMenuItems.map(item => ({
          ...item,
          price: parseFloat(item.price),
          ingredients: item.ingredientsJson ? JSON.parse(item.ingredientsJson) : [],
          allergens: item.allergensJson ? JSON.parse(item.allergensJson) : [],
        })),
        staff: finalStaff,
        orders: finalOrders.map(order => ({
          ...order,
          price: parseFloat(order.totalAmount),
          totalAmount: parseFloat(order.totalAmount),
          items: JSON.parse(order.itemsJson),
        })),
        auditLogs: finalAuditLogs,
        serverTime: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Critical error in public sync:", error);
      res.status(500).json({ error: error.message || "Failed to finalize local synchronization" });
    }
  });

  // Public/Local operations replay sync - no Firebase authorization required
  app.post("/api/public/sync/operations", async (req, res) => {
    try {
      const { operations = [] } = req.body;
      if (!Array.isArray(operations)) {
        return res.status(400).json({ error: "Invalid operations payload" });
      }

      console.log(`[SyncEngine] Processing ${operations.length} public queued offline operations.`);

      for (const op of operations) {
        const { type, payload } = op;
        if (!payload) continue;

        try {
          if (type === 'CREATE_PRODUCT' || type === 'UPDATE_PRODUCT') {
            await db.insert(menuItems).values({
              id: payload.id,
              name: payload.name,
              category: payload.category,
              price: String(payload.price),
              inventoryQty: Number(payload.inventoryQty),
              sku: payload.sku || null,
              status: payload.status || "active",
              updatedAt: new Date(payload.updatedAt || Date.now()),
              ingredientsJson: payload.ingredients ? JSON.stringify(payload.ingredients) : null,
              allergensJson: payload.allergens ? JSON.stringify(payload.allergens) : null,
              image: payload.image || null,
            }).onConflictDoUpdate({
              target: menuItems.id,
              set: {
                name: payload.name,
                category: payload.category,
                price: String(payload.price),
                inventoryQty: Number(payload.inventoryQty),
                sku: payload.sku || null,
                status: payload.status || "active",
                updatedAt: new Date(payload.updatedAt || Date.now()),
                ingredientsJson: payload.ingredients ? JSON.stringify(payload.ingredients) : null,
                allergensJson: payload.allergens ? JSON.stringify(payload.allergens) : null,
                image: payload.image || null,
              }
            });
          } else if (type === 'DELETE_PRODUCT') {
            await db.delete(menuItems).where(eq(menuItems.id, payload.id));
          } else if (type === 'CREATE_ORDER' || type === 'UPDATE_ORDER') {
            await db.insert(orders).values({
              id: payload.id,
              orderNumber: payload.orderNumber,
              customerName: payload.customerName || null,
              customerPhone: payload.customerPhone || null,
              deliveryAddress: payload.deliveryAddress || null,
              itemsJson: JSON.stringify(payload.items),
              totalAmount: String(payload.totalAmount),
              paymentStatus: payload.paymentStatus || "unpaid",
              paymentMethod: payload.paymentMethod || "cash",
              orderStatus: payload.orderStatus || "received",
              actionBy: payload.actionBy || "System",
              stockReduced: payload.stockReduced || false,
              createdAt: new Date(payload.createdAt || Date.now()),
              updatedAt: new Date(payload.updatedAt || Date.now()),
            }).onConflictDoUpdate({
              target: orders.id,
              set: {
                orderNumber: payload.orderNumber,
                customerName: payload.customerName || null,
                customerPhone: payload.customerPhone || null,
                deliveryAddress: payload.deliveryAddress || null,
                itemsJson: JSON.stringify(payload.items),
                totalAmount: String(payload.totalAmount),
                paymentStatus: payload.paymentStatus || "unpaid",
                paymentMethod: payload.paymentMethod || "cash",
                orderStatus: payload.orderStatus || "received",
                actionBy: payload.actionBy || "System",
                stockReduced: payload.stockReduced || false,
                updatedAt: new Date(payload.updatedAt || Date.now()),
              }
            });
          }
        } catch (opError: any) {
          console.error(`Error processing public individual operation ${op.id} (${type}):`, opError);
        }
      }

      res.json({ success: true, processedCount: operations.length });
    } catch (error: any) {
      console.error("Critical error in public operations sync:", error);
      res.status(500).json({ error: error.message || "Failed to sync queued operations" });
    }
  });

  // Register Google Authed Manager inside PostgreSQL
  app.post("/api/register", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email;
      const name = req.user?.name || email?.split("@")[0] || "Manager";

      if (!uid || !email) {
        return res.status(400).json({ error: "Missing identity credentials" });
      }

      // Upsert user
      const result = await db.insert(users)
        .values({
          uid,
          email,
          name,
          role: "Manager",
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email,
            name,
          },
        })
        .returning();

      res.json({ success: true, user: result[0] });
    } catch (error: any) {
      console.error("Error in user registration:", error);
      res.status(500).json({ error: error.message || "Failed to register user" });
    }
  });

  // Bi-directional Consolidated Offline-First Sync Endpoint
  app.post("/api/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        clientMenuItems = [],
        clientStaff = [],
        clientOrders = [],
        clientAuditLogs = [],
      } = req.body;

      // -------------------------------------------------------------
      // 1. MENU ITEMS SYNC
      // -------------------------------------------------------------
      const dbMenuItems = await db.select().from(menuItems);
      const menuItemMap = new Map<string, any>(dbMenuItems.map(item => [item.id, item]));

      for (const clientItem of clientMenuItems) {
        const serverItem = menuItemMap.get(clientItem.id);
        const clientUpdated = new Date(clientItem.updatedAt || 0).getTime();

        if (!serverItem) {
          // New menu item from client (offline-created)
          await db.insert(menuItems).values({
            id: clientItem.id,
            name: clientItem.name,
            category: clientItem.category,
            price: String(clientItem.price),
            inventoryQty: clientItem.inventoryQty,
            sku: clientItem.sku || null,
            status: clientItem.status || "active",
            updatedAt: new Date(clientItem.updatedAt),
            ingredientsJson: clientItem.ingredients ? JSON.stringify(clientItem.ingredients) : null,
            allergensJson: clientItem.allergens ? JSON.stringify(clientItem.allergens) : null,
            image: clientItem.image || null,
          });
        } else {
          // Conflict Resolution: Last-Write-Wins based on updatedAt timestamp
          const serverUpdated = new Date(serverItem.updatedAt || 0).getTime();
          if (clientUpdated > serverUpdated) {
            await db.update(menuItems)
              .set({
                name: clientItem.name,
                category: clientItem.category,
                price: String(clientItem.price),
                inventoryQty: clientItem.inventoryQty,
                sku: clientItem.sku || null,
                status: clientItem.status || "active",
                updatedAt: new Date(clientItem.updatedAt),
                ingredientsJson: clientItem.ingredients ? JSON.stringify(clientItem.ingredients) : null,
                allergensJson: clientItem.allergens ? JSON.stringify(clientItem.allergens) : null,
                image: clientItem.image || null,
              })
              .where(eq(menuItems.id, clientItem.id));
          }
        }
      }

      // -------------------------------------------------------------
      // 2. STAFF SYNC
      // -------------------------------------------------------------
      const dbStaff = await db.select().from(staff);
      const staffMap = new Map<string, any>(dbStaff.map(member => [member.uid, member]));

      for (const clientMember of clientStaff) {
        const serverMember = staffMap.get(clientMember.uid);
        const clientUpdated = new Date(clientMember.updatedAt || 0).getTime();

        if (!serverMember) {
          await db.insert(staff).values({
            uid: clientMember.uid,
            name: clientMember.name,
            pin: clientMember.pin,
            role: clientMember.role || "Staff",
            status: clientMember.status || "active",
            photoUrl: clientMember.photoUrl || null,
            updatedAt: new Date(clientMember.updatedAt || Date.now()),
          });
        } else {
          const serverUpdated = new Date(serverMember.updatedAt || 0).getTime();
          if (clientUpdated > serverUpdated) {
            await db.update(staff)
              .set({
                name: clientMember.name,
                pin: clientMember.pin,
                role: clientMember.role || "Staff",
                status: clientMember.status || "active",
                photoUrl: clientMember.photoUrl || serverMember.photoUrl,
                updatedAt: new Date(clientMember.updatedAt),
              })
              .where(eq(staff.uid, clientMember.uid));
          }
        }
      }

      // -------------------------------------------------------------
      // 3. ORDERS SYNC
      // -------------------------------------------------------------
      const dbOrders = await db.select().from(orders);
      const ordersMap = new Map<string, any>(dbOrders.map(order => [order.id, order]));

      for (const clientOrder of clientOrders) {
        const serverOrder = ordersMap.get(clientOrder.id);
        const clientUpdated = new Date(clientOrder.updatedAt || 0).getTime();

        if (!serverOrder) {
          await db.insert(orders).values({
            id: clientOrder.id,
            orderNumber: clientOrder.orderNumber,
            customerName: clientOrder.customerName || null,
            customerPhone: clientOrder.customerPhone || null,
            deliveryAddress: clientOrder.deliveryAddress || null,
            itemsJson: JSON.stringify(clientOrder.items),
            totalAmount: String(clientOrder.totalAmount),
            paymentStatus: clientOrder.paymentStatus || "unpaid",
            paymentMethod: clientOrder.paymentMethod || "cash",
            orderStatus: clientOrder.orderStatus || "received",
            actionBy: clientOrder.actionBy || "System",
            stockReduced: clientOrder.stockReduced || false,
            createdAt: new Date(clientOrder.createdAt),
            updatedAt: new Date(clientOrder.updatedAt),
          });
        } else {
          const serverUpdated = new Date(serverOrder.updatedAt || 0).getTime();
          if (clientUpdated > serverUpdated) {
            await db.update(orders)
              .set({
                orderNumber: clientOrder.orderNumber,
                customerName: clientOrder.customerName || null,
                customerPhone: clientOrder.customerPhone || null,
                deliveryAddress: clientOrder.deliveryAddress || null,
                itemsJson: JSON.stringify(clientOrder.items),
                totalAmount: String(clientOrder.totalAmount),
                paymentStatus: clientOrder.paymentStatus || "unpaid",
                paymentMethod: clientOrder.paymentMethod || "cash",
                orderStatus: clientOrder.orderStatus || "received",
                actionBy: clientOrder.actionBy || "System",
                stockReduced: clientOrder.stockReduced || false,
                updatedAt: new Date(clientOrder.updatedAt),
              })
              .where(eq(orders.id, clientOrder.id));
          }
        }
      }

      // -------------------------------------------------------------
      // 4. AUDIT LOGS SYNC
      // -------------------------------------------------------------
      const dbAuditLogs = await db.select().from(auditLogs);
      const logsMap = new Map(dbAuditLogs.map(log => [log.id, log]));

      for (const clientLog of clientAuditLogs) {
        const serverLog = logsMap.get(clientLog.id);
        if (!serverLog) {
          await db.insert(auditLogs).values({
            id: clientLog.id,
            employeeName: clientLog.employeeName,
            role: clientLog.role,
            action: clientLog.action,
            timestamp: new Date(clientLog.timestamp),
          });
        }
      }

      // Fetch consolidated latest status to return to client
      const finalMenuItems = await db.select().from(menuItems);
      const finalStaff = await db.select().from(staff);
      const finalOrders = await db.select().from(orders);
      const finalAuditLogs = await db.select().from(auditLogs);

      res.json({
        success: true,
        menuItems: finalMenuItems.map(item => ({
          ...item,
          price: parseFloat(item.price),
          ingredients: item.ingredientsJson ? JSON.parse(item.ingredientsJson) : [],
          allergens: item.allergensJson ? JSON.parse(item.allergensJson) : [],
        })),
        staff: finalStaff,
        orders: finalOrders.map(order => ({
          ...order,
          price: parseFloat(order.totalAmount), // helper
          totalAmount: parseFloat(order.totalAmount),
          items: JSON.parse(order.itemsJson),
        })),
        auditLogs: finalAuditLogs,
        serverTime: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Critical error in sync operations:", error);
      res.status(500).json({ error: error.message || "Failed to finalize cloud synchronization" });
    }
  });

  // Transactional sync endpoint for queuing/replaying operations
  app.post("/api/sync/operations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { operations = [] } = req.body;

      if (!Array.isArray(operations)) {
        return res.status(400).json({ error: "Invalid operations payload" });
      }

      console.log(`[SyncEngine] Processing ${operations.length} queued offline operations.`);

      // Process operations in order (preserving FIFO queue history)
      for (const op of operations) {
        const { type, payload } = op;
        if (!payload) continue;

        try {
          if (type === 'CREATE_PRODUCT' || type === 'UPDATE_PRODUCT') {
            await db.insert(menuItems).values({
              id: payload.id,
              name: payload.name,
              category: payload.category,
              price: String(payload.price),
              inventoryQty: Number(payload.inventoryQty),
              sku: payload.sku || null,
              status: payload.status || "active",
              updatedAt: new Date(payload.updatedAt || Date.now()),
              ingredientsJson: payload.ingredients ? JSON.stringify(payload.ingredients) : null,
              allergensJson: payload.allergens ? JSON.stringify(payload.allergens) : null,
              image: payload.image || null,
            }).onConflictDoUpdate({
              target: menuItems.id,
              set: {
                name: payload.name,
                category: payload.category,
                price: String(payload.price),
                inventoryQty: Number(payload.inventoryQty),
                sku: payload.sku || null,
                status: payload.status || "active",
                updatedAt: new Date(payload.updatedAt || Date.now()),
                ingredientsJson: payload.ingredients ? JSON.stringify(payload.ingredients) : null,
                allergensJson: payload.allergens ? JSON.stringify(payload.allergens) : null,
                image: payload.image || null,
              }
            });
          } else if (type === 'DELETE_PRODUCT') {
            await db.delete(menuItems).where(eq(menuItems.id, payload.id));
          } else if (type === 'CREATE_ORDER' || type === 'UPDATE_ORDER') {
            await db.insert(orders).values({
              id: payload.id,
              orderNumber: payload.orderNumber,
              customerName: payload.customerName || null,
              customerPhone: payload.customerPhone || null,
              deliveryAddress: payload.deliveryAddress || null,
              itemsJson: JSON.stringify(payload.items),
              totalAmount: String(payload.totalAmount),
              paymentStatus: payload.paymentStatus || "unpaid",
              paymentMethod: payload.paymentMethod || "cash",
              orderStatus: payload.orderStatus || "received",
              actionBy: payload.actionBy || "System",
              stockReduced: payload.stockReduced || false,
              createdAt: new Date(payload.createdAt || Date.now()),
              updatedAt: new Date(payload.updatedAt || Date.now()),
            }).onConflictDoUpdate({
              target: orders.id,
              set: {
                orderNumber: payload.orderNumber,
                customerName: payload.customerName || null,
                customerPhone: payload.customerPhone || null,
                deliveryAddress: payload.deliveryAddress || null,
                itemsJson: JSON.stringify(payload.items),
                totalAmount: String(payload.totalAmount),
                paymentStatus: payload.paymentStatus || "unpaid",
                paymentMethod: payload.paymentMethod || "cash",
                orderStatus: payload.orderStatus || "received",
                actionBy: payload.actionBy || "System",
                stockReduced: payload.stockReduced || false,
                updatedAt: new Date(payload.updatedAt || Date.now()),
              }
            });
          }
        } catch (opError: any) {
          console.error(`Error processing individual operation ${op.id} (${type}):`, opError);
          // Continue processing other operations
        }
      }

      res.json({ success: true, processedCount: operations.length });
    } catch (error: any) {
      console.error("Critical error in operations sync:", error);
      res.status(500).json({ error: error.message || "Failed to sync queued operations" });
    }
  });

  // Vite static file server configuration for development and production build routes
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server fully functional. Online at port ${PORT}`);
  });
}

startServer();
