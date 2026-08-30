/** Declarative description of the credentials the admin panel surfaces. */
export interface SettingKeyDef {
  key: string;
  label: string;
  secret: boolean;
}

export interface ServiceDef {
  service: string;
  label: string;
  description: string;
  keys: SettingKeyDef[];
}

export const SETTINGS_CATALOG: ServiceDef[] = [
  {
    service: 'postgresql',
    label: 'PostgreSQL',
    description: 'Primary datastore for items, locations, stock levels and the movement audit log.',
    keys: [
      { key: 'DATABASE_URL', label: 'Connection URL', secret: true },
      { key: 'POSTGRES_HOST', label: 'Host', secret: false },
      { key: 'POSTGRES_PORT', label: 'Port', secret: false },
      { key: 'POSTGRES_DB', label: 'Database', secret: false },
      { key: 'POSTGRES_USER', label: 'User', secret: false },
      { key: 'POSTGRES_PASSWORD', label: 'Password', secret: true },
    ],
  },
  {
    service: 'minio',
    label: 'MinIO object storage',
    description: 'Provisioned but not yet consumed by any feature. Credentials are stored for future use.',
    keys: [
      { key: 'MINIO_ENDPOINT', label: 'Endpoint', secret: false },
      { key: 'MINIO_BUCKET', label: 'Bucket', secret: false },
      { key: 'MINIO_ACCESS_KEY', label: 'Access key', secret: true },
      { key: 'MINIO_SECRET_KEY', label: 'Secret key', secret: true },
    ],
  },
];

/** Only catalogued keys may be written — the panel is not a general env editor. */
export const WRITABLE_KEYS: Set<string> = new Set(
  SETTINGS_CATALOG.flatMap((service) => service.keys.map((k) => k.key)),
);
