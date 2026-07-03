import { IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { CrmType } from '@prisma/client';

export class CreateConnectionDto {
  @IsEnum(CrmType)
  type: CrmType;

  @IsString()
  @MinLength(1)
  name: string;

  // amoCRM: https://subdomain.amocrm.ru
  // Битрикс24: URL входящего вебхука https://portal.bitrix24.ru/rest/1/xxxxxxxx/
  @IsUrl({ require_tld: false })
  baseUrl: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  // amoCRM: долгосрочный токен (альтернатива OAuth)
  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  // Битрикс24: application_token исходящего вебхука (необязательная доп. защита)
  @IsOptional()
  @IsString()
  appToken?: string;
}

export class UpdateConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  appToken?: string;
}
