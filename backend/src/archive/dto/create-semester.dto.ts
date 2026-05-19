import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateSemesterDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  collectionName?: string;
}
