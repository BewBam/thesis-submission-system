import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MinLength } from "class-validator";

export class BulkDeleteUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  userIds!: string[];
}
