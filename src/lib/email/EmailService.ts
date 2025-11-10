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
}

export const emailService = EmailService.getInstance()
