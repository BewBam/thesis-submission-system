import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { AdminSettingsService } from "../admin/admin-settings.service";

export type EmailTemplateVars = Record<string, string | undefined | null>;

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function envTrim(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseFlag(value: string | undefined): boolean | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return undefined;
}

function sanitizeSmtpError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const secret = process.env.SMTP_PASSWORD;
  if (secret && secret.length > 0) {
    message = message.split(secret).join("***");
  }
  const user = process.env.SMTP_USER;
  if (user && user.length > 0) {
    message = message.split(user).join("***");
  }
  message = message.replace(/\/\/([^:@/]+):([^@/]+)@/g, "//***:***@");
  message = message.replace(/pass(?:word)?["\s:=]+[^,\s}"']+/gi, "password=***");
  return message;
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private transport: Transporter | null = null;
  private transportKey = "";

  constructor(private readonly settings: AdminSettingsService) {}

  onModuleDestroy() {
    this.closeTransport();
  }

  renderTemplate(template: string, vars: EmailTemplateVars): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      const value = vars[key];
      return value == null ? "" : String(value);
    });
  }

  async isEnabled(): Promise<boolean> {
    const fromAdmin = parseFlag((await this.settings.getValue("email_enabled"))?.trim());
    if (fromAdmin !== undefined) {
      return fromAdmin;
    }
    return parseFlag(envTrim("EMAIL_ENABLED")) === true;
  }

  private async smtpSetting(envName: string, settingKey: string): Promise<string | undefined> {
    return (await this.settings.getValue(settingKey))?.trim() || envTrim(envName) || undefined;
  }

  private async resolveSmtpConfig(): Promise<SmtpConfig | null> {
    const host = await this.smtpSetting("SMTP_HOST", "smtp_host");
    if (!host) {
      return null;
    }

    const portRaw = (await this.smtpSetting("SMTP_PORT", "smtp_port")) || "587";
    const port = Number(portRaw) || 587;
    const secureFromSettings = parseFlag((await this.settings.getValue("smtp_secure"))?.trim());
    const secureFromEnv = parseFlag(envTrim("SMTP_SECURE"));
    const secure = secureFromSettings ?? secureFromEnv ?? port === 465;

    const user = (await this.smtpSetting("SMTP_USER", "smtp_user")) || "";
    const pass = (
      (await this.settings.getValue("smtp_password"))?.trim() ||
      envTrim("SMTP_PASSWORD") ||
      ""
    ).replace(/\s/g, "");
    const from = (await this.smtpSetting("SMTP_FROM", "smtp_from")) || user;

    return { host, port, secure, user, pass, from };
  }

  private configKey(config: SmtpConfig): string {
    return [config.host, config.port, config.secure, config.user, config.from, config.pass].join("|");
  }

  private closeTransport(): void {
    if (!this.transport) {
      return;
    }
    try {
      this.transport.close();
    } catch {
      // ignore
    }
    this.transport = null;
    this.transportKey = "";
  }

  private getTransport(config: SmtpConfig): Transporter {
    const key = this.configKey(config);
    if (this.transport && this.transportKey === key) {
      return this.transport;
    }
    this.closeTransport();
    const isGmail = /gmail\.com$/i.test(config.host) || /@gmail\.com$/i.test(config.user);
    const smtpOptions = {
      host: isGmail ? "smtp.gmail.com" : config.host,
      port: isGmail ? 587 : config.port,
      secure: isGmail ? false : config.secure,
      // Docker/Linux often resolves smtp.gmail.com to IPv6; Gmail then returns 454.
      // Match the working Windows SmtpClient path (IPv4 + STARTTLS on 587).
      family: 4,
      auth: config.user ? { user: config.user, pass: config.pass.replace(/\s/g, "") } : undefined,
      tls: { minVersion: "TLSv1.2" }
    } as SMTPTransport.Options;
    this.transport = nodemailer.createTransport(smtpOptions);
    this.transportKey = key;
    this.logger.log(
      `SMTP transport ready host=${isGmail ? "smtp.gmail.com" : config.host} port=${
        isGmail ? 587 : config.port
      } user=${config.user || "(none)"} ipv4=true`
    );
    return this.transport;
  }

  async sendMail(options: {
    to: string | string[];
    subject: string;
    text: string;
  }): Promise<boolean> {
    if (!(await this.isEnabled())) {
      this.logger.debug("Email skipped: EMAIL_ENABLED is false");
      return false;
    }

    const recipients = (Array.isArray(options.to) ? options.to : [options.to])
      .map((addr) => addr.trim().toLowerCase())
      .filter(Boolean);
    if (recipients.length === 0) {
      this.logger.warn("Email skipped: no recipients");
      return false;
    }

    const config = await this.resolveSmtpConfig();
    if (!config) {
      this.logger.warn("Email skipped: SMTP_HOST is not configured");
      return false;
    }
    if (!config.from) {
      this.logger.warn("Email skipped: SMTP_FROM / SMTP_USER is empty");
      return false;
    }

    try {
      await this.getTransport(config).sendMail({
        from: config.from,
        to: recipients.join(", "),
        subject: options.subject,
        text: options.text,
        encoding: "utf-8",
        textEncoding: "quoted-printable"
      });
      this.logger.log(`Email sent to ${recipients.length} recipient(s) — ${options.subject}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${recipients.length} recipient(s): ${sanitizeSmtpError(error)}`
      );
      return false;
    }
  }

  async sendTemplated(options: {
    to: string | string[];
    subjectKey: string;
    bodyKey: string;
    vars: EmailTemplateVars;
    defaultSubject: string;
    defaultBody: string;
  }): Promise<boolean> {
    const subjectTpl =
      (await this.settings.getValue(options.subjectKey))?.trim() || options.defaultSubject;
    const bodyTpl = (await this.settings.getValue(options.bodyKey))?.trim() || options.defaultBody;
    return this.sendMail({
      to: options.to,
      subject: this.renderTemplate(subjectTpl, options.vars),
      text: this.renderTemplate(bodyTpl, options.vars)
    });
  }
}
