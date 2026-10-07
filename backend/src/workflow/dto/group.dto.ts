import { IsArray, IsIn, IsString, MinLength } from "class-validator";

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(["student", "reviewer"])
  kind!: "student" | "reviewer";
}

export class SetGroupMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class SetGroupGrantsDto {
  @IsArray()
  @IsString({ each: true })
  studentGroupIds!: string[];
}
