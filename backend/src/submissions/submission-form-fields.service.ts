import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createPgPool } from "../users/db-pool";
import type { CreateFormFieldDto } from "./dto/create-form-field.dto";
import type { UpdateFormFieldDto } from "./dto/update-form-field.dto";

export type SubmissionFormField = {
  id: string;
  fieldKey: string;
  label: string;
  dspacePath: string;
  inputType: "text" | "textarea" | "select" | "year" | "file";
  required: boolean;
  enabled: boolean;
  sortOrder: number;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
  storage: "column" | "extra";
  columnName: string | null;
  systemLocked: boolean;
};

const STRUCTURAL_FORM_KEYS = new Set([
  "archiveFacultyId",
  "archiveSemesterId",
  "submissionPeriodId",
  "email",
  "titleVi",
  "titleEn",
  "thesisAdvisors",
  "major",
  "thesisYear",
  "authorIds",
  "reviewerIds",
  "thesisFile"
]);

const COLUMN_WHITELIST = new Set([
  "author",
  "title",
  "abstract",
  "date_issued",
  "publisher",
  "document_type",
  "language",
  "description"
]);

@Injectable()
export class SubmissionFormFieldsService {
  private readonly db = createPgPool();

  async listAll(): Promise<SubmissionFormField[]> {
    const result = await this.db.query(`SELECT * FROM submission_form_fields ORDER BY sort_order ASC, label ASC`);
    return result.rows.map((row) => this.mapRow(row));
  }

  async listEnabled(): Promise<SubmissionFormField[]> {
    const result = await this.db.query(
      `SELECT * FROM submission_form_fields WHERE enabled = TRUE ORDER BY sort_order ASC, label ASC`
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async fieldState(
    fieldKey: string
  ): Promise<{ enabled: boolean; required: boolean; inputType: string } | null> {
    const result = await this.db.query<{ enabled: boolean; required: boolean; input_type: string }>(
      `SELECT enabled, required, input_type FROM submission_form_fields WHERE field_key = $1 LIMIT 1`,
      [fieldKey]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return { enabled: Boolean(row.enabled), required: Boolean(row.required), inputType: row.input_type };
  }

  async create(dto: CreateFormFieldDto): Promise<SubmissionFormField> {
    const fieldKey = this.normalizeKey(dto.fieldKey);
    await this.assertUniqueKey(fieldKey);

    const storage = dto.storage === "column" ? "column" : "extra";
    const columnName =
      storage === "column" ? this.assertColumnName(dto.columnName || this.keyToColumn(fieldKey)) : null;
    if (storage === "column" && !COLUMN_WHITELIST.has(columnName!)) {
      throw new BadRequestException(
        `column storage only allows: ${[...COLUMN_WHITELIST].join(", ")}. Use storage=extra for custom fields.`
      );
    }

    const id = randomUUID();
    const sortOrder =
      dto.sortOrder ??
      (
        await this.db.query<{ n: number }>(
          `SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM submission_form_fields`
        )
      ).rows[0]?.n ??
      100;

    await this.db.query(
      `INSERT INTO submission_form_fields (
         id, field_key, label, dspace_path, input_type, required, enabled, sort_order,
         options, default_value, storage, column_name, system_locked
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, FALSE
       )`,
      [
        id,
        fieldKey,
        dto.label.trim(),
        (dto.dspacePath || "").trim(),
        dto.inputType || "text",
        dto.required === true,
        dto.enabled !== false,
        sortOrder,
        JSON.stringify(dto.options || []),
        (dto.defaultValue || "").trim(),
        storage,
        columnName
      ]
    );
    return this.getById(id);
  }

  async update(fieldId: string, dto: UpdateFormFieldDto): Promise<SubmissionFormField> {
    const existing = await this.getById(fieldId);

    if (dto.label !== undefined) {
      await this.db.query(`UPDATE submission_form_fields SET label = $1, updated_at = NOW() WHERE id = $2::uuid`, [
        dto.label.trim(),
        fieldId
      ]);
    }
    if (dto.dspacePath !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET dspace_path = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.dspacePath.trim(), fieldId]
      );
    }
    if (dto.inputType !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET input_type = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.inputType, fieldId]
      );
    }
    if (dto.required !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET required = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.required, fieldId]
      );
    }
    if (dto.enabled !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET enabled = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.enabled, fieldId]
      );
    }
    if (dto.sortOrder !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET sort_order = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.sortOrder, fieldId]
      );
    }
    if (dto.options !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET options = $1::jsonb, updated_at = NOW() WHERE id = $2::uuid`,
        [JSON.stringify(dto.options), fieldId]
      );
    }
    if (dto.defaultValue !== undefined) {
      await this.db.query(
        `UPDATE submission_form_fields SET default_value = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.defaultValue.trim(), fieldId]
      );
    }

    if (dto.fieldKey !== undefined) {
      const nextKey = this.normalizeKey(dto.fieldKey);
      if (nextKey !== existing.fieldKey) {
        await this.assertUniqueKey(nextKey, fieldId);
        await this.db.query(
          `UPDATE submission_form_fields SET field_key = $1, updated_at = NOW() WHERE id = $2::uuid`,
          [nextKey, fieldId]
        );
      }
    }

    return this.getById(fieldId);
  }

  async remove(fieldId: string) {
    await this.getById(fieldId);
    await this.db.query(`DELETE FROM submission_form_fields WHERE id = $1::uuid`, [fieldId]);
    return { deleted: true, id: fieldId };
  }

  /**
   * Validate values for enabled fields. Returns column patch + extra_metadata patch.
   */
  async resolveMetadataValues(
    input: Record<string, unknown>,
    options: { required: boolean; existingExtra?: Record<string, string> }
  ): Promise<{
    columns: Record<string, string>;
    extra: Record<string, string>;
  }> {
    const fields = await this.listEnabled();
    const columns: Record<string, string> = {};
    const extra: Record<string, string> = { ...(options.existingExtra || {}) };

    for (const field of fields) {
      // author/title are owned by workflow (authorIds / titleEn); skip form value overwrite here
      if (field.fieldKey === "author" || field.fieldKey === "title" || STRUCTURAL_FORM_KEYS.has(field.fieldKey)) {
        continue;
      }

      const raw = input[field.fieldKey];
      const value =
        raw === undefined || raw === null
          ? ""
          : String(raw).trim();

      if (options.required && field.required && !value) {
        throw new BadRequestException(`${field.label} is required`);
      }

      if (raw === undefined && !options.required) {
        continue;
      }

      const finalValue = value || (!options.required ? "" : field.defaultValue || "");
      if (options.required && field.required && !finalValue) {
        throw new BadRequestException(`${field.label} is required`);
      }

      if (field.storage === "column" && field.columnName) {
        columns[field.columnName] = finalValue;
      } else {
        if (finalValue) {
          extra[field.fieldKey] = finalValue;
        } else {
          delete extra[field.fieldKey];
        }
      }
    }

    return { columns, extra };
  }

  async buildDspaceMetadata(row: {
    title?: string | null;
    author?: string | null;
    abstract?: string | null;
    date_issued?: string | null;
    publisher?: string | null;
    document_type?: string | null;
    language?: string | null;
    description?: string | null;
    thesis_year?: string | null;
    university_name?: string | null;
    thesis_advisors?: string | null;
    major?: string | null;
    extra_metadata?: Record<string, unknown> | null;
  }): Promise<Record<string, string[]>> {
    const fields = await this.listEnabled();
    const extra =
      row.extra_metadata && typeof row.extra_metadata === "object"
        ? (row.extra_metadata as Record<string, unknown>)
        : {};
    const columnValues: Record<string, string> = {
      author: String(row.author || ""),
      title: String(row.title || ""),
      abstract: String(row.abstract || ""),
      date_issued: String(row.date_issued || row.thesis_year || ""),
      publisher: String(row.publisher || row.university_name || ""),
      document_type: String(row.document_type || "Thesis"),
      language: String(row.language || "vie"),
      description: String(row.description || "")
    };

    const metadata: Record<string, string[]> = {};
    for (const field of fields) {
      if (!field.dspacePath?.trim()) {
        continue;
      }
      let value = "";
      if (field.fieldKey === "author") {
        value = columnValues.author;
      } else if (field.fieldKey === "title") {
        value = columnValues.title;
      } else if (field.storage === "column" && field.columnName) {
        value = columnValues[field.columnName] || "";
      } else {
        value = String(extra[field.fieldKey] ?? "");
      }
      value = value.trim();
      if (!value && field.defaultValue) {
        value = field.defaultValue.trim();
      }
      if (!value) {
        continue;
      }
      if (field.fieldKey === "author") {
        metadata[field.dspacePath] = value
          .split(/[;|]/)
          .map((part) => part.trim())
          .filter(Boolean);
      } else {
        metadata[field.dspacePath] = [value];
      }
    }

    const major = String(row.major || "").trim();
    if (major) {
      this.appendMetadata(metadata, "dc.subject", [major]);
    }
    const advisors = String(row.thesis_advisors || "")
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (advisors.length > 0) {
      this.appendMetadata(metadata, "dc.contributor.advisor", advisors);
    }
    return metadata;
  }

  private appendMetadata(metadata: Record<string, string[]>, path: string, values: string[]) {
    const existing = metadata[path] || [];
    const seen = new Set(existing);
    for (const value of values) {
      if (!seen.has(value)) {
        existing.push(value);
        seen.add(value);
      }
    }
    if (existing.length > 0) {
      metadata[path] = existing;
    }
  }

  private async getById(fieldId: string): Promise<SubmissionFormField> {
    const result = await this.db.query(`SELECT * FROM submission_form_fields WHERE id = $1::uuid LIMIT 1`, [
      fieldId
    ]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Form field not found");
    }
    return this.mapRow(row);
  }

  private async assertUniqueKey(fieldKey: string, excludeId?: string) {
    const result = await this.db.query(
      `SELECT id FROM submission_form_fields WHERE field_key = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
      [fieldKey, excludeId ?? null]
    );
    if (result.rows[0]) {
      throw new ConflictException(`Field key "${fieldKey}" already exists`);
    }
  }

  private normalizeKey(raw: string): string {
    const key = String(raw || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "");
    if (!key || key.length < 2) {
      throw new BadRequestException("fieldKey must be at least 2 characters (letters/numbers/_)");
    }
    if (!/^[a-zA-Z]/.test(key)) {
      throw new BadRequestException("fieldKey must start with a letter");
    }
    return key;
  }

  private keyToColumn(fieldKey: string): string {
    return fieldKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  }

  private assertColumnName(name: string): string {
    const column = String(name || "").trim();
    if (!/^[a-z][a-z0-9_]*$/.test(column)) {
      throw new BadRequestException("Invalid column_name");
    }
    return column;
  }

  private mapRow(row: Record<string, unknown>): SubmissionFormField {
    let options: Array<{ value: string; label: string }> = [];
    const rawOptions = row.options;
    if (Array.isArray(rawOptions)) {
      options = rawOptions.map((item) => {
        if (item && typeof item === "object") {
          const obj = item as { value?: string; label?: string };
          return { value: String(obj.value ?? ""), label: String(obj.label ?? obj.value ?? "") };
        }
        return { value: String(item), label: String(item) };
      });
    }
    return {
      id: String(row.id),
      fieldKey: String(row.field_key),
      label: String(row.label),
      dspacePath: String(row.dspace_path || ""),
      inputType: row.input_type as SubmissionFormField["inputType"],
      required: Boolean(row.required),
      enabled: Boolean(row.enabled),
      sortOrder: Number(row.sort_order || 0),
      options,
      defaultValue: String(row.default_value || ""),
      storage: row.storage as "column" | "extra",
      columnName: row.column_name ? String(row.column_name) : null,
      systemLocked: Boolean(row.system_locked)
    };
  }
}
