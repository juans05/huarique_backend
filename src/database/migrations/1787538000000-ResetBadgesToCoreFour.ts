import { MigrationInterface, QueryRunner } from 'typeorm';

// Los 4 badges originales usaban criteria.type que el código nunca evaluó
// (checkins/checkins_district/checkins_category/checkins_rarity vs. lo que
// checkAndAwardBadges realmente compara) — nunca se otorgó ninguno. Se
// reemplazan por los 4 que sí tienen lógica real: descubridor, explorador
// de distrito, racha, top de la semana (este último lo otorga el cron).
export class ResetBadgesToCoreFour1787538000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM wuarike_db.badges`);

    await queryRunner.query(`
      INSERT INTO wuarike_db.badges (id, name, description, icon_url, criteria) VALUES
      (gen_random_uuid(), 'Descubridor', 'Registraste un restaurante nuevo y fue aprobado.', '🔥', '{"type":"place_approved","threshold":1}'),
      (gen_random_uuid(), 'Explorador de Distrito', 'Hiciste 5 check-ins en el mismo distrito.', '🧭', '{"type":"checkins_in_one_district","threshold":5}'),
      (gen_random_uuid(), 'Racha Wuarikera', 'Hiciste check-in 3 días seguidos.', '🔥', '{"type":"streak","threshold":3}'),
      (gen_random_uuid(), 'Top de la Semana', 'Fuiste quien más check-ins hizo en una semana.', '👑', '{"type":"weekly_top"}')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM wuarike_db.badges`);
    await queryRunner.query(`
      INSERT INTO wuarike_db.badges (id, name, description, criteria) VALUES
      (gen_random_uuid(), 'Primer Bocado', 'Realiza tu primer check-in en cualquier Wuarike.', '{"type":"checkins","count":1}'),
      (gen_random_uuid(), 'Explorador de San Miguel', 'Visita 5 lugares diferentes en el distrito de San Miguel.', '{"type":"checkins_district","district":"San Miguel","count":5}'),
      (gen_random_uuid(), 'Rey del Ceviche', 'Haz check-in en 3 cevicherías o restaurantes marinos.', '{"type":"checkins_category","category":"Marino","count":3}'),
      (gen_random_uuid(), 'Cazador Legendario', 'Descubre un lugar de rareza LEGENDARIO.', '{"type":"checkins_rarity","rarity":"LEGENDARIO","count":1}')
    `);
  }
}
