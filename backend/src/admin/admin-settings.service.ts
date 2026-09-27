import { BadRequestException, Injectable } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";

const SENSITIVE_SETTING_KEYS = new Set([
  "dspace_api_password",
  "dspace_api_token",
  "smtp_password"
]);
const MASK = "********";

@Injectable()
export class AdminSettingsService {
  private readonly db = createPgPool();

  async list() {
    const result = await this.db.query<{ key: string; value: string; description: string; updated_at: Date }>(
      `SELECT key, value, description, updated_at FROM system_settings ORDER BY key ASC`
    );
    return result.rows.map((row) => ({
      key: row.key,
      value: SENSITIVE_SETTING_KEYS.has(row.key) && row.value ? MASK : row.value,
      description: row.description,
      updatedAt: row.updated_at,
      sensitive: SENSITIVE_SETTING_KEYS.has(row.key)
    }));
  }

  async update(settings: Record<string, string>) {
    const keys = Object.keys(settings);
    if (keys.length === 0) {
      throw new BadRequestException("No settings provided");
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      for (const key of keys) {
        let nextValue = String(settings[key] ?? "");
        if (key === "login_method" && nextValue !== "username" && nextValue !== "google") {
          throw new BadRequestException("login_method must be username or google");
        }
        if (SENSITIVE_SETTING_KEYS.has(key) && (nextValue === MASK || nextValue === "")) {
          // Keep existing secret when UI sends mask or blank.
          continue;
        }
        const updated = await client.query(
          `UPDATE system_settings SET value = $2, updated_at = NOW() WHERE key = $1 RETURNING key`,
          [key, nextValue]
        );
        if (updated.rowCount === 0) {
          throw new BadRequestException(`Unknown setting key: ${key}`);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.list();
  }

  async getValue(key: string): Promise<string | undefined> {
    const result = await this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    return result.rows[0]?.value;
  }
}
