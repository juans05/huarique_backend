import 'dotenv/config';
import { ZernioService } from '../modules/social/zernio.service';

async function main() {
    if (!process.env.ZERNIO_API_KEY) {
        console.error('❌ ZERNIO_API_KEY no configurada en .env');
        process.exit(1);
    }

    const zernio = new ZernioService();
    let profileId: string | undefined;

    console.log('🔌 Verificando API de Zernio (huarique_backend)...\n');

    try {
        console.log('1) Creando perfil de prueba...');
        profileId = await zernio.createProfile('wuarikes-verify-test');
        console.log(`   ✅ Perfil creado: ${profileId}`);
    } catch (err: any) {
        console.error(`   ❌ Error creando perfil: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message)}`);
        process.exit(1);
    }

    try {
        console.log('\n2) Generando URL de conexión Instagram...');
        const authUrl = await zernio.generateConnectUrl(profileId!, 'instagram', 'https://example.com/callback');
        console.log(`   ✅ authUrl: ${authUrl}`);
    } catch (err: any) {
        console.error(`   ⚠️  Error: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message)}`);
    }

    try {
        console.log('\n3) Listando cuentas activas del perfil (debería salir vacío, es un perfil nuevo)...');
        const accounts = await zernio.getActivePlatforms(profileId!);
        console.log(`   ✅ Cuentas: ${JSON.stringify(accounts)}`);
    } catch (err: any) {
        console.error(`   ⚠️  Error: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message)}`);
    }

    if (profileId) {
        try {
            console.log('\n4) Limpiando perfil de prueba...');
            await zernio.deleteProfile(profileId);
            console.log('   ✅ Perfil eliminado');
        } catch (err: any) {
            console.error(`   ⚠️  No se pudo eliminar el perfil de prueba (no crítico): ${err.response?.status || err.message}`);
        }
    }

    console.log('\n✅ Verificación de conectividad completada.');
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
