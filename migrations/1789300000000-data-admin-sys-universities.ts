import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * sys_Countries + sys_Universities for data-admin university picker.
 * Catalog tables (courses, intakes, scholarships, academic/English) are in
 * migration 1789310000000-data-admin-catalog-minimal.
 * Safe when tables already exist (IF NOT EXISTS).
 */
export class DataAdminSysUniversities1789300000000 implements MigrationInterface {
  name = 'DataAdminSysUniversities1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Countries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "countryName" character varying(255) NOT NULL,
        "countryCode" character varying(10),
        CONSTRAINT "PK_sys_Countries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_SysCountries_countryName" ON "sys_Countries" ("countryName")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Universities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniName" character varying(255) NOT NULL,
        "sysCountryId" uuid NOT NULL,
        "sysStateId" uuid,
        "sysCityId" uuid,
        "logoUrl" character varying(2048),
        "website" character varying(2048),
        "aboutUs" text,
        "address" character varying(500),
        "coverImageUrl" character varying(2048),
        "campusLifeLinks" text,
        "commission" numeric(10,2),
        "commissionType" character varying(20),
        "establishedYear" integer,
        "universityType" character varying(100),
        "locationMapMetaData" character varying,
        "currRanking" integer,
        "rankingMetaData" jsonb,
        CONSTRAINT "PK_sys_Universities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sys_Universities_country" FOREIGN KEY ("sysCountryId")
          REFERENCES "sys_Countries"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_SysUniversities_sysCountryId" ON "sys_Universities" ("sysCountryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_SysUniversities_uniName" ON "sys_Universities" ("uniName")`,
    );

    await queryRunner.query(`
      INSERT INTO "sys_Countries" ("countryName", "countryCode")
      SELECT 'United Kingdom', 'GB'
      WHERE NOT EXISTS (
        SELECT 1 FROM "sys_Countries" WHERE "countryCode" = 'GB' AND "deletedAt" IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Universities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Countries"`);
  }
}
