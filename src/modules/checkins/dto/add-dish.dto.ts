import { IsString, IsOptional, MaxLength, IsNumber, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddDishDto {
  @ApiProperty({ example: 'Lomo saltado', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  dishName: string;

  @ApiPropertyOptional({ example: 28 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dishPrice?: number;
}
