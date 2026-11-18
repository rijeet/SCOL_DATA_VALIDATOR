import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataAdminAmountTypes1789600000000 implements MigrationInterface {
  name = 'DataAdminAmountTypes1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_AmountTypes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "typeName" character varying(50) NOT NULL,
        "typeCode" character varying(20) NOT NULL,
        "displayOrder" integer NOT NULL,
        CONSTRAINT "PK_sys_AmountTypes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sys_AmountTypes_typeName" UNIQUE ("typeName"),
        CONSTRAINT "UQ_sys_AmountTypes_typeCode" UNIQUE ("typeCode")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_sys_AmountTypes_displayOrder" ON "sys_AmountTypes" ("displayOrder")`,
    );
    await queryRunner.query(`
      INSERT INTO "sys_AmountTypes" ("typeName", "typeCode", "displayOrder")
      SELECT v."typeName", v."typeCode", v."displayOrder"
      FROM (VALUES
        ('Amount', 'AMOUNT', 1),
        ('Percentage', 'PERCENTAGE', 2)
      ) AS v("typeName", "typeCode", "displayOrder")
      WHERE NOT EXISTS (
        SELECT 1 FROM "sys_AmountTypes" t
        WHERE t."typeName" = v."typeName" AND t."deletedAt" IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_AmountTypes"`);
  }
}
