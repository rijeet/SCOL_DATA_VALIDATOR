import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Minimal production catalog tables for data-admin publish path:
 * lookups → UniCourses → UniCourseIntakes → scholarships / English reqs;
 * university-level UniAcademicReq / UniEngReq.
 * Does not create CRM, applications, or leads.
 */
export class DataAdminCatalogMinimal1789310000000 implements MigrationInterface {
  name = 'DataAdminCatalogMinimal1789310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Programmes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "name" character varying(255) NOT NULL,
        CONSTRAINT "PK_sys_Programmes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_SysProgrammes_name" ON "sys_Programmes" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_AcademicDegrees" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "degreeName" character varying(255) NOT NULL,
        "gpaScale" numeric(5,2),
        "levelOrder" integer NOT NULL,
        CONSTRAINT "PK_sys_AcademicDegrees" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_EnglishTests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "testName" character varying(255) NOT NULL,
        "maxScore" numeric(5,2),
        "levelOrder" integer,
        CONSTRAINT "PK_sys_EnglishTests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UniCourses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniId" uuid NOT NULL,
        "sysProgrammeId" uuid NOT NULL,
        "sysDegreeId" uuid NOT NULL,
        "courseName" character varying(255) NOT NULL,
        "minSysDegreeId" uuid,
        "minGpa" numeric(5,2),
        "higherSysDegreeId" uuid,
        "higherGpa" numeric(5,2),
        "requirementMetaData" jsonb,
        "externalUrl" character varying(2048),
        CONSTRAINT "PK_UniCourses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_UniCourses_uni" FOREIGN KEY ("uniId")
          REFERENCES "sys_Universities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UniCourses_programme" FOREIGN KEY ("sysProgrammeId")
          REFERENCES "sys_Programmes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_UniCourses_degree" FOREIGN KEY ("sysDegreeId")
          REFERENCES "sys_AcademicDegrees"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_UniCourses_minDegree" FOREIGN KEY ("minSysDegreeId")
          REFERENCES "sys_AcademicDegrees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_UniCourses_higherDegree" FOREIGN KEY ("higherSysDegreeId")
          REFERENCES "sys_AcademicDegrees"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniCourses_uniId" ON "UniCourses" ("uniId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniCourses_sysProgrammeId" ON "UniCourses" ("sysProgrammeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniCourses_courseName" ON "UniCourses" ("courseName")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UniCourseIntakes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniCourseId" uuid NOT NULL,
        "intakeMonth" integer NOT NULL,
        "intakeYear" integer NOT NULL,
        "intakeKey" integer GENERATED ALWAYS AS ("intakeYear" * 12 + "intakeMonth") STORED,
        "courseDuration" integer,
        "applicationDeadline" date,
        "tuitionFee" numeric(10,2),
        "currency" character varying(10),
        "initialDeposit" numeric(10,2),
        "initialDepositType" character varying(50),
        "intakeMetaData" jsonb,
        "feesMetaData" jsonb,
        "scholarshipMetaData" jsonb,
        "applicationFee" numeric(10,2),
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_UniCourseIntakes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_UniCourseIntakes_course" FOREIGN KEY ("uniCourseId")
          REFERENCES "UniCourses"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniCourseIntakes_uniCourseId" ON "UniCourseIntakes" ("uniCourseId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UniCourseIntakes_intakeKey" ON "UniCourseIntakes" ("intakeKey")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "CourseIntakeScholarships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "courseIntakeId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "amount" numeric(10,2),
        "amountType" character varying(50),
        "frequency" character varying(50),
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_CourseIntakeScholarships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_CourseIntakeScholarships_intake" FOREIGN KEY ("courseIntakeId")
          REFERENCES "UniCourseIntakes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_CourseIntakeScholarships_courseIntakeId" ON "CourseIntakeScholarships" ("courseIntakeId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UniAcademicReq" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniId" uuid NOT NULL,
        "sysDegreeId" uuid NOT NULL,
        "minGpa" numeric(5,2),
        CONSTRAINT "PK_UniAcademicReq" PRIMARY KEY ("id"),
        CONSTRAINT "FK_UniAcademicReq_uni" FOREIGN KEY ("uniId")
          REFERENCES "sys_Universities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UniAcademicReq_degree" FOREIGN KEY ("sysDegreeId")
          REFERENCES "sys_AcademicDegrees"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UniEngReq" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniId" uuid NOT NULL,
        "sysEngTestId" uuid NOT NULL,
        "minOverallReq" numeric(5,2),
        "minSectionReq" numeric(5,2),
        CONSTRAINT "PK_UniEngReq" PRIMARY KEY ("id"),
        CONSTRAINT "FK_UniEngReq_uni" FOREIGN KEY ("uniId")
          REFERENCES "sys_Universities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UniEngReq_test" FOREIGN KEY ("sysEngTestId")
          REFERENCES "sys_EnglishTests"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "CourseEngReq" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "uniCourseId" uuid NOT NULL,
        "sysEngTestId" uuid NOT NULL,
        "minOverallReq" numeric(5,2),
        "minSectionReq" numeric(5,2),
        CONSTRAINT "PK_CourseEngReq" PRIMARY KEY ("id"),
        CONSTRAINT "FK_CourseEngReq_course" FOREIGN KEY ("uniCourseId")
          REFERENCES "UniCourses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_CourseEngReq_test" FOREIGN KEY ("sysEngTestId")
          REFERENCES "sys_EnglishTests"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_CourseEngReq_uniCourseId" ON "CourseEngReq" ("uniCourseId")`,
    );

    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
      ADD COLUMN IF NOT EXISTS "sysUniversityId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "DataEntryBatches"
      ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "DataEntryBatches"
          ADD CONSTRAINT "FK_DataEntryBatches_sysUniversity"
          FOREIGN KEY ("sysUniversityId") REFERENCES "sys_Universities"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await this.seedLookups(queryRunner);
  }

  private async seedLookups(queryRunner: QueryRunner): Promise<void> {
    const degrees = [
      ['BSc', 1],
      ['BA', 1],
      ['BEng', 1],
      ['LLB', 1],
      ['MSc', 2],
      ['MA', 2],
      ['MBA', 2],
      ['PhD', 3],
    ] as const;
    for (const [name, level] of degrees) {
      await queryRunner.query(
        `
        INSERT INTO "sys_AcademicDegrees" ("degreeName", "levelOrder", "gpaScale")
        SELECT $1::varchar, $2::integer, 4.0
        WHERE NOT EXISTS (
          SELECT 1 FROM "sys_AcademicDegrees"
          WHERE "degreeName" = $1::varchar AND "deletedAt" IS NULL
        )
        `,
        [name, level],
      );
    }

    const tests = [
      ['IELTS', 1],
      ['TOEFL', 2],
      ['PTE', 3],
    ] as const;
    for (const [name, order] of tests) {
      await queryRunner.query(
        `
        INSERT INTO "sys_EnglishTests" ("testName", "levelOrder")
        SELECT $1::varchar, $2::integer
        WHERE NOT EXISTS (
          SELECT 1 FROM "sys_EnglishTests"
          WHERE "testName" = $1::varchar AND "deletedAt" IS NULL
        )
        `,
        [name, order],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP CONSTRAINT IF EXISTS "FK_DataEntryBatches_sysUniversity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "publishedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DataEntryBatches" DROP COLUMN IF EXISTS "sysUniversityId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "CourseEngReq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "UniEngReq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "UniAcademicReq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "CourseIntakeScholarships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "UniCourseIntakes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "UniCourses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_EnglishTests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_AcademicDegrees"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Programmes"`);
  }
}
