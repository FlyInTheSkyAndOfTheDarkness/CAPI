import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  // Маппинги, аналитику которых наблюдателю разрешено смотреть
  @IsArray()
  @IsString({ each: true })
  mappingIds: string[];
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mappingIds?: string[];
}
