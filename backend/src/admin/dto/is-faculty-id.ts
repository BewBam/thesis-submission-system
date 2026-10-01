import { applyDecorators } from "@nestjs/common";
import { IsOptional, Matches, ValidateIf } from "class-validator";

/** Postgres accepts any 8-4-4-4-12 hex id. Seed faculties use that form, which @IsUUID() rejects. */
const FACULTY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function IsOptionalFacultyId() {
  return applyDecorators(
    IsOptional(),
    ValidateIf((_, value) => value !== null && value !== ""),
    Matches(FACULTY_UUID, { message: "facultyId must be a UUID" })
  );
}
