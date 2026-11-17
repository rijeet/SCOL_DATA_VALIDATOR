import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataEntryStaging1789100000000 implements MigrationInterface {
  name = 'DataEntryStaging1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "DataEntryBatches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "universityKey" character varying(512) NOT NULL,
        "displayName" character varying(512) NOT NULL,
        "csvObjectKey" character varying(1024) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'IMPORTING',
        "rowCount" integer NOT NULL DEFAULT 0,
        "invalidRowCount" integer NOT NULL DEFAULT 0,
        "helperObjectKeys" jsonb,
        "createdByUserId" uuid,
        CONSTRAINT "PK_DataEntryBatches" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IX_DataEntryBatches_universityKey" ON "DataEntryBatches" ("universityKey")`,
    );

    await queryRunner.query(`
      CREATE TABLE "DataEntryCourseRows" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "batchId" uuid NOT NULL,
        "rowIndex" integer NOT NULL,
        "fields" jsonb NOT NULL,
        "fieldErrors" jsonb NOT NULL DEFAULT '{}',
        "isValid" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_DataEntryCourseRows" PRIMARY KEY ("id"),
        CONSTRAINT "FK_DataEntryCourseRows_batch" FOREIGN KEY ("batchId")
          REFERENCES "DataEntryBatches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IX_DataEntryCourseRows_batchId_rowIndex" ON "DataEntryCourseRows" ("batchId", "rowIndex")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_DataEntryCourseRows_batchId_rowIndex"`,
    );
    await queryRunner.query(`DROP TABLE "DataEntryCourseRows"`);
    await queryRunner.query(
      `DROP INDEX "public"."IX_DataEntryBatches_universityKey"`,
    );
    await queryRunner.query(`DROP TABLE "DataEntryBatches"`);
  }
}
