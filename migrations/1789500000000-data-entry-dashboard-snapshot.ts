import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataEntryDashboardSnapshot1789500000000
  implements MigrationInterface
{
  name = 'DataEntryDashboardSnapshot1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "DataEntryDashboardSnapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "payload" jsonb NOT NULL,
        "updatedByUserId" uuid,
        CONSTRAINT "PK_DataEntryDashboardSnapshots" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "DataEntryDashboardSnapshots"`,
    );
  }
}
