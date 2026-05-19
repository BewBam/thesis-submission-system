import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ReviewActionDto {
  @IsString()
  @IsNotEmpty()
  submissionId!: string;

  @IsString()
  @IsIn(["approve", "reject", "archive"])
  action!: "approve" | "reject" | "archive";

  @IsString()
  @IsOptional()
  comment?: string;
}
