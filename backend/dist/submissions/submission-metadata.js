"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THESIS_METADATA_GROUP_BY = exports.THESIS_METADATA_INSERT_COLUMNS = exports.THESIS_METADATA_SELECT = void 0;
exports.buildStudentEmail = buildStudentEmail;
exports.normalizeThesisMetadata = normalizeThesisMetadata;
exports.mergeThesisMetadata = mergeThesisMetadata;
const common_1 = require("@nestjs/common");
function buildStudentEmail(username, emailOverride) {
    const trimmed = emailOverride?.trim().toLowerCase();
    if (trimmed) {
        return trimmed;
    }
    const local = username.trim().toLowerCase();
    return local.includes("@") ? local : `${local}@hcmut.edu.vn`;
}
function normalizeThesisMetadata(dto, username, options) {
    const email = buildStudentEmail(username, dto.email);
    const titleVi = (dto.titleVi ?? "").trim();
    const titleEn = (dto.titleEn ?? dto.title ?? "").trim();
    const thesisAdvisors = (dto.thesisAdvisors ?? "").trim();
    const major = (dto.major ?? "").trim();
    const thesisYear = (dto.thesisYear ?? "").trim();
    if (options.required) {
        if (!titleVi) {
            throw new common_1.BadRequestException("Vietnamese thesis title is required");
        }
        if (!titleEn) {
            throw new common_1.BadRequestException("English thesis title is required");
        }
        if (!thesisAdvisors) {
            throw new common_1.BadRequestException("Advisor(s) is required");
        }
        if (!major) {
            throw new common_1.BadRequestException("Major is required");
        }
        if (!thesisYear) {
            throw new common_1.BadRequestException("Year is required");
        }
        if (!/^\d{4}$/.test(thesisYear)) {
            throw new common_1.BadRequestException("Year must be a four-digit number");
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
        thesisYear
    };
}
function mergeThesisMetadata(dto, username, existing, options) {
    return normalizeThesisMetadata({
        email: dto.email ?? existing.email,
        titleVi: dto.titleVi ?? existing.titleVi,
        titleEn: dto.titleEn ?? dto.title ?? existing.titleEn ?? existing.title,
        thesisAdvisors: dto.thesisAdvisors ?? existing.thesisAdvisors,
        major: dto.major ?? existing.major,
        thesisYear: dto.thesisYear ?? existing.thesisYear
    }, username, options);
}
exports.THESIS_METADATA_SELECT = `
  s.student_email,
  s.title_vi,
  s.title_en,
  s.thesis_advisors,
  s.major,
  s.thesis_year`;
exports.THESIS_METADATA_INSERT_COLUMNS = `
  student_email, title_vi, title_en, thesis_advisors, major, thesis_year`;
exports.THESIS_METADATA_GROUP_BY = `
  s.student_email,
  s.title_vi,
  s.title_en,
  s.thesis_advisors,
  s.major,
  s.thesis_year`;
//# sourceMappingURL=submission-metadata.js.map