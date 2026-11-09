import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DestinationType } from '@prisma/client';

export class TestDestinationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  testEventCode?: string;
}

export class CreateDestinationDto {
  @IsEnum(DestinationType)
  type: DestinationType;

  @IsString()
  @MinLength(1)
  name: string;

  // Meta: Pixel ID; TikTok: event source id (pixel code)
  @IsString()
  @MinLength(1)
  pixelId: string;

  @IsString()
  @MinLength(1)
  accessToken: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adsAccessToken?: string;

  @IsOptional()
  @IsString()
  testEventCode?: string;

  // { actionSource?: string } для Meta, { eventSource?: string } для TikTok
  @IsOptional()
  @IsObject()
  config?: Record<string, string>;
}

export class UpdateDestinationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  pixelId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  // null явно удаляет отдельный токен; отсутствие поля сохраняет прежний.
  @IsOptional()
  @IsString()
  @MinLength(1)
  adsAccessToken?: string | null;

  @IsOptional()
  @IsString()
  testEventCode?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
