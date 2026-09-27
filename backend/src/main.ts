import { existsSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function loadEnvFiles() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
    resolve(__dirname, "..", ".env"),
    resolve(__dirname, "../..", ".env")
  ];
  const loaded = new Set<string>();
  for (const path of candidates) {
    if (loaded.has(path) || !existsSync(path)) {
      continue;
    }
    loaded.add(path);
    loadEnv({ path, override: false });
  }
}

async function bootstrap() {
  loadEnvFiles();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT || 3000);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
