import nodemailer, { Transporter } from "nodemailer"

let transporter: Transporter | null = null

const getTransporter = (): Transporter | null => {
  if (transporter) return transporter

  if (
    !process.env.EMAIL_HOST ||
    !process.env.EMAIL_PORT ||
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_PASSWORD
  ) {
    console.warn("Email SMTP settings not configured. Emails will not be sent.")
    return null
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  })

  return transporter
}

interface FamilyInvitationOptions {
  to: string
  inviterName: string
  householdName: string
  inviteLink: string
  webInviteLink: string
  invitationToken: string
}

interface EmailResult {
  success: boolean
  messageId?: string
  message?: string
  error?: string
}

export const sendFamilyInvitation = async ({
  to,
  inviterName,
  householdName,
  inviteLink,
  webInviteLink,
  invitationToken,
}: FamilyInvitationOptions): Promise<EmailResult> => {
  const tp = getTransporter()

  if (!tp) {
    console.log("Email not configured - would have sent invitation to:", to)
    console.log("Invite link:", inviteLink)
    return { success: false, message: "Email service not configured" }
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER,
    to,
    subject: "Perhekutsu Arkiapuriin",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container { background-color: #f9f9f9; border-radius: 8px; padding: 30px; margin: 20px 0; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #7B6BC9; margin: 0; font-size: 28px; }
          .content { background-color: white; padding: 25px; border-radius: 6px; margin: 20px 0; }
          .household-name { font-weight: bold; color: #7B6BC9; }
          .button { display: inline-block; padding: 14px 28px; background-color: #7B6BC9; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; text-align: center; }
          .button-container { text-align: center; margin: 30px 0; }
          .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 15px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>Arkiapuri</h1></div>
          <div class="content">
            <h2>Hei!</h2>
            <p><strong>${inviterName}</strong> on kutsunut sinut liittymään perheeseen <span class="household-name">"${householdName}"</span> Arkiapuri-sovelluksessa.</p>
            <p>Arkiapuri on perheen arjen helpottamiseen suunniteltu sovellus, jossa voit:</p>
            <ul>
              <li>Suunnitella aterioita yhdessä perheen kanssa</li>
              <li>Hallita yhteistä ostoslistaa</li>
              <li>Seurata ruokavarastoa</li>
              <li>Jakaa reseptejä ja ruokavinkkejä</li>
            </ul>
            <div class="button-container">
              <a href="${webInviteLink}" class="button">Hyväksy kutsu</a>
            </div>
            <p style="text-align: center; color: #666; font-size: 14px; margin-top: 20px;">
              <strong>Mobiilisovelluksessa?</strong> Käytä tätä linkkiä:<br>
              <a href="${inviteLink}" style="color: #7B6BC9; word-break: break-all; display: inline-block; margin-top: 5px;">${inviteLink}</a>
            </p>
            <p style="text-align: center; color: #999; font-size: 12px; margin-top: 15px;">
              Kutsutunnus: <code style="background: #f5f5f5; padding: 3px 8px; border-radius: 3px; font-size: 11px;">${invitationToken}</code>
            </p>
            <div class="warning">
              Jos sinulla ei ole vielä Arkiapuri-tiliä, voit luoda sen kutsun hyväksymisen yhteydessä.
            </div>
            <p style="font-size: 14px; color: #666; margin-top: 20px;">
              <strong>Huom:</strong> Kutsu vanhenee 7 päivän kuluttua.
            </p>
          </div>
          <div class="footer">
            <p>Terveisin,<br>Arkiapuri-tiimi</p>
            <p style="margin-top: 15px;">Jos et tunne lähettäjää tai et halua liittyä perheeseen, voit jättää tämän viestin huomiotta.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Hei!

${inviterName} on kutsunut sinut liittymään perheeseen "${householdName}" Arkiapuri-sovelluksessa.

Hyväksy kutsu klikkaamalla alla olevaa linkkiä:
${inviteLink}

Jos sinulla ei ole vielä Arkiapuri-tiliä, voit luoda sen kutsun hyväksymisen yhteydessä.

Kutsu vanhenee 7 päivän kuluttua.

Terveisin,
Arkiapuri-tiimi
    `,
  }

  try {
    const info = await tp.sendMail(mailOptions)
    console.log("Invitation email sent:", info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error: any) {
    console.error("Error sending invitation email:", error)
    return { success: false, error: error.message }
  }
}

export const testEmailConfiguration = async (): Promise<EmailResult> => {
  const tp = getTransporter()

  if (!tp) {
    return { success: false, message: "Email service not configured" }
  }

  try {
    await tp.verify()
    return { success: true, message: "Email configuration is valid" }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
