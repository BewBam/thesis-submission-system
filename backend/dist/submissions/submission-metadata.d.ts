export type ThesisMetadataInput = {
    email?: string;
    title?: string;
    titleVi?: string;
    titleEn?: string;
    thesisAdvisors?: string;
    major?: string;
    thesisYear?: string;
};
export type NormalizedThesisMetadata = {
    email: string;
    titleVi: string;
    titleEn: string;
    title: string;
    thesisAdvisors: string;
    major: string;
    thesisYear: string;
};
export declare function buildStudentEmail(username: string, emailOverride?: string): string;
export declare function normalizeThesisMetadata(dto: ThesisMetadataInput, username: string, options: {
    required: boolean;
}): NormalizedThesisMetadata;
export declare function mergeThesisMetadata(dto: ThesisMetadataInput, username: string, existing: Partial<NormalizedThesisMetadata>, options: {
    required: boolean;
}): NormalizedThesisMetadata;
export declare const THESIS_METADATA_SELECT = "\n  s.student_email,\n  s.title_vi,\n  s.title_en,\n  s.thesis_advisors,\n  s.major,\n  s.thesis_year";
export declare const THESIS_METADATA_INSERT_COLUMNS = "\n  student_email, title_vi, title_en, thesis_advisors, major, thesis_year";
export declare const THESIS_METADATA_GROUP_BY = "\n  s.student_email,\n  s.title_vi,\n  s.title_en,\n  s.thesis_advisors,\n  s.major,\n  s.thesis_year";
