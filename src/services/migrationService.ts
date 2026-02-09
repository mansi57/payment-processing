import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { databaseService } from './databaseService';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';

export interface Migration {
  version: string;
  checksum: string;
  appliedAt: Date;
}

export interface MigrationFile {
  version: string;
  filename: string;
  content: string;
  checksum: string;
}

export class MigrationService {
  private static instance: MigrationService;
  private migrationsPath: string;

  private constructor() {
    this.migrationsPath = path.join(__dirname, '../migrations');
  }

  public static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService();
    }
    return MigrationService.instance;
  }

  /**
   * Get all migration files from the migrations directory
   */
  private getMigrationFiles(): MigrationFile[] {
    const callId = logger.startServiceCall('migration', 'getMigrationFiles');
    
    try {
      if (!fs.existsSync(this.migrationsPath)) {
        logger.warn('Migrations directory does not exist', 'migration', 'getMigrationFiles');
        return [];
      }

      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure migrations run in order

      const migrationFiles: MigrationFile[] = files.map(filename => {
        const filePath = path.join(this.migrationsPath, filename);
        const content = fs.readFileSync(filePath, 'utf8');
        const version = filename.replace('.sql', '');
        const checksum = crypto.createHash('md5').update(content).digest('hex');

        return {
          version,
          filename,
          content,
          checksum
        };
      });

      logger.endServiceCall(callId, true, undefined, undefined, {
        migrationCount: migrationFiles.length,
      });

      logger.info(`Found ${migrationFiles.length} migration files`, 'migration', 'getMigrationFiles');
      return migrationFiles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error reading migrations';
      logger.endServiceCall(callId, false, undefined, errorMessage);
      
      logger.error('Failed to read migration files', 'migration', 'getMigrationFiles', undefined, {
        error: errorMessage,
        migrationsPath: this.migrationsPath,
      });
      throw error;
    }
  }

  /**
   * Get applied migrations from the database
   */
  private async getAppliedMigrations(req?: Request): Promise<Migration[]> {
    const callId = logger.startServiceCall('migration', 'getAppliedMigrations', req);
    
    try {
      // First, ensure the schema_migrations table exists
      await this.ensureMigrationsTable(req);

      const rows = await databaseService.query<Migration>(
        'SELECT version, checksum, applied_at as "appliedAt" FROM schema_migrations ORDER BY applied_at',
        [],
        req,
        'getAppliedMigrations'
      );

      logger.endServiceCall(callId, true, req, undefined, {
        appliedCount: rows.length,
      });

      logger.info(`Found ${rows.length} applied migrations`, 'migration', 'getAppliedMigrations', req);
      return rows;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error getting applied migrations';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Failed to get applied migrations', 'migration', 'getAppliedMigrations', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Ensure the schema_migrations table exists
   */
  private async ensureMigrationsTable(req?: Request): Promise<void> {
    const callId = logger.startServiceCall('migration', 'ensureMigrationsTable', req);
    
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          checksum VARCHAR(64)
        );
      `;

      await databaseService.query(createTableSQL, [], req, 'ensureMigrationsTable');
      
      logger.endServiceCall(callId, true, req);
      logger.info('Schema migrations table ensured', 'migration', 'ensureMigrationsTable', req);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating migrations table';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Failed to ensure migrations table', 'migration', 'ensureMigrationsTable', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Run pending migrations
   */
  public async migrate(req?: Request): Promise<{
    applied: string[];
    skipped: string[];
    total: number;
  }> {
    const callId = logger.startServiceCall('migration', 'migrate', req);
    
    try {
      const migrationFiles = this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations(req);
      
      const appliedVersions = new Set(appliedMigrations.map(m => m.version));
      const pendingMigrations = migrationFiles.filter(mf => !appliedVersions.has(mf.version));

      const applied: string[] = [];
      const skipped: string[] = [];

      // Validate checksums for already applied migrations
      for (const appliedMigration of appliedMigrations) {
        const migrationFile = migrationFiles.find(mf => mf.version === appliedMigration.version);
        if (migrationFile && migrationFile.checksum !== appliedMigration.checksum) {
          throw new Error(
            `Migration ${appliedMigration.version} has been modified after being applied. ` +
            `Expected checksum: ${appliedMigration.checksum}, but got: ${migrationFile.checksum}`
          );
        }
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`, 'migration', 'migrate', req, {
        pending: pendingMigrations.map(m => m.version),
        applied: Array.from(appliedVersions),
      });

      // Apply pending migrations
      for (const migration of pendingMigrations) {
        await this.applyMigration(migration, req);
        applied.push(migration.version);
      }

      // Mark already applied migrations as skipped
      migrationFiles.forEach(mf => {
        if (appliedVersions.has(mf.version)) {
          skipped.push(mf.version);
        }
      });

      const result = {
        applied,
        skipped,
        total: migrationFiles.length,
      };

      logger.endServiceCall(callId, true, req, undefined, result);
      
      logger.info('Migration completed successfully', 'migration', 'migrate', req, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown migration error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Migration failed', 'migration', 'migrate', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: MigrationFile, req?: Request): Promise<void> {
    const callId = logger.startServiceCall('migration', 'applyMigration', req, {
      version: migration.version,
      checksum: migration.checksum,
    });

    try {
      await databaseService.transaction(async (client) => {
        // Execute the migration SQL
        logger.info(`Applying migration: ${migration.version}`, 'migration', 'applyMigration', req);
        
        await client.query(migration.content);
        
        // Record the migration as applied
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
          [migration.version, migration.checksum]
        );

        logger.info(`Migration ${migration.version} applied successfully`, 'migration', 'applyMigration', req);
      }, req, 'applyMigration');

      logger.endServiceCall(callId, true, req, undefined, {
        version: migration.version,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error applying migration';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error(`Failed to apply migration: ${migration.version}`, 'migration', 'applyMigration', req, {
        error: errorMessage,
        version: migration.version,
      });
      throw error;
    }
  }

  /**
   * Get migration status
   */
  public async getStatus(req?: Request): Promise<{
    appliedMigrations: Migration[];
    pendingMigrations: string[];
    totalMigrations: number;
    lastAppliedAt?: Date;
  }> {
    const callId = logger.startServiceCall('migration', 'getStatus', req);
    
    try {
      const migrationFiles = this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations(req);
      
      const appliedVersions = new Set(appliedMigrations.map(m => m.version));
      const pendingMigrations = migrationFiles
        .filter(mf => !appliedVersions.has(mf.version))
        .map(mf => mf.version);

      const lastAppliedAt = appliedMigrations.length > 0 
        ? appliedMigrations[appliedMigrations.length - 1].appliedAt 
        : undefined;

      const status = {
        appliedMigrations,
        pendingMigrations,
        totalMigrations: migrationFiles.length,
        lastAppliedAt,
      };

      logger.endServiceCall(callId, true, req, undefined, {
        applied: appliedMigrations.length,
        pending: pendingMigrations.length,
        total: migrationFiles.length,
      });

      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error getting migration status';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Failed to get migration status', 'migration', 'getStatus', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Rollback the last migration (use with caution)
   */
  public async rollback(req?: Request): Promise<string | null> {
    const callId = logger.startServiceCall('migration', 'rollback', req);
    
    try {
      const appliedMigrations = await this.getAppliedMigrations(req);
      
      if (appliedMigrations.length === 0) {
        logger.warn('No migrations to rollback', 'migration', 'rollback', req);
        return null;
      }

      const lastMigration = appliedMigrations[appliedMigrations.length - 1];
      
      logger.warn(`Rolling back migration: ${lastMigration.version}`, 'migration', 'rollback', req);
      
      await databaseService.query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [lastMigration.version],
        req,
        'rollback'
      );

      logger.endServiceCall(callId, true, req, undefined, {
        rolledBack: lastMigration.version,
      });

      logger.warn(`Migration ${lastMigration.version} rollback completed`, 'migration', 'rollback', req);
      return lastMigration.version;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown rollback error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Migration rollback failed', 'migration', 'rollback', req, {
        error: errorMessage,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const migrationService = MigrationService.getInstance();




