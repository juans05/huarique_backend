import { MigrationInterface, QueryRunner } from 'typeorm';

// Un número de WhatsApp (phone_number_id de Meta) pertenece a un solo local. Hoy lo cuida el código;
// el índice lo asegura también si dos conexiones llegan a la vez.
// Si ya hay duplicados, no se crea nada y se listan para que el admin decida cuál queda.
export class UniqueWhatsappPhoneNumberId1787730000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const dups: { phone_number_id: string; total: string }[] = await queryRunner.query(
      `SELECT phone_number_id, COUNT(*) AS total FROM wuarike_db.whatsapp_numbers
       WHERE phone_number_id IS NOT NULL AND phone_number_id <> ''
       GROUP BY phone_number_id HAVING COUNT(*) > 1`,
    );
    if (dups.length) {
      throw new Error(
        `Hay números de WhatsApp repetidos en varios locales; resuélvelos antes de esta migración: ` +
          dups.map((d) => `${d.phone_number_id} (${d.total})`).join(', '),
      );
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_numbers_phone_number_id
       ON wuarike_db.whatsapp_numbers (phone_number_id)
       WHERE phone_number_id IS NOT NULL AND phone_number_id <> ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.uq_whatsapp_numbers_phone_number_id`);
  }
}
