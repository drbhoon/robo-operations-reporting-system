import type { ReportSnapshot } from "./types";
import { inrNumber } from "./calculations";

export async function generateManagementCommentary(
  snapshot: Omit<ReportSnapshot, "commentary">,
) {
  const deterministicFallback = fallbackCommentary(snapshot);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return deterministicFallback;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Write concise management commentary for a stone aggregate plant. Do not calculate or invent numbers. Use only supplied metrics.",
          },
          {
            role: "user",
            content: JSON.stringify({
              plant: snapshot.plantCode,
              period: snapshot.period,
              totals: snapshot.totals,
              validationIssues: snapshot.validation.issues.slice(0, 8),
            }),
          },
        ],
      }),
    });

    if (!response.ok) return deterministicFallback;
    const data = (await response.json()) as { output_text?: string };
    const text = data.output_text?.trim();
    if (!text) return deterministicFallback;

    return {
      summary: text,
      actionPoints: text
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 5),
    };
  } catch {
    return deterministicFallback;
  }
}

function fallbackCommentary(snapshot: Omit<ReportSnapshot, "commentary">) {
  const totals = snapshot.totals;
  const actionPoints = [
    `Production closed at ${inrNumber(totals.productionMt)} MT against ${inrNumber(totals.targetMt)} MT target, with ${totals.achievementPct}% achievement.`,
    `Dispatch was ${inrNumber(totals.dispatchMt)} MT, equal to ${totals.dispatchToProductionPct}% of production for the selected period.`,
    `Average Jaw/VSI TPH was ${totals.avgJawTph}/${totals.avgVsiTph}; review days below the weekly average before locking the next plan.`,
    `Electrical consumption averaged ${totals.avgUnitsPerMt} units/MT; prioritise checks on days above this level.`,
    `Loader diesel consumption was ${inrNumber(totals.dieselLitres)} litres; monitor litres/MT alongside dispatch mix.`,
  ];

  return {
    summary: actionPoints.join(" "),
    actionPoints,
  };
}
