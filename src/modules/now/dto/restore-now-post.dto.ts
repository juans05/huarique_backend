import { Equals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Lo único que moderación puede cambiar de una publicación: volver a mostrarla. Ocultar es automático. */
export class RestoreNowPostDto {
    @ApiProperty({ enum: [false], description: 'Solo se acepta false: restaura la publicación y borra sus reportes' })
    @Equals(false)
    hidden: false;
}
