import nodemailer, { Transporter } from "nodemailer"

let transporter: Transporter | null = null
let transporterInitialized = false

const getEmailUser = () => process.env.EMAIL_USER?.trim()
/** Gmail app passwords are often copied with spaces — strip them. */
const getEmailPassword = () =>
  (process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || "").replace(
    /\s+/g,
    ""
  ) || undefined
const getEmailFrom = () =>
  process.env.EMAIL_FROM_ADDRESS ||
  process.env.EMAIL_FROM ||
  process.env.EMAIL_USER

export const isEmailConfigured = (): boolean => {
  const user = getEmailUser()
  const pass = getEmailPassword()
  if (!user || !pass) return false

  const service = (process.env.EMAIL_SERVICE || "").toLowerCase()
  if (service === "gmail" || service === "sendgrid") return true

  // Treat Gmail SMTP host as configured even without EMAIL_SERVICE
  const host = (process.env.EMAIL_HOST || "").toLowerCase()
  if (host.includes("gmail.com")) return true

  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_PORT)
}

const getTransporter = (): Transporter | null => {
  if (transporterInitialized) return transporter
  transporterInitialized = true

  if (!isEmailConfigured()) {
    console.warn(
      "Email not configured. Set EMAIL_USER and EMAIL_PASSWORD (or EMAIL_PASS). " +
        "For Gmail also set EMAIL_SERVICE=gmail. Emails will not be sent."
    )
    return null
  }

  const user = getEmailUser() as string
  const pass = getEmailPassword() as string
  const service = (process.env.EMAIL_SERVICE || "").toLowerCase()
  const host = (process.env.EMAIL_HOST || "").toLowerCase()
  const useGmail = service === "gmail" || host.includes("gmail.com")

  if (useGmail) {
    // Prefer explicit SMTP settings when provided; otherwise use service: gmail
    if (process.env.EMAIL_HOST && process.env.EMAIL_PORT) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT, 10),
        secure: process.env.EMAIL_SECURE !== "false",
        auth: { user, pass },
      })
    } else {
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      })
    }
  } else if (service === "sendgrid") {
    transporter = nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      auth: {
        user: user || "apikey",
        pass,
      },
    })
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587", 10),
      secure: process.env.EMAIL_SECURE === "true",
      auth: { user, pass },
    })
  }

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
  /** Present only in development when email is not configured */
  previewUrl?: string
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
    from: getEmailFrom(),
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
            color: #000000;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container { background-color: #f9f9f9; border-radius: 8px; padding: 30px; margin: 20px 0; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #5844BB; margin: 0; font-size: 28px; }
          .content { background-color: white; padding: 25px; border-radius: 6px; margin: 20px 0; color: #000000; }
          .content h2 { color: #5844BB; margin-top: 0; }
          .household-name { font-weight: bold; color: #5844BB; }
          .button { display: inline-block; padding: 12px 24px; background-color: #AE9CFC; color: #000000 !important; text-decoration: none; border-radius: 25px; font-weight: 600; font-size: 15px; margin: 20px 0; text-align: center; }
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
              <a href="${inviteLink}" style="color: #5844BB; word-break: break-all; display: inline-block; margin-top: 5px;">${inviteLink}</a>
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

export const sendPasswordResetEmail = async ({
  to,
  name,
  resetUrl,
}: {
  to: string
  name?: string
  resetUrl: string
}): Promise<EmailResult> => {
  const tp = getTransporter()

  if (!tp) {
    console.warn("Email not configured - password reset link for", to)
    console.warn("Reset URL:", resetUrl)
    return {
      success: false,
      message: "Email service not configured",
      previewUrl: resetUrl,
    }
  }

  const displayName = name || "käyttäjä"
  const mailOptions = {
    from: getEmailFrom(),
    to,
    subject: "Arkiapuri - Salasanan vaihto",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #000000; line-height: 1.6;">
        <h2 style="color: #5844BB; font-size: 24px; margin: 0 0 16px;">Salasanan vaihto</h2>
        <p style="color: #000000; margin: 0 0 12px;">Hei ${displayName},</p>
        <p style="color: #000000; margin: 0 0 12px;">Olet pyytänyt salasanan vaihtoa Arkiapuri-sovellukseen.</p>
        <p style="color: #000000; margin: 0 0 20px;">Klikkaa alla olevaa painiketta vaihtaaksesi salasanasi:</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #AE9CFC; color: #000000 !important; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: 600; font-size: 15px; margin: 8px 0 20px;">
          Vaihda salasana
        </a>
        <p style="color: #000000; margin: 0 0 12px;">Tämä linkki on voimassa 1 tunnin ajan.</p>
        <p style="color: #000000; margin: 0 0 12px;">Jos et pyytänyt salasanan vaihtoa, voit jättää tämän viestin huomiotta.</p>
        <p style="color: #000000; margin: 16px 0 0;">Ystävällisin terveisin,<br>Arkiapuri-tiimi</p>
      </div>
    `,
    text: `Hei ${displayName},\n\nOlet pyytänyt salasanan vaihtoa Arkiapuri-sovellukseen.\n\nVaihda salasana: ${resetUrl}\n\nLinkki on voimassa 1 tunnin ajan.\n\nJos et pyytänyt vaihtoa, voit jättää viestin huomiotta.`,
  }

  try {
    const info = await tp.sendMail(mailOptions)
    console.log("Password reset email sent:", info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error: any) {
    console.error("Error sending password reset email:", error)
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
