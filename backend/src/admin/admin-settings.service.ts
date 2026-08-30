import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLACEHOLDER, resolveConfig } from '../lib/config';
import { SETTINGS_CATALOG, WRITABLE_KEYS } from './settings.catalog';
import { SettingEntryDto } from './dto/update-settings.dto';

export interface SettingRowView {
  key: string;
  label: string;
  value: string;
  configured: boolean;
  secret: boolean;
  source: 'env' | 'db' | null;
}

export interface ServiceSettingsView {
  service: string;
  label: string;
  description: string;
  configured: boolean;
  rows: SettingRowView[];
}

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ServiceSettingsView[]> {
    const rows = await this.prisma.systemSetting.findMany();
    const dbValues = new Map(rows.map((row) => [row.key, row.value]));

    return SETTINGS_CATALOG.map((service) => {
      const viewRows: SettingRowView[] = service.keys.map((def) => {
        const envValue = process.env[def.key];
        const envGood = !!envValue && envValue !== PLACEHOLDER;
        const dbValue = dbValues.get(def.key);
        const dbGood = !!dbValue && dbValue !== PLACEHOLDER;
        const resolved = envGood ? envValue : dbGood ? dbValue : '';

        return {
          key: def.key,
          label: def.label,
          // Secrets are never echoed back in full: the panel confirms that a
          // value exists without turning an admin screen into a credential dump.
          value: resolved ? (def.secret ? AdminSettingsService.mask(resolved) : resolved) : '',
          configured: resolved.length > 0,
          secret: def.secret,
          source: envGood ? 'env' : dbGood ? 'db' : null,
        };
      });

      return {
        service: service.service,
        label: service.label,
        description: service.description,
        configured: viewRows.every((row) => row.configured),
        rows: viewRows,
      };
    });
  }

  async update(entries: SettingEntryDto[]): Promise<ServiceSettingsView[]> {
    const unknown = entries.filter((entry) => !WRITABLE_KEYS.has(entry.key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown setting key(s): ${unknown.map((u) => u.key).join(', ')}`);
    }

    for (const entry of entries) {
      const value = entry.value.trim();
      if (value.length === 0) {
        // An emptied field clears the override so the env value (if any) wins again.
        await this.prisma.systemSetting.deleteMany({ where: { key: entry.key } });
        continue;
      }
      await this.prisma.systemSetting.upsert({
        where: { key: entry.key },
        update: { value },
        create: { key: entry.key, value },
      });
    }

    return this.list();
  }

  /** Shows only the tail so an admin can tell two credentials apart. */
  private static mask(value: string): string {
    const tail = value.slice(-4);
    return `${'•'.repeat(Math.min(10, Math.max(4, value.length - 4)))}${tail}`;
  }

  /** Kept for feature code that needs a credential at call time. */
  resolve(key: string): Promise<string | null> {
    return resolveConfig(key, this.prisma);
  }
}
