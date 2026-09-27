import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export type GoogleProfile = {
  email: string;
  emailVerified: boolean;
  name: string;
};

type GoogleStatePayload = {
  typ: "google_oauth";
};

@Injectable()
export class GoogleAuthService {
  constructor(private readonly jwtService: JwtService) {}

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.callbackUrl());
  }

  allowedDomain(): string {
    return (process.env.GOOGLE_ALLOWED_DOMAIN || "hcmut.edu.vn").trim().toLowerCase();
  }

  frontendUrl(): string {
    return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  }

  buildAuthorizeUrl(): string {
    const state = this.jwtService.sign({ typ: "google_oauth" } satisfies GoogleStatePayload, {
      expiresIn: "10m"
    });
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: this.callbackUrl(),
      response_type: "code",
      scope: "openid email profile",
      state,
      hd: this.allowedDomain(),
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  verifyState(state: string | undefined): boolean {
    if (!state) {
      return false;
    }
    try {
      const payload = this.jwtService.verify<GoogleStatePayload>(state);
      return payload.typ === "google_oauth";
    } catch {
      return false;
    }
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      redirect_uri: this.callbackUrl(),
      grant_type: "authorization_code"
    });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokenPayload = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error || "Google token exchange failed");
    }

    const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    });
    const profile = (await userResponse.json()) as {
      email?: string;
      email_verified?: boolean | string;
      name?: string;
    };
    if (!userResponse.ok || !profile.email) {
      throw new Error("Google userinfo failed");
    }

    return {
      email: profile.email.trim().toLowerCase(),
      emailVerified: profile.email_verified === true || profile.email_verified === "true",
      name: (profile.name || "").trim()
    };
  }

  isAllowedEmail(email: string): boolean {
    return email.endsWith(`@${this.allowedDomain()}`);
  }

  usernameFromEmail(email: string): string | undefined {
    const local = email.split("@")[0]?.trim().toLowerCase();
    return local || undefined;
  }

  private clientId(): string {
    return (process.env.GOOGLE_CLIENT_ID || "").trim();
  }

  private clientSecret(): string {
    return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  }

  private callbackUrl(): string {
    return (process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback").trim();
  }
}
