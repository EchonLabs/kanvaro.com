/**
 * Generates the invitation email HTML using table-based layout
 * for maximum email client compatibility (no flex/grid).
 */
export function generateInvitationEmailHtml(params: {
  organizationName: string
  organizationLogo?: string
  roleDisplayName: string
  inviterFirstName: string
  inviterLastName: string
  invitationLink: string
}): string {
  const {
    organizationName,
    organizationLogo,
    roleDisplayName,
    inviterFirstName,
    inviterLastName,
    invitationLink,
  } = params

  const logoHtml = organizationLogo
    ? `<img src="${organizationLogo}" alt="${organizationName} Logo" style="width:72px;height:72px;border-radius:12px;display:block;" />`
    : `<div style="width:72px;height:72px;background:#ffffff;color:#667eea;font-size:32px;font-weight:700;line-height:72px;text-align:center;border-radius:14px;display:block;margin:0 auto;">${organizationName.charAt(0).toUpperCase()}</div>`

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>You're Invited to Join ${organizationName}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    body { margin:0; padding:0; background-color:#f3f4f6; }
    a { color: #667eea; }
    @media only screen and (max-width:600px) {
      .email-outer { padding: 16px 8px !important; }
      .email-inner { border-radius: 12px !important; }
      .header-pad { padding: 32px 20px 24px !important; }
      .content-pad { padding: 28px 20px !important; }
      .footer-pad { padding: 24px 20px !important; }
      .cta-btn { padding: 14px 28px !important; font-size: 15px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Outer wrapper table for centering -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" class="email-outer" style="padding:24px 16px;">
        <!-- Inner card -->
        <table role="presentation" class="email-inner" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,0.18);">

          <!-- ===== HEADER ===== -->
          <tr>
            <td align="center" class="header-pad" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:48px 40px 32px;text-align:center;">
              <!-- Logo -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" style="width:80px;height:80px;text-align:center;vertical-align:middle;">
                    ${logoHtml}
                  </td>
                </tr>
              </table>
              <h1 style="color:#ffffff;font-size:28px;font-weight:700;margin:0 0 8px;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">You're Invited! &#127881;</h1>
              <p style="color:rgba(255,255,255,0.9);font-size:16px;font-weight:400;margin:0;">Join ${organizationName} and start collaborating</p>
            </td>
          </tr>

          <!-- ===== CONTENT ===== -->
          <tr>
            <td class="content-pad" style="padding:48px 40px;">

              <!-- Welcome section -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <!-- Wave icon -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
                      <tr>
                        <td align="center" style="width:64px;height:64px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:16px;text-align:center;vertical-align:middle;font-size:32px;">&#128075;</td>
                      </tr>
                    </table>
                    <p style="font-size:18px;color:#374151;margin:0 0 12px;line-height:1.6;">
                      You've been invited to join <span style="color:#667eea;font-weight:700;font-size:20px;">${organizationName}</span>
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);color:#374151;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;border:1px solid #d1d5db;">${roleDisplayName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info cards -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <!-- Organization -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                      <tr>
                        <td width="56" style="padding:16px 0 16px 16px;vertical-align:middle;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:40px;height:40px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;color:#ffffff;">&#127970;</td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding:16px 16px 16px 12px;vertical-align:middle;">
                          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:2px;">ORGANIZATION</div>
                          <div style="font-size:15px;color:#1f2937;font-weight:600;">${organizationName}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Role -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                      <tr>
                        <td width="56" style="padding:16px 0 16px 16px;vertical-align:middle;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:40px;height:40px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;color:#ffffff;">&#128100;</td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding:16px 16px 16px 12px;vertical-align:middle;">
                          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:2px;">YOUR ROLE</div>
                          <div style="font-size:15px;color:#1f2937;font-weight:600;">${roleDisplayName}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Invited By -->
                <tr>
                  <td style="padding-bottom:0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                      <tr>
                        <td width="56" style="padding:16px 0 16px 16px;vertical-align:middle;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:40px;height:40px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;color:#ffffff;">&#9993;&#65039;</td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding:16px 16px 16px 12px;vertical-align:middle;">
                          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:2px;">INVITED BY</div>
                          <div style="font-size:15px;color:#1f2937;font-weight:600;">${inviterFirstName} ${inviterLastName}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA section -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:40px 0;">
                <tr>
                  <td align="center" style="padding:32px;background:linear-gradient(135deg,#f9fafb 0%,#f3f4f6 100%);border-radius:12px;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 24px;color:#374151;font-size:16px;font-weight:500;">
                      Ready to get started? Click below to accept your invitation and set up your account.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="border-radius:12px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);">
                          <a href="${invitationLink}" class="cta-btn" target="_blank" style="display:inline-block;color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:12px;font-weight:600;font-size:16px;letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">Accept Invitation &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" style="vertical-align:top;font-size:20px;padding-right:12px;">&#9200;</td>
                        <td style="color:#92400e;font-size:14px;font-weight:500;line-height:1.5;">
                          <strong>Important:</strong> This invitation will expire in 7 days. Please accept it soon to ensure access to your account.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:20px;background:#f9fafb;border-radius:8px;border:1px dashed #d1d5db;">
                    <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;">Having trouble with the button?</div>
                    <div style="margin-top:8px;">
                      <a href="${invitationLink}" style="word-break:break-all;color:#667eea;font-size:13px;font-family:'Courier New',monospace;line-height:1.6;text-decoration:none;">${invitationLink}</a>
                    </div>
                    <p style="margin-top:12px;font-size:12px;color:#6b7280;">
                      Copy and paste this link into your browser if the button above doesn't work.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ===== FOOTER ===== -->
          <tr>
            <td align="center" class="footer-pad" style="background:#f9fafb;padding:32px 40px;border-top:1px solid #e5e7eb;">
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 8px;">
                This invitation was sent by <span style="color:#374151;font-weight:600;">${inviterFirstName} ${inviterLastName}</span>
              </p>
              <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 8px;">
                If you have any questions or didn't expect this invitation, please contact your team administrator.
              </p>
              <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:16px 0 0;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Inner card -->
      </td>
    </tr>
  </table>
</body>
</html>`
}
