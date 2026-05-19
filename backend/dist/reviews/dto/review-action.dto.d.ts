export declare class ReviewActionDto {
    submissionId: string;
    action: "approve" | "reject" | "archive";
    comment?: string;
}
