import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Этап воронки: ID и человекочитаемое название для отображения в таблице. */
export class MappingStatusDto {
  @IsString()
  @MinLength(1)
  id: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateMappingDto {
  @IsString()
  connectionId: string;

  @IsString()
  destinationId: string;

  // amoCRM: lead; Битрикс24: deal | lead
  @IsIn(['lead', 'deal'])
  entityType: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  pipelineName?: string;

  // Одиночный этап. Игнорируется, если передан statuses.
  @IsOptional()
  @IsString()
  @MinLength(1)
  statusId?: string;

  @IsOptional()
  @IsString()
  statusName?: string;

  // Несколько этапов сразу — на каждый создаётся отдельный маппинг
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MappingStatusDto)
  statuses?: MappingStatusDto[];

  // Lead, Purchase, CompleteRegistration, Schedule и т.д.
  @IsString()
  @MinLength(1)
  eventName: string;

  @IsOptional()
  @IsBoolean()
  sendValue?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateMappingDto {
  @IsOptional()
  @IsString()
  connectionId?: string;

  @IsOptional()
  @IsString()
  destinationId?: string;

  @IsOptional()
  @IsIn(['lead', 'deal'])
  entityType?: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  pipelineName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  statusId?: string;

  @IsOptional()
  @IsString()
  statusName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  eventName?: string;

  @IsOptional()
  @IsBoolean()
  sendValue?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
