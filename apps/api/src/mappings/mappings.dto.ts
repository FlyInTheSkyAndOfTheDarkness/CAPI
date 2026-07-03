import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  statusName?: string;

  @IsString()
  @MinLength(1)
  statusId: string;

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
  pipelineId?: string;

  @IsOptional()
  @IsString()
  statusId?: string;

  @IsOptional()
  @IsString()
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
