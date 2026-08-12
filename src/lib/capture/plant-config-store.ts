import { PLANT_CONFIGS } from "./types";
import { mergeCostRates, type PlantCostRates, type PlantOperationalConfig } from "./plant-config-client";
import type { AppSession } from "../auth/admin";
import { getPrisma } from "../reporting/prisma";

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
        costRates: mergeCostRates(plant.code, row?.costRates as Partial<PlantCostRates> | null | undefined),
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
  actor?: AppSession;
  costRates?: Partial<PlantCostRates>;
  electricLoaderEnabled?: boolean;
  plantCode: string;
}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is required for plant configuration.");
  const plant = PLANT_CONFIGS.find((config) => config.code === input.plantCode);
  if (!plant) throw new Error(`Invalid plant ${input.plantCode}.`);

  const current = await prisma.plant.findUnique({ where: { code: plant.code } });
  const currentRates = mergeCostRates(plant.code, current?.costRates as Partial<PlantCostRates> | null | undefined);
  const nextRates = input.costRates ? mergeCostRates(plant.code, { ...currentRates, ...input.costRates }) : currentRates;
  const nextElectricLoaderEnabled = typeof input.electricLoaderEnabled === "boolean"
    ? input.electricLoaderEnabled
    : current?.electricLoaderEnabled ?? false;

  await prisma.plant.upsert({
    where: { code: plant.code },
    update: {
      costRates: nextRates,
      electricLoaderEnabled: nextElectricLoaderEnabled,
      name: plant.name,
    },
    create: {
      code: plant.code,
      costRates: nextRates,
      electricLoaderEnabled: nextElectricLoaderEnabled,
      name: plant.name,
    },
  });

  await prisma.accessAuditLog.create({
    data: {
      action: "PLANT_CONFIG_UPDATED",
      actorUserId: input.actor?.userId,
      plantCode: plant.code,
      summary: `${input.actor?.username ?? "system"} updated configuration for ${plant.code}.`,
    },
  });
  return listPlantOperationalConfigs();
}

function defaultPlantOperationalConfigs(): PlantOperationalConfig[] {
  return PLANT_CONFIGS.map((plant) => ({
    code: plant.code,
    costRates: mergeCostRates(plant.code, undefined),
    electricLoaderEnabled: false,
    name: plant.name,
  }));
}
