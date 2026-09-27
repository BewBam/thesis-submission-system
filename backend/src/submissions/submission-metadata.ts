import { BadRequestException } from "@nestjs/common";

export type ThesisMetadataInput = {
  email?: string;
  title?: string;
  titleVi?: string;
  titleEn?: string;
  thesisAdvisors?: string;
  major?: string;
  thesisYear?: string;
  dateIssued?: string;
  publisher?: string;
  documentType?: string;
  language?: string;
  description?: string;
};

export type NormalizedThesisMetadata = {
  email: string;
  titleVi: string;
  titleEn: string;
  title: string;
  thesisAdvisors: string;
  major: string;
  thesisYear: string;
  dateIssued: string;
  publisher: string;
  documentType: string;
  language: string;
  description: string;
};

export function buildStudentEmail(username: string, emailOverride?: string): string {
  const trimmed = emailOverride?.trim().toLowerCase();
  if (trimmed) {
    return trimmed;
  }
  const local = username.trim().toLowerCase();
  return local.includes("@") ? local : `${local}@hcmut.edu.vn`;
}

export function normalizeThesisMetadata(
  dto: ThesisMetadataInput,
  username: string,
  options: { required: boolean }
): NormalizedThesisMetadata {
  const email = buildStudentEmail(username, dto.email);
  const titleVi = (dto.titleVi ?? "").trim();
  const titleEn = (dto.titleEn ?? dto.title ?? "").trim();
  const thesisAdvisors = (dto.thesisAdvisors ?? "").trim();
  const major = (dto.major ?? "").trim();
  const thesisYear = (dto.thesisYear ?? "").trim();
  // Archive/DSpace fields — requiredness is enforced by submission_form_fields config.
  const dateIssued = (dto.dateIssued ?? thesisYear ?? "").trim();
  const publisher = (dto.publisher ?? "").trim();
  const documentType = (dto.documentType ?? "").trim();
  const language = (dto.language ?? "").trim();
  const description = (dto.description ?? "").trim();

  if (options.required) {
    if (!titleVi) {
      throw new BadRequestException("Vietnamese thesis title is required");
    }
    if (!titleEn) {
      throw new BadRequestException("English thesis title is required");
    }
    if (!thesisAdvisors) {
      throw new BadRequestException("Advisor(s) is required");
    }
    if (!major) {
      throw new BadRequestException("Major is required");
    }
    if (!thesisYear) {
      throw new BadRequestException("Year is required");
    }
    if (!/^\d{4}$/.test(thesisYear)) {
      throw new BadRequestException("Year must be a four-digit number");
    }
  }

  const title = titleEn || titleVi || (options.required ? "" : "Untitled draft");

  return {
    email,
    titleVi,
    titleEn,
    title,
    thesisAdvisors,
    major,
    thesisYear,
    dateIssued,
    publisher,
    documentType,
    language,
    description
  };
}

export function mergeThesisMetadata(
  dto: ThesisMetadataInput,
  username: string,
  existing: Partial<NormalizedThesisMetadata>,
  options: { required: boolean }
): NormalizedThesisMetadata {
  return normalizeThesisMetadata(
    {
      email: dto.email ?? existing.email,
      titleVi: dto.titleVi ?? existing.titleVi,
      titleEn: dto.titleEn ?? dto.title ?? existing.titleEn ?? existing.title,
      thesisAdvisors: dto.thesisAdvisors ?? existing.thesisAdvisors,
      major: dto.major ?? existing.major,
      thesisYear: dto.thesisYear ?? existing.thesisYear,
      dateIssued: dto.dateIssued ?? existing.dateIssued,
      publisher: dto.publisher ?? existing.publisher,
      documentType: dto.documentType ?? existing.documentType,
      language: dto.language ?? existing.language,
      description: dto.description ?? existing.description
    },
    username,
    options
  );
}

export const THESIS_METADATA_SELECT = `
  s.student_email,
  s.title_vi,
  s.title_en,
  s.thesis_advisors,
  s.major,
  s.thesis_year,
  s.date_issued,
  s.publisher,
  s.document_type,
  s.language,
  s.description,
  s.extra_metadata`;

export const THESIS_METADATA_INSERT_COLUMNS = `
  student_email, title_vi, title_en, thesis_advisors, major, thesis_year,
  date_issued, publisher, document_type, language, description, extra_metadata`;

export const THESIS_METADATA_GROUP_BY = `
  s.student_email,
  s.title_vi,
  s.title_en,
  s.thesis_advisors,
  s.major,
  s.thesis_year,
  s.date_issued,
  s.publisher,
  s.document_type,
  s.language,
  s.description,
  s.extra_metadata`;
