import { IsString, MinLength } from "class-validator";

export class CreateSemesterDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
