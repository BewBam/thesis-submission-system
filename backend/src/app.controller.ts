import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      service: "thesis-portal-backend",
      status: "ok",
      message: "Backend is running"
    };
  }

  @Get("health")
  getHealth() {
    return {
      status: "ok"
    };
  }
}
