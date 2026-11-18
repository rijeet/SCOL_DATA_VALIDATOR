import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataAdminDegreeSeeds1789700000000 implements MigrationInterface {
  name = 'DataAdminDegreeSeeds1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sys_AcademicDegrees" ALTER COLUMN "levelOrder" DROP NOT NULL`,
    );

    const seeds = [
      ['SSC', 1, '5.00'],
      ['HSC', 2, '5.00'],
      ['BSc', 3, '4.00'],
      ['MSc', 4, '4.00'],
    ] as const;

    for (const [degreeName, levelOrder, gpaScale] of seeds) {
      await queryRunner.query(
        `
        INSERT INTO "sys_AcademicDegrees" ("degreeName", "levelOrder", "gpaScale")
        SELECT $1::varchar, $2::integer, $3::numeric
        WHERE NOT EXISTS (
          SELECT 1 FROM "sys_AcademicDegrees"
          WHERE lower(trim("degreeName")) = lower(trim($1::varchar))
            AND "deletedAt" IS NULL
        )
        `,
        [degreeName, levelOrder, gpaScale],
      );
      await queryRunner.query(
        `
        UPDATE "sys_AcademicDegrees"
        SET "degreeName" = $1::varchar,
            "levelOrder" = $2::integer,
            "gpaScale" = $3::numeric,
            "updatedAt" = now()
        WHERE lower(trim("degreeName")) = lower(trim($1::varchar))
          AND "deletedAt" IS NULL
        `,
        [degreeName, levelOrder, gpaScale],
      );
    }

    await queryRunner.query(`
      UPDATE "sys_AcademicDegrees"
      SET "levelOrder" = NULL,
          "updatedAt" = now()
      WHERE "deletedAt" IS NULL
        AND lower(trim("degreeName")) NOT IN ('ssc', 'hsc', 'bsc', 'msc')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "sys_AcademicDegrees"
      SET "levelOrder" = 1
      WHERE "levelOrder" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "sys_AcademicDegrees" ALTER COLUMN "levelOrder" SET NOT NULL`,
    );
  }
}
