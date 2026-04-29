import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ReviewActionDto {
  @IsString()
  @IsNotEmpty()
  submissionId!: string;

  @IsString()
  @IsIn(["approve", "reject"])
  action!: "approve" | "reject";

  @IsString()
  @IsOptional()
  comment?: string;
}
