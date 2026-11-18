import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataAdminCourseKey1789800000000 implements MigrationInterface {
  name = 'DataAdminCourseKey1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "UniCourses"
        ADD COLUMN IF NOT EXISTS "courseKey" character varying(180)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniCourses_courseKey" ON "UniCourses" ("courseKey")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_UniCourses_uniId_courseKey"
        ON "UniCourses" ("uniId", "courseKey")
        WHERE "deletedAt" IS NULL AND "courseKey" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_UniCourses_uniId_courseKey"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IX_UniCourses_courseKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "UniCourses" DROP COLUMN IF EXISTS "courseKey"`,
    );
  }
}
