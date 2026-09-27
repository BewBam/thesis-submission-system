import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtPayload } from "./jwt.strategy";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("login-options")
  loginOptions() {
    return this.authService.getLoginOptions();
  }

  @Post("login")
  async login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: JwtPayload }) {
    return this.authService.me(req.user.sub);
  }

  @Get("google")
  async googleStart(@Res() res: Response) {
    await this.authService.assertGoogleLoginEnabled();
    return res.redirect(this.authService.getGoogleAuthorizeRedirect());
  }

  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response
  ) {
    const location = await this.authService.handleGoogleCallback({ code, state, error });
    return res.redirect(location);
  }
}
