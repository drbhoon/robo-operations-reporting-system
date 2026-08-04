export type PlantOperationalConfig = {
  code: string;
  electricLoaderEnabled: boolean;
  name: string;
};

export function electricLoaderEnabledFor(configs: PlantOperationalConfig[], plantCode: string) {
  return configs.find((config) => config.code === plantCode)?.electricLoaderEnabled ?? false;
}
