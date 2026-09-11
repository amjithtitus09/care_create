export interface EnvVar {
  key: string;
  default?: string;
  prompt?: boolean;
  secret?: boolean;
  description?: string;
}

export interface BackendPlug {
  name: string;
  description?: string;
  repo: string;
  branch: string;
  dir: string;
  packageName: string;
  version?: string;
  env?: EnvVar[];
}

export interface FrontendPlug {
  name: string;
  description?: string;
  repo: string;
  branch: string;
  dir: string;
  enabledApp: string; // "org/repo" — care_fe rejects a bare repo name in REACT_ENABLED_APPS
  devUrl?: string;
  devCommand?: string;
  remoteEntryUrl?: string;
  pluginConfig?: { config?: Record<string, unknown> };
  env?: EnvVar[];
}

export interface CoreRepo {
  repo: string;
  branch: string;
  dir: string;
}

export interface Registry {
  core: { backend: CoreRepo; frontend: CoreRepo };
  backend: BackendPlug[];
  frontend: FrontendPlug[];
}

export type Runtime = "docker" | "native";

export interface PluginConfigEntry {
  slug: string;
  meta: Record<string, unknown>;
}

export interface CreateManifest {
  runtime: Runtime;
  backendDir: string;
  frontendDir: string;
  backendPlugs: { name: string; dir: string }[];
  frontendPlugs: { name: string; dir: string; devUrl?: string; devCommand?: string }[];
}
