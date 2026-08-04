import { PLANT_CONFIGS } from "./types";
import { getPrisma } from "../reporting/prisma";

export type PlantOperationalConfig = {
  code: string;
  electricLoaderEnabled: boolean;
  name: string;
};

export async function listPlantOperationalConfigs(): Promise<PlantOperationalConfig[]> {
  const prisma = getPrisma();
  if (!prisma) return defaultPlantOperationalConfigs();

  try {
    const rows = await prisma.plant.findMany();
    const byCode = new Map(rows.map((row) => [row.code, row]));
    return PLANT_CONFIGS.map((plant) => {
      const row = byCode.get(plant.code);
      return {
        code: plant.code,
        electricLoaderEnabled: row?.electricLoaderEnabled ?? false,
        name: row?.name ?? plant.name,
      };
    });
  } catch (error) {
    console.error("Plant operational configuration could not be loaded.", error);
    return defaultPlantOperationalConfigs();
  }
}

export async function updatePlantOperationalConfig(input: {
  electricLoaderEnabled: boolean;
  plantCode: string;
}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is required for plant configuration.");
  const plant = PLANT_CONFIGS.find((config) => config.code === input.plantCode);
  if (!plant) throw new Error(`Invalid plant ${input.plantCode}.`);

  await prisma.plant.upsert({
    where: { code: plant.code },
    update: {
      electricLoaderEnabled: input.electricLoaderEnabled,
      name: plant.name,
    },
    create: {
      code: plant.code,
      electricLoaderEnabled: input.electricLoaderEnabled,
      name: plant.name,
    },
  });
  return listPlantOperationalConfigs();
}

export function electricLoaderEnabledFor(configs: PlantOperationalConfig[], plantCode: string) {
  return configs.find((config) => config.code === plantCode)?.electricLoaderEnabled ?? false;
}

function defaultPlantOperationalConfigs(): PlantOperationalConfig[] {
  return PLANT_CONFIGS.map((plant) => ({
    code: plant.code,
    electricLoaderEnabled: false,
    name: plant.name,
  }));
}
