import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'platformPermissions';
/** Permiso del equipo de Wuarikes que exige la ruta (basta con uno de la lista). Lo valida RolesGuard. */
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
