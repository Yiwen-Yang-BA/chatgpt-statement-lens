import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../project.mjs";
import { ValidationError } from "../lib/validate.mjs";

const fields = [
  "company",
  "year",
  "currency",
  "unit",
  "revenue",
  "costOfRevenue",
  "operatingIncome",
  "netIncome",
  "currentAssets",
  "currentLiabilities",
  "totalLiabilities",
  "interestBearingDebt",
  "assetsBegin",
  "assetsEnd",
  "equityBegin",
  "equityEnd",
];
const base = {
  company: "示例公司",
  year: 2024,
  currency: "CNY",
  unit: "millions",
  revenue: 100,
  costOfRevenue: 60,
  operatingIncome: 20,
  netIncome: 10,
  currentAssets: 40,
  currentLiabilities: 20,
  totalLiabilities: 70,
  interestBearingDebt: 30,
  assetsBegin: 100,
  assetsEnd: 120,
  equityBegin: 40,
  equityEnd: 50,
};
const csv = (records = [base], order = fields) =>
  order.join(",") +
  "\n" +
  records
    .map((record) => order.map((field) => record[field] ?? "").join(","))
    .join("\n");
const demo = { generate: async (spec) => spec.demo() };
const near = (actual, expected, tolerance = 1e-12) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≈ ${expected}`,
  );

test("METHODS annual statement example produces all eight ratios with the proper denominators", async () => {
  const result = await run({ csv: csv() }, demo),
    record = result.companies[0].records[0];
  for (const [key, expected] of Object.entries({
    grossMargin: 0.4,
    operatingMargin: 0.2,
    netMargin: 0.1,
    currentRatio: 2,
    liabilitiesToEquity: 1.4,
    debtToEquity: 0.6,
    roa: 10 / 110,
    roe: 10 / 45,
  })) {
    near(record.ratios[key], expected);
    assert.equal(record.ratioReasons[key], null);
  }
  assert.equal(record.revenueGrowth, null);
  assert.equal(result.summary.missingCells, 0);
  assert.equal(result.summary.issueCount, 0);
});

test("missing beginning balances stay null and are not replaced by current or prior ending balances", async () => {
  const result = await run(
    {
      csv: csv([
        { ...base, year: 2023 },
        { ...base, assetsBegin: null, equityBegin: null },
      ]),
    },
    demo,
  );
  const record = result.companies[0].records[1];
  assert.equal(record.values.assetsBegin, null);
  assert.equal(record.ratios.roa, null);
  assert.equal(record.ratios.roe, null);
  assert.match(record.ratioReasons.roa, /assetsBegin/);
  assert.match(record.ratioReasons.roe, /equityBegin/);
  assert.equal(record.ratios.currentRatio, 2);
  assert.equal(result.summary.missingCells, 2);
});

test("loss ratios remain negative and ROE checks average equity separately from leverage", async () => {
  const result = await run(
    {
      csv: csv([
        {
          ...base,
          netIncome: -10,
          operatingIncome: -20,
          equityBegin: -10,
          equityEnd: 30,
        },
        {
          ...base,
          year: 2025,
          netIncome: -10,
          equityBegin: 40,
          equityEnd: 0,
          currentLiabilities: 0,
        },
      ]),
    },
    demo,
  );
  const [first, second] = result.companies[0].records;
  near(first.ratios.netMargin, -0.1);
  near(first.ratios.operatingMargin, -0.2);
  near(first.ratios.roe, -1);
  assert.ok(first.issues.some((issue) => issue.includes("权益为负")));
  assert.equal(second.ratios.liabilitiesToEquity, null);
  assert.equal(second.ratios.debtToEquity, null);
  assert.equal(second.ratios.currentRatio, null);
  near(second.ratios.roe, -0.5);
  assert.match(second.ratioReasons.currentRatio, /正数/);
  const endingNegative = await run(
    { csv: csv([{ ...base, equityBegin: 40, equityEnd: -20, netIncome: 5 }]) },
    demo,
  );
  near(endingNegative.companies[0].records[0].ratios.roe, 0.5);
  assert.equal(
    endingNegative.companies[0].records[0].ratios.liabilitiesToEquity,
    null,
  );
});

test("revenue growth requires consecutive years and a positive previous revenue", async () => {
  const records = [
    { ...base, year: 2023, revenue: 100 },
    { ...base, year: 2024, revenue: 120 },
    { ...base, year: 2026, revenue: 140 },
    { ...base, year: 2027, revenue: 0 },
    { ...base, year: 2028, revenue: 100 },
  ];
  const result = await run({ csv: csv(records) }, demo),
    rows = result.companies[0].records;
  near(rows[1].revenueGrowth, 0.2);
  assert.equal(rows[2].revenueGrowth, null);
  assert.match(rows[2].ratioReasons.revenueGrowth, /不连续/);
  assert.equal(rows[3].revenueGrowth, -1);
  assert.equal(rows[3].ratios.grossMargin, null);
  assert.equal(rows[4].revenueGrowth, null);
  assert.match(rows[4].ratioReasons.revenueGrowth, /大于零/);
});

test("currency and unit must agree within a company, while separate companies preserve their own metadata", async () => {
  for (const changed of [{ currency: "USD" }, { unit: "ones" }])
    await assert.rejects(
      run({ csv: csv([base, { ...base, year: 2025, ...changed }]) }, demo),
      /相同币种和金额单位/,
    );
  const result = await run(
    {
      csv: csv([
        base,
        { ...base, company: "Other", currency: "USD", unit: "ones" },
      ]),
    },
    demo,
  );
  assert.equal(result.companies.length, 2);
  assert.equal(
    result.companies.find((company) => company.name === "Other").currency,
    "USD",
  );
});

test("duplicate years, unsupported periods, invalid signs and nonexact schemas are rejected", async () => {
  await assert.rejects(run({ csv: csv([base, base]) }, demo), /重复/);
  for (const change of [
    { year: "2024Q1" },
    { year: 1899 },
    { year: 2101 },
    { company: " " },
    { currency: "JPY" },
    { unit: "billions" },
    { costOfRevenue: -1 },
  ])
    await assert.rejects(
      run({ csv: csv([{ ...base, ...change }]) }, demo),
      ValidationError,
    );
  await assert.rejects(
    run(
      { csv: csv().replace("company,year", "company,fiscalStart,year") },
      demo,
    ),
    ValidationError,
  );
  const reordered = await run(
    { csv: csv([base], [...fields].reverse()) },
    demo,
  );
  assert.equal(reordered.companies[0].records[0].ratios.netMargin, 0.1);
});

test("balance-sheet and year-link inconsistencies warn without altering supplied amounts", async () => {
  const changed = {
    ...base,
    year: 2025,
    assetsBegin: 110,
    assetsEnd: 130,
    currentAssets: 140,
    currentLiabilities: 80,
    interestBearingDebt: 80,
    equityBegin: 45,
  };
  const result = await run({ csv: csv([base, changed]) }, demo),
    record = result.companies[0].records[1];
  assert.equal(record.values.assetsEnd, 130);
  assert.equal(record.values.currentAssets, 140);
  for (const phrase of [
    "期末资产不等于",
    "流动资产高于",
    "流动负债高于",
    "有息债务高于",
    "本年期初资产",
    "本年期初权益",
  ])
    assert.ok(
      record.issues.some((issue) => issue.includes(phrase)),
      phrase,
    );
  assert.equal(record.ratios.currentRatio, 1.75);
  assert.ok(result.summary.issueCount >= 6);
});

test("invalid numeric text is rejected while an overflowing ratio becomes null with a local reason", async () => {
  for (const value of ["NaN", "Infinity", "1e309", "1e16", "1e-400", '"1,000"'])
    await assert.rejects(
      run({ csv: csv([{ ...base, revenue: value }]) }, demo),
      ValidationError,
    );
  const result = await run(
      { csv: csv([{ ...base, revenue: "5e-324" }]) },
      demo,
    ),
    record = result.companies[0].records[0];
  assert.equal(record.ratios.grossMargin, null);
  assert.match(record.ratioReasons.grossMargin, /数值溢出/);
  assert.equal(record.ratios.currentRatio, 2);
  assert.ok(Number.isFinite(record.ratios.roa));
  const local = await run(
    {
      csv: csv([
        {
          ...base,
          revenue: 1e-310,
          costOfRevenue: 0,
          operatingIncome: 1e15,
          netIncome: 0,
        },
      ]),
    },
    demo,
  );
  assert.equal(local.companies[0].records[0].ratios.grossMargin, 1);
  assert.equal(local.companies[0].records[0].ratios.netMargin, 0);
  assert.equal(local.companies[0].records[0].ratios.operatingMargin, null);
  const tiny = await run(
    {
      csv: csv([
        {
          ...base,
          netIncome: Number.MIN_VALUE,
          equityBegin: Number.MIN_VALUE,
          equityEnd: Number.MIN_VALUE,
          assetsBegin: 1e15,
          assetsEnd: 1e15,
        },
      ]),
    },
    demo,
  );
  assert.equal(tiny.companies[0].records[0].ratios.roe, 1);
  assert.equal(tiny.companies[0].records[0].ratios.roa, null);
  assert.match(tiny.companies[0].records[0].ratioReasons.roa, /下溢/);
});

test("unordered records are sorted by company and year before growth calculations", async () => {
  const result = await run(
    {
      csv: csv([
        { ...base, company: "B", year: 2025, revenue: 120 },
        { ...base, company: "A", year: 2024 },
        { ...base, company: "B", year: 2024 },
      ]),
    },
    demo,
  );
  assert.deepEqual(
    result.companies.map((company) => company.name),
    ["A", "B"],
  );
  assert.deepEqual(
    result.companies[1].records.map((record) => record.year),
    [2024, 2025],
  );
  near(result.companies[1].records[1].revenueGrowth, 0.2);
  assert.equal(result.summary.companyCount, 2);
  assert.equal(result.summary.periodCount, 3);
});

test("model sees ratio summaries and reasons without raw financial statement amounts", async () => {
  let observed;
  const result = await run(
    { csv: csv() },
    {
      generate: async (spec) => {
        observed = spec;
        return { text: "仅解读比率。" };
      },
    },
  );
  const input = JSON.parse(observed.input),
    record = input.companies[0].records[0];
  assert.deepEqual(Object.keys(input), ["companies", "summary"]);
  assert.deepEqual(Object.keys(record), [
    "year",
    "ratios",
    "revenueGrowth",
    "ratioReasons",
  ]);
  assert.equal(record.values, undefined);
  assert.equal(record.revenue, undefined);
  assert.equal(record.assetsEnd, undefined);
  assert.match(
    observed.instructions,
    /Raw financial statement amounts are not provided/,
  );
  assert.equal(result.insight, "仅解读比率。");
});
