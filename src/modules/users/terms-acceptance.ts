import { BadRequestException } from '@nestjs/common';

// Versión vigente de los Términos y Condiciones del panel (debe coincidir con VERSION.id de
// warike_administrativo/apps/dashboard/app/terminos-y-condiciones/page.tsx). Subirla obliga a aceptar de nuevo.
export const CURRENT_TERMS_VERSION = '2026-10-14';

export function assertCurrentTermsVersion(version: string): void {
    if (version !== CURRENT_TERMS_VERSION) {
        throw new BadRequestException('Debes aceptar la versión vigente de los Términos y Condiciones');
    }
}
