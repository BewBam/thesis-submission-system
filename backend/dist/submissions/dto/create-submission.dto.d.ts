import { ThesisMetadataFieldsDto } from "./thesis-metadata-fields.dto";
export declare class CreateSubmissionDto extends ThesisMetadataFieldsDto {
    titleVi: string;
    titleEn: string;
    authorIds: string[];
    reviewerIds: string[];
    thesisAdvisors: string;
    major: string;
    thesisYear: string;
    abstract: string;
    studentId: string;
    submissionPeriodId: string;
}
