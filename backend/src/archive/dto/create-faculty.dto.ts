import { IsString, MinLength } from "class-validator";

export class CreateFacultyDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
