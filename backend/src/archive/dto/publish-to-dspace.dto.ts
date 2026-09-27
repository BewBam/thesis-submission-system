import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class PublishToDspaceDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  submissionIds!: string[];

  @IsString()
  @MinLength(8)
  collectionId!: string;
}

export class PublishQueueQueryDto {
  @IsOptional()
  @IsUUID()
  facultyId?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsUUID()
  periodId?: string;

  @IsOptional()
  @IsString()
  dspaceStatus?: string;
}
