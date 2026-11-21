export default function () {
  const teamMonthly = 20;
  const teamYearly = 180;
  return {
    currency: { en: "$", es: "US$", pt: "US$" },
    currencyCode: "USD",
    teamMonthly,
    teamYearly,
    teamYearlyPerMonth: teamYearly / 12,
    teamYearlySavePercent: Math.floor(
      (1 - teamYearly / 12 / teamMonthly) * 100,
    ),
  };
}
