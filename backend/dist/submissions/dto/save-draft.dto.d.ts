import { ThesisMetadataFieldsDto } from "./thesis-metadata-fields.dto";
export declare class SaveDraftDto extends ThesisMetadataFieldsDto {
    authorIds?: string[];
    reviewerIds?: string[];
    abstract?: string;
    studentId: string;
    submissionPeriodId?: string;
}
