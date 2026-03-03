import nodemailer from 'nodemailer'
import connectDB from '@/lib/db-config'
import { Organization } from '@/models/Organization'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export class EmailService {
  private static instance: EmailService
  private emailConfig: any = null

  private constructor() {}

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService()
    }
    return EmailService.instance
  }

  private async getEmailConfig() {
    if (this.emailConfig) {
      return this.emailConfig
    }

    try {
      await connectDB()
      const organization = await Organization.findOne({})
      
      if (!organization?.emailConfig) {
        throw new Error('Email configuration not found. Please configure email settings first.')
      }

      this.emailConfig = organization.emailConfig
      return this.emailConfig
    } catch (error) {
      console.error('Failed to get email configuration:', error)
      throw new Error('Email service not configured. Please set up email configuration in the admin settings.')
    }
  }

  private createTransporter(config: any) {
    if (config.provider === 'smtp') {
      const port = config.smtp.port || 587
      
      // Port 465 uses direct SSL/TLS (secure: true)
      // Port 587 uses STARTTLS (secure: false, requireTLS: true)
      // Port 25 usually doesn't use encryption (secure: false)
      // Force correct setting based on port to prevent SSL version mismatch
      let useSecure: boolean
      if (port === 465) {
        // Port 465 uses direct SSL/TLS connection
        useSecure = true
      } else {
        // Ports 587, 25, etc. use STARTTLS (upgrade plain connection to TLS)
        useSecure = false
      }
      
      const useStartTLS = !useSecure && port !== 465
      
      const transportConfig: any = {
        host: config.smtp.host,
        port: port,
        secure: useSecure, // false for STARTTLS (port 587), true for direct SSL (port 465)
        auth: {
          user: config.smtp.username,
          pass: config.smtp.password,
        },
        tls: {
          rejectUnauthorized: false,
          // Don't specify ciphers - let Node.js negotiate with server
          // This allows the system to find compatible ciphers automatically
          minVersion: 'TLSv1.2' // Minimum TLS version
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        // STARTTLS configuration (for port 587)
        requireTLS: useStartTLS, // Require TLS upgrade for STARTTLS
        ignoreTLS: false // Don't ignore TLS - upgrade to TLS when available
      }
      
      
      
      return nodemailer.createTransport(transportConfig)
    }
    
    throw new Error(`Unsupported email provider: ${config.provider}`)
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {

    try {
      const config = await this.getEmailConfig()

      const transporter = this.createTransporter(config)

      const fromEmail = config.smtp?.fromEmail || config.azure?.fromEmail
      const fromName = config.smtp?.fromName || config.azure?.fromName


      if (!fromEmail || !fromName) {
        throw new Error('From email and name not configured')
      }

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }

      const result = await transporter.sendMail(mailOptions)

      return true
    } catch (error: any) {
      
      return false
    }
  }

  generateOTPEmail(otp: string, organizationName: string = 'Kanvaro'): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - ${organizationName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            width: 60px;
            height: 60px;
            background: #3b82f6;
            border-radius: 8px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
        }
        .otp-code {
            background: #f1f5f9;
            border: 2px dashed #3b82f6;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
        }
        .otp-number {
            font-size: 32px;
            font-weight: bold;
            color: #3b82f6;
            letter-spacing: 4px;
            font-family: 'Courier New', monospace;
        }
        .warning {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            color: #92400e;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">${organizationName.charAt(0).toUpperCase()}</div>
            <h1>Password Reset Request</h1>
        </div>

        <p>You requested to reset your password for your ${organizationName} account.</p>
        
        <p>Use the following verification code to reset your password:</p>

        <div class="otp-code">
            <div class="otp-number">${otp}</div>
        </div>

        <div class="warning">
            <strong>Important:</strong>
            <ul>
                <li>This code will expire in 10 minutes</li>
                <li>Do not share this code with anyone</li>
                <li>If you didn't request this reset, please ignore this email</li>
            </ul>
        </div>

        <p>Enter this code in the verification form to continue with your password reset.</p>

        <div class="footer">
            <p>This email was sent by ${organizationName}</p>
            <p>If you have any questions, contact your system administrator</p>
        </div>
    </div>
</body>
</html>
    `
  }

  generatePasswordResetConfirmationEmail(organizationName: string = 'Kanvaro'): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Successful - ${organizationName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .success-icon {
            width: 60px;
            height: 60px;
            background: #10b981;
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
        }
        .button {
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="success-icon">✓</div>
            <h1>Password Reset Successful</h1>
        </div>

        <p>Your password has been successfully updated for your ${organizationName} account.</p>
        
        <p>You can now sign in with your new password.</p>

        <div style="text-align: center;">
            <a href="#" class="button">Sign In to Your Account</a>
        </div>

        <div class="footer">
            <p>This email was sent by ${organizationName}</p>
            <p>If you have any questions, contact your system administrator</p>
        </div>
    </div>
</body>
</html>
    `
  }

  generateTaskAssignmentEmail(
    taskTitle: string,
    projectName: string,
    assignedBy: string,
    dueDate?: string,
    organizationName: string = 'Kanvaro'
  ): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Task Assignment - ${organizationName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .task-icon {
            width: 60px;
            height: 60px;
            background: #3b82f6;
            border-radius: 8px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
        }
        .task-details {
            background: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .button {
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="task-icon">T</div>
            <h1>New Task Assignment</h1>
        </div>

        <p>You have been assigned a new task by ${assignedBy}.</p>
        
        <div class="task-details">
            <h3 style="margin-top: 0;">${taskTitle}</h3>
            <p><strong>Project:</strong> ${projectName}</p>
            ${dueDate ? `<p><strong>Due Date:</strong> ${dueDate}</p>` : ''}
        </div>

        <div style="text-align: center;">
            <a href="#" class="button">View Task</a>
        </div>

        <div class="footer">
            <p>This email was sent by ${organizationName}</p>
            <p>You can manage your notification preferences in your account settings</p>
        </div>
    </div>
</body>
</html>
    `
  }

  generateProjectUpdateEmail(
    projectName: string,
    updateType: 'created' | 'updated' | 'deadline_approaching' | 'completed',
    updatedBy: string,
    organizationName: string = 'Kanvaro'
  ): string {
    const updateMessages = {
      created: 'A new project has been created',
      updated: 'A project has been updated',
      deadline_approaching: 'A project deadline is approaching',
      completed: 'A project has been completed'
    }

    const colors = {
      created: '#10b981',
      updated: '#3b82f6',
      deadline_approaching: '#f59e0b',
      completed: '#8b5cf6'
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Update - ${organizationName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .project-icon {
            width: 60px;
            height: 60px;
            background: ${colors[updateType]};
            border-radius: 8px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
        }
        .project-details {
            background: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .button {
            display: inline-block;
            background: ${colors[updateType]};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="project-icon">P</div>
            <h1>${updateMessages[updateType]}</h1>
        </div>

        <p>${updateMessages[updateType]} by ${updatedBy}.</p>
        
        <div class="project-details">
            <h3 style="margin-top: 0;">${projectName}</h3>
        </div>

        <div style="text-align: center;">
            <a href="#" class="button">View Project</a>
        </div>

        <div class="footer">
            <p>This email was sent by ${organizationName}</p>
            <p>You can manage your notification preferences in your account settings</p>
        </div>
    </div>
</body>
</html>
    `
  }

  generateWelcomeEmail(
    firstName: string,
    lastName: string,
    email: string,
    roleDisplayName: string,
    organizationName: string = 'Kanvaro',
    loginUrl?: string
  ): string {
    const fullName = `${firstName} ${lastName}`
    const loginLink = loginUrl || '#'
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ${organizationName}!</title>
    <style>
        body {
            margin: 0;
            padding: 24px 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #111827;
            background-color: #f3f4f6;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .container {
            width: 100%;
            max-width: 640px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            padding: 40px 36px 36px;
            box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
        }
        .header {
            text-align: center;
            margin-bottom: 32px;
        }
        .logo {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            border-radius: 12px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 28px;
            font-weight: bold;
        }
        .welcome-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 50%;
            margin: 0 auto 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 40px;
        }
        h1 {
            color: #111827;
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 12px;
            line-height: 1.2;
        }
        .subtitle {
            color: #6b7280;
            font-size: 16px;
            margin: 0 0 32px;
        }
        .greeting {
            font-size: 18px;
            color: #111827;
            margin-bottom: 24px;
            font-weight: 500;
        }
        .content {
            color: #374151;
            font-size: 16px;
            margin-bottom: 24px;
        }
        .info-box {
            background: #f9fafb;
            border-left: 4px solid #3b82f6;
            border-radius: 6px;
            padding: 20px;
            margin: 24px 0;
        }
        .info-title {
            font-weight: 600;
            color: #111827;
            font-size: 14px;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .info-item {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            font-size: 15px;
        }
        .info-item:last-child {
            margin-bottom: 0;
        }
        .info-icon {
            width: 20px;
            height: 20px;
            margin-right: 12px;
            color: #3b82f6;
            flex-shrink: 0;
        }
        .info-label {
            color: #6b7280;
            font-weight: 500;
            min-width: 100px;
        }
        .info-value {
            color: #111827;
            font-weight: 600;
        }
        .steps-section {
            background: #f0f9ff;
            border-radius: 8px;
            padding: 24px;
            margin: 32px 0;
        }
        .steps-title {
            font-weight: 600;
            color: #0369a1;
            font-size: 16px;
            margin-bottom: 16px;
        }
        .step-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 16px;
            font-size: 15px;
            color: #374151;
        }
        .step-item:last-child {
            margin-bottom: 0;
        }
        .step-number {
            background: #3b82f6;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .cta-section {
            text-align: center;
            margin: 32px 0;
        }
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            padding: 14px 32px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
            transition: all 0.2s;
        }
        .cta-button:hover {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            box-shadow: 0 6px 12px rgba(59, 130, 246, 0.4);
            transform: translateY(-1px);
        }
        .help-section {
            background: #fffbeb;
            border: 1px solid #fbbf24;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
        }
        .help-title {
            font-weight: 600;
            color: #92400e;
            font-size: 15px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
        }
        .help-icon {
            margin-right: 8px;
            font-size: 18px;
        }
        .help-text {
            color: #78350f;
            font-size: 14px;
            margin: 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
        }
        .footer-text {
            color: #6b7280;
            font-size: 14px;
            margin: 8px 0;
            line-height: 1.5;
        }
        .footer-highlight {
            color: #3b82f6;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">${organizationName.charAt(0).toUpperCase()}</div>
            <div class="welcome-icon">👋</div>
            <h1>Welcome to ${organizationName}!</h1>
            <p class="subtitle">We're thrilled to have you join our team</p>
        </div>

        <div class="greeting">
            Hi ${firstName}! 👋
        </div>

        <div class="content">
            <p>Great news! Your account has been successfully created and activated. You're all set to start collaborating with your team and making amazing things happen together.</p>
        </div>

        <div class="info-box">
            <div class="info-title">Your Account Details</div>
            <div class="info-item">
                <span class="info-icon">👤</span>
                <span class="info-label">Name:</span>
                <span class="info-value">${fullName}</span>
            </div>
            <div class="info-item">
                <span class="info-icon">✉️</span>
                <span class="info-label">Email:</span>
                <span class="info-value">${email}</span>
            </div>
            <div class="info-item">
                <span class="info-icon">🎯</span>
                <span class="info-label">Role:</span>
                <span class="info-value">${roleDisplayName}</span>
            </div>
            <div class="info-item">
                <span class="info-icon">🏢</span>
                <span class="info-label">Organization:</span>
                <span class="info-value">${organizationName}</span>
            </div>
        </div>

        <div class="steps-section">
            <div class="steps-title">🚀 Getting Started</div>
            <div class="step-item">
                <div class="step-number">1</div>
                <div>
                    <strong>Sign in to your account</strong><br>
                    Use your email and password to access the platform
                </div>
            </div>
            <div class="step-item">
                <div class="step-number">2</div>
                <div>
                    <strong>Complete your profile</strong><br>
                    Add a profile picture and update your preferences (optional)
                </div>
            </div>
            <div class="step-item">
                <div class="step-number">3</div>
                <div>
                    <strong>Explore the dashboard</strong><br>
                    Get familiar with projects, tasks, and team collaboration tools
                </div>
            </div>
        </div>

        <div class="cta-section">
            <a href="${loginLink}" class="cta-button">Sign In to Your Account →</a>
        </div>

        <div class="help-section">
            <div class="help-title">
                <span class="help-icon">💡</span>
                Need Help?
            </div>
            <p class="help-text">
                If you have any questions or need assistance getting started, don't hesitate to reach out to your administrator or our support team. We're here to help you succeed!
            </p>
        </div>

        <div class="footer">
            <p class="footer-text">
                Welcome aboard! We're excited to see what you'll accomplish with <span class="footer-highlight">${organizationName}</span>.
            </p>
            <p class="footer-text" style="margin-top: 16px;">
                Best regards,<br>
                <strong>The ${organizationName} Team</strong>
            </p>
            <p class="footer-text" style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                This is an automated welcome email. If you have any questions, please contact your administrator.
            </p>
        </div>
    </div>
</body>
</html>
    `
  }

  generateEmailVerificationEmail(
    firstName: string,
    lastName: string,
    email: string,
    roleDisplayName: string,
    organizationName: string = 'Kanvaro',
    verificationUrl: string
  ): string {
    const fullName = `${firstName} ${lastName}`

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email for ${organizationName}</title>
    <style>
        body {
            margin: 0;
            padding: 24px 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #111827;
            background-color: #f3f4f6;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .container {
            width: 100%;
            max-width: 640px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            padding: 40px 36px 36px;
            box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
        }
        .header {
            text-align: center;
            margin-bottom: 32px;
        }
        .logo {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            border-radius: 12px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            font-weight: bold;
            color: white;
        }
        .title {
            font-size: 28px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 8px 0;
        }
        .subtitle {
            font-size: 16px;
            color: #6b7280;
            margin: 0;
        }
        .content {
            margin-bottom: 32px;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            color: #111827;
            margin-bottom: 16px;
        }
        .message {
            font-size: 16px;
            color: #374151;
            margin-bottom: 24px;
            line-height: 1.7;
        }
        .info-section {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 32px;
        }
        .info-item {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        .info-item:last-child {
            margin-bottom: 0;
        }
        .info-icon {
            width: 20px;
            text-align: center;
            flex-shrink: 0;
        }
        .info-label {
            font-weight: 600;
            color: #374151;
            min-width: 100px;
        }
        .info-value {
            color: #111827;
        }
        .cta-section {
            text-align: center;
            margin-bottom: 32px;
        }
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: #ffffff;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            padding: 16px 32px;
            border-radius: 12px;
            box-shadow: 0 4px 14px rgba(59, 130, 246, 0.25);
            transition: all 0.2s ease;
        }
        .cta-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.35);
        }
        .help-section {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 32px;
        }
        .help-title {
            font-weight: 600;
            color: #92400e;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .help-icon {
            font-size: 16px;
        }
        .help-text {
            color: #78350f;
            margin: 0;
            font-size: 14px;
            line-height: 1.6;
        }
        .footer {
            text-align: center;
            border-top: 1px solid #e5e7eb;
            padding-top: 24px;
            color: #6b7280;
        }
        .footer-text {
            margin: 0 0 8px 0;
            font-size: 14px;
        }
        .footer-highlight {
            color: #3b82f6;
            font-weight: 600;
        }
        @media (max-width: 640px) {
            .container {
                padding: 24px 20px 20px;
            }
            .title {
                font-size: 24px;
            }
            .cta-button {
                width: 100%;
                box-sizing: border-box;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">K</div>
            <h1 class="title">Verify Your Email</h1>
            <p class="subtitle">Complete your account setup for ${organizationName}</p>
        </div>

        <div class="content">
            <div class="greeting">Hi ${firstName}!</div>
            <div class="message">
                Welcome to ${organizationName}! We're excited to have you join our team as a ${roleDisplayName}.
                To complete your account setup and start collaborating, please verify your email address by clicking the button below.
            </div>

            <div class="info-section">
                <div class="info-item">
                    <span class="info-icon">👤</span>
                    <span class="info-label">Name:</span>
                    <span class="info-value">${fullName}</span>
                </div>
                <div class="info-item">
                    <span class="info-icon">📧</span>
                    <span class="info-label">Email:</span>
                    <span class="info-value">${email}</span>
                </div>
                <div class="info-item">
                    <span class="info-icon">🏢</span>
                    <span class="info-label">Organization:</span>
                    <span class="info-value">${organizationName}</span>
                </div>
                <div class="info-item">
                    <span class="info-icon">👔</span>
                    <span class="info-label">Role:</span>
                    <span class="info-value">${roleDisplayName}</span>
                </div>
            </div>

            <div class="cta-section">
                <a href="${verificationUrl}" class="cta-button">Verify Your Email →</a>
            </div>

            <div class="help-section">
                <div class="help-title">
                    <span class="help-icon">⏰</span>
                    Link Expires Soon
                </div>
                <p class="help-text">
                    For security reasons, this verification link will expire in 24 hours. If the link expires, you'll need to request a new verification email from your account settings.
                </p>
            </div>

            <div class="help-section" style="background: #ecfdf5; border-color: #10b981;">
                <div class="help-title" style="color: #047857;">
                    <span class="help-icon">💡</span>
                    What happens next?
                </div>
                <p class="help-text" style="color: #065f46;">
                    After verifying your email, you'll be able to sign in to your account and start exploring the platform. You'll have access to projects, tasks, and collaboration tools based on your role.
                </p>
            </div>
        </div>

        <div class="footer">
            <p class="footer-text">
                If you didn't request this account or have any questions, please contact your administrator or our support team.
            </p>
            <p class="footer-text" style="margin-top: 16px;">
                Best regards,<br>
                <strong>The ${organizationName} Team</strong>
            </p>
            <p class="footer-text" style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                This is an automated verification email. Please do not reply to this message.
            </p>
        </div>
    </div>
</body>
</html>
    `
  }
}

export const emailService = EmailService.getInstance()
