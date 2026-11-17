import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Country-first bulk import: university staging, geo tables, application
 * stages, unique catalog keys, and extra DataEntryBatches columns.
 */
export class DataAdminBulkImport1789400000000 implements MigrationInterface {
  name = 'DataAdminBulkImport1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_States" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "sysCountryId" uuid NOT NULL,
        "stateName" character varying(255) NOT NULL,
        CONSTRAINT "PK_sys_States" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sys_States_country" FOREIGN KEY ("sysCountryId")
          REFERENCES "sys_Countries"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_SysStates_sysCountryId" ON "sys_States" ("sysCountryId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Cities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "sysStateId" uuid NOT NULL,
        "cityName" character varying(255) NOT NULL,
        CONSTRAINT "PK_sys_Cities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sys_Cities_state" FOREIGN KEY ("sysStateId")
          REFERENCES "sys_States"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_SysCities_sysStateId" ON "sys_Cities" ("sysStateId")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "sys_Universities"
          ADD CONSTRAINT "FK_sys_Universities_state"
          FOREIGN KEY ("sysStateId") REFERENCES "sys_States"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "sys_Universities"
          ADD CONSTRAINT "FK_sys_Universities_city"
          FOREIGN KEY ("sysCityId") REFERENCES "sys_Cities"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_ApplicationStage" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "stageCode" character varying(100) NOT NULL,
        "stageName" character varying(255),
        "stageOrder" integer,
        "isTerminal" boolean,
        "stageInformation" character varying(2000),
        CONSTRAINT "PK_sys_ApplicationStage" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sys_ApplicationStage_stageCode" ON "sys_ApplicationStage" ("stageCode")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UniApplicationStage" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniId" uuid NOT NULL,
        "sysApplicationStageId" uuid NOT NULL,
        "displayOrder" integer NOT NULL,
        "isEnabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_UniApplicationStage" PRIMARY KEY ("id"),
        CONSTRAINT "FK_UniApplicationStage_uni" FOREIGN KEY ("uniId")
          REFERENCES "sys_Universities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UniApplicationStage_stage" FOREIGN KEY ("sysApplicationStageId")
          REFERENCES "sys_ApplicationStage"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_UniApplicationStage_uni_stage" ON "UniApplicationStage" ("uniId", "sysApplicationStageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniApplicationStage_uni_displayOrder" ON "UniApplicationStage" ("uniId", "displayOrder")`,
    );

    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
        ADD COLUMN IF NOT EXISTS "batchType" character varying(32) NOT NULL DEFAULT 'COURSE'
    `);
    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
        ADD COLUMN IF NOT EXISTS "sysCountryId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
        ADD COLUMN IF NOT EXISTS "sourceFileName" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
        ADD COLUMN IF NOT EXISTS "helperDocs" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
        ADD COLUMN IF NOT EXISTS "failureReason" text
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "DataEntryBatches"
          ADD CONSTRAINT "FK_DataEntryBatches_sysCountry"
          FOREIGN KEY ("sysCountryId") REFERENCES "sys_Countries"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_DataEntryBatches_sysCountryId" ON "DataEntryBatches" ("sysCountryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_DataEntryBatches_batchType" ON "DataEntryBatches" ("batchType")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "DataEntryUniversityRows" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "batchId" uuid NOT NULL,
        "rowIndex" integer NOT NULL,
        "fields" jsonb NOT NULL,
        "fieldErrors" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "isValid" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_DataEntryUniversityRows" PRIMARY KEY ("id"),
        CONSTRAINT "FK_DataEntryUniversityRows_batch" FOREIGN KEY ("batchId")
          REFERENCES "DataEntryBatches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IX_DataEntryUniversityRows_batchId_rowIndex" ON "DataEntryUniversityRows" ("batchId", "rowIndex")`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SysCountries_name"
      ON "sys_Countries" (lower(trim("countryName")))
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SysStates_country_name"
      ON "sys_States" ("sysCountryId", lower(trim("stateName")))
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SysCities_state_name"
      ON "sys_Cities" ("sysStateId", lower(trim("cityName")))
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SysUniversities_name"
      ON "sys_Universities" (lower(trim("uniName")))
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SysProgrammes_name"
      ON "sys_Programmes" (lower(trim("name")))
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_UniCourses_uni_name_degree"
      ON "UniCourses" ("uniId", lower(trim("courseName")), "sysDegreeId")
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_UniCourseIntakes_course_year_month"
      ON "UniCourseIntakes" ("uniCourseId", "intakeYear", "intakeMonth")
      WHERE "deletedAt" IS NULL
    `);

    await this.seedCountries(queryRunner);
    await this.seedApplicationStages(queryRunner);
  }

  private async seedCountries(queryRunner: QueryRunner): Promise<void> {
    const countries: Array<[string, string]> = [
      ['United Kingdom', 'GB'],
      ['Australia', 'AU'],
      ['Germany', 'DE'],
    ];
    for (const [name, code] of countries) {
      await queryRunner.query(
        `
        INSERT INTO "sys_Countries" ("countryName", "countryCode")
        SELECT $1::varchar, $2::varchar
        WHERE NOT EXISTS (
          SELECT 1 FROM "sys_Countries"
          WHERE ("countryCode" = $2::varchar OR lower(trim("countryName")) = lower(trim($1::varchar)))
            AND "deletedAt" IS NULL
        )
        `,
        [name, code],
      );
    }
  }

  private async seedApplicationStages(queryRunner: QueryRunner): Promise<void> {
    const stages: Array<[string, string, number, boolean]> = [
      ['REVIEW', 'Review', 1, false],
      ['SUBMITTED', 'Submitted', 2, false],
      ['CONDITIONAL', 'Conditional', 3, false],
      ['UNCONDITIONAL', 'Unconditional', 4, false],
      ['INTERVIEW', 'Interview', 5, false],
      ['PAYMENT', 'Payment', 6, false],
      ['CAS_COE', 'CAS / COE', 7, false],
      ['VISA', 'Visa', 8, false],
      ['ENROLLED', 'Enrolled', 9, false],
      ['COLLECT_COMMISSION', 'Collect commission', 10, false],
      ['COMPLETED', 'Completed', 11, true],
    ];
    for (const [code, name, order, terminal] of stages) {
      await queryRunner.query(
        `
        INSERT INTO "sys_ApplicationStage" ("stageCode", "stageName", "stageOrder", "isTerminal")
        SELECT $1::varchar, $2::varchar, $3::integer, $4::boolean
        WHERE NOT EXISTS (
          SELECT 1 FROM "sys_ApplicationStage"
          WHERE "stageCode" = $1::varchar AND "deletedAt" IS NULL
        )
        `,
        [code, name, order, terminal],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_UniCourseIntakes_course_year_month"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_UniCourses_uni_name_degree"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_SysProgrammes_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_SysUniversities_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_SysCities_state_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_SysStates_country_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_SysCountries_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "DataEntryUniversityRows"`);
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP CONSTRAINT IF EXISTS "FK_DataEntryBatches_sysCountry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "failureReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "helperDocs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "sourceFileName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "sysCountryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "batchType"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "UniApplicationStage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_ApplicationStage"`);
    await queryRunner.query(
      `ALTER TABLE "sys_Universities" DROP CONSTRAINT IF EXISTS "FK_sys_Universities_city"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sys_Universities" DROP CONSTRAINT IF EXISTS "FK_sys_Universities_state"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Cities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_States"`);
  }
}
