import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Minimal schema for the data-admin backend only:
 * admin login (users, roles, sessions) + optional permissions junction.
 * Does not create CRM, leads, courses catalog, or applications.
 *
 * Safe to run when tables already exist (IF NOT EXISTS).
 */
export class DataAdminAuthMinimal1789200000000 implements MigrationInterface {
  name = 'DataAdminAuthMinimal1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "name" character varying(255) NOT NULL,
        CONSTRAINT "PK_sys_Roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IX_SysRoles_name" ON "sys_Roles" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "name" character varying(255) NOT NULL,
        CONSTRAINT "PK_sys_Permissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IX_SysPermissions_name" ON "sys_Permissions" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_Users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "email" character varying(255),
        "phone" character varying(50) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        "accountStatus" character varying(50) NOT NULL DEFAULT 'NOT_VALID',
        "userType" character varying(50) NOT NULL DEFAULT 'LEAD',
        "isPhoneVerified" boolean NOT NULL DEFAULT false,
        "failedLoginAttempts" integer NOT NULL DEFAULT 0,
        "lockedUntil" TIMESTAMP WITH TIME ZONE,
        "lastFailedLoginAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_sys_Users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sys_Users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_sys_Users_phone" UNIQUE ("phone")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IX_SysUsers_email" ON "sys_Users" ("email")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IX_SysUsers_phone" ON "sys_Users" ("phone")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UserRoles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UserRoles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_UserRoles_user" FOREIGN KEY ("user_id")
          REFERENCES "sys_Users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UserRoles_role" FOREIGN KEY ("role_id")
          REFERENCES "sys_Roles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_UserRoles_user_id" ON "UserRoles" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_UserRoles_role_id" ON "UserRoles" ("role_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UserPermissions" (
        "user_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UserPermissions" PRIMARY KEY ("user_id", "permission_id"),
        CONSTRAINT "FK_UserPermissions_user" FOREIGN KEY ("user_id")
          REFERENCES "sys_Users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UserPermissions_permission" FOREIGN KEY ("permission_id")
          REFERENCES "sys_Permissions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_UserPermissions_user_id" ON "UserPermissions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_UserPermissions_permission_id" ON "UserPermissions" ("permission_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "UserSessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid NOT NULL,
        "refreshTokenHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "revokedReason" character varying(100),
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "ipAddress" character varying(100),
        "userAgent" character varying(512),
        CONSTRAINT "PK_UserSessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_UserSessions_user" FOREIGN KEY ("user_id")
          REFERENCES "sys_Users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UserSessions_user_id" ON "UserSessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IX_UserSessions_expiresAt" ON "UserSessions" ("expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "UserSessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "UserPermissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "UserRoles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_Roles"`);
  }
}
