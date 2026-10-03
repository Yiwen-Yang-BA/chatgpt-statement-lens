import {
  $,
  escape,
  toast,
  download,
  csv,
  init,
  run,
  busy,
  resultMeta,
  fileText,
} from "./ui.js";
import { num, pct, lines } from "./charts.js";
import { reportHTML } from "./reports.js";
let result = null,
  pending = false;
const unitLabel = (c) =>
  c.currency +
  " × " +
  { ones: "1", thousands: "1,000", millions: "1,000,000" }[c.unit];
const fields = [
  ["revenue", "收入"],
  ["costOfRevenue", "销货成本"],
  ["operatingIncome", "营业利润"],
  ["netIncome", "净利润"],
  ["currentAssets", "流动资产"],
  ["currentLiabilities", "流动负债"],
  ["totalLiabilities", "总负债"],
  ["interestBearingDebt", "有息债务"],
  ["assetsBegin", "期初总资产"],
  ["assetsEnd", "期末总资产"],
  ["equityBegin", "期初权益"],
  ["equityEnd", "期末权益"],
];
const ratios = [
  ["grossMargin", "毛利率", pct],
  ["operatingMargin", "营业利润率", pct],
  ["netMargin", "净利率", pct],
  ["currentRatio", "流动比率", (v) => num(v, 3)],
  ["liabilitiesToEquity", "总负债 / 权益", (v) => num(v, 3)],
  ["debtToEquity", "有息债务 / 权益", (v) => num(v, 3)],
  ["roa", "ROA · 平均资产", pct],
  ["roe", "ROE · 平均权益", pct],
];
const headers = [
  "company",
  "year",
  "currency",
  "unit",
  ...fields.map(([key]) => key),
];
function lock(on) {
  pending = on;
  document
    .querySelectorAll("#sample,#csv,#file,#analyze,#template,#mode")
    .forEach((el) => (el.disabled = on));
  $("#company").disabled = on || !result;
  $("#year").disabled = on || !result;
}
function sample() {
  const rows = [
    [
      "晨光制造",
      2023,
      "CNY",
      "millions",
      80,
      50,
      14,
      7,
      32,
      16,
      60,
      25,
      90,
      100,
      35,
      40,
    ],
    [
      "晨光制造",
      2024,
      "CNY",
      "millions",
      100,
      60,
      20,
      10,
      40,
      20,
      70,
      30,
      100,
      120,
      40,
      50,
    ],
    [
      "晨光制造",
      2025,
      "CNY",
      "millions",
      120,
      73,
      23,
      12,
      48,
      23,
      82,
      34,
      120,
      140,
      50,
      58,
    ],
    [
      "海岸服务",
      2024,
      "USD",
      "millions",
      60,
      32,
      9,
      6,
      22,
      14,
      36,
      10,
      55,
      70,
      25,
      34,
    ],
    [
      "海岸服务",
      2025,
      "USD",
      "millions",
      72,
      39,
      11,
      -2,
      24,
      0,
      38,
      8,
      70,
      75,
      "",
      37,
    ],
  ];
  $("#csv").value = [headers, ...rows].map((row) => row.join(",")).join("\n");
}
function table(headers, rows) {
  return (
    '<table class="data-table"><thead><tr>' +
    headers.map((h) => "<th>" + escape(h) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (row) =>
          "<tr>" +
          row.map((c) => "<td>" + escape(c) + "</td>").join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table>"
  );
}
function ratioRows(record) {
  return [
    ...ratios.map(([key, label, fmt]) => [
      label,
      fmt(record.ratios[key]),
      record.ratioReasons[key] || "可计算",
    ]),
    [
      "收入同比增长",
      pct(record.revenueGrowth),
      record.ratioReasons.revenueGrowth || "连续年度对比",
    ],
  ];
}
function chooseYear() {
  const c = result.companies[Number($("#company").value)],
    r = c.records[Number($("#year").value)];
  $("#metrics").innerHTML = [
    ["毛利率", pct(r.ratios.grossMargin)],
    ["净利率", pct(r.ratios.netMargin)],
    ["流动比率 · 倍", num(r.ratios.currentRatio, 3)],
    ["ROE · 平均权益", pct(r.ratios.roe)],
  ]
    .map(
      ([label, value]) =>
        `<div class="metric-card"><span>${label}</span><strong>${value}</strong><small>${r.year} · ${escape(c.name)}</small></div>`,
    )
    .join("");
  $("#ratio-table").innerHTML = table(
    ["指标", "结果", "口径 / 未定义原因"],
    ratioRows(r),
  );
  $("#issues").textContent = r.issues.join("\n");
  $("#values-table").innerHTML = table(
    ["字段", `${unitLabel(c)}`],
    fields.map(([key, label]) => [
      label,
      r.values[key] === null ? "缺失" : num(r.values[key], 4),
    ]),
  );
}
function chooseCompany() {
  const c = result.companies[Number($("#company").value)];
  $("#year").innerHTML = c.records
    .map((r, i) => `<option value="${i}">${r.year} 全年</option>`)
    .join("");
  $("#year").value = String(c.records.length - 1);
  $("#scope").textContent =
    `${c.name} · ${c.records.length} 个年度 · ${unitLabel(c)}。仅自然年完整年度，缺失年份的线条断开。`;
  $("#unit-label").textContent = unitLabel(c);
  const first = c.records[0].year,
    last = c.records.at(-1).year,
    years = Array.from({ length: last - first + 1 }, (_, i) => first + i),
    byYear = new Map(c.records.map((r) => [r.year, r]));
  $("#income-chart").innerHTML = lines(
    [
      ["revenue", "收入"],
      ["operatingIncome", "营业利润"],
      ["netIncome", "净利润"],
    ].map(([key, name]) => ({
      name,
      labels: years.map(String),
      values: years.map((y) => byYear.get(y)?.values[key] ?? null),
    })),
    { label: `${c.name} 年度收入与利润 · ${unitLabel(c)}` },
  );
  chooseYear();
}
function render(r) {
  result = { ...r.data, meta: r.meta };
  $("#company").innerHTML = result.companies
    .map((c, i) => `<option value="${i}">${escape(c.name)}</option>`)
    .join("");
  $("#company").value = "0";
  $("#warnings").textContent =
    `共 ${result.summary.companyCount} 家公司、${result.summary.periodCount} 个年度记录、${result.summary.missingCells} 个缺失金额单元格。\n` +
    result.warnings.join("\n");
  $("#meta").innerHTML = resultMeta(r.meta);
  $("#insight").textContent = result.insight;
  $("#exports").hidden = false;
  chooseCompany();
}
$("#company").onchange = () => result && chooseCompany();
$("#year").onchange = () => result && chooseYear();
$("#sample").onclick = sample;
$("#template").onclick = () =>
  download(
    "annual-statements-template.csv",
    csv([headers]),
    "text/csv;charset=utf-8",
  );
$("#file").onchange = async (e) => {
  if (pending) return;
  lock(true);
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) throw Error("请选择 CSV 文件");
    const text = await fileText(f, 750000);
    if (text.length > 250000) throw Error("最多 250,000 字符");
    $("#csv").value = text;
  } catch (err) {
    toast(err.message, true);
  } finally {
    e.target.value = "";
    lock(false);
  }
};
$("#statement-form").onsubmit = async (e) => {
  e.preventDefault();
  if (pending) return;
  lock(true);
  busy($("#analyze"), true, "核对比率与口径…");
  try {
    render(await run({ csv: $("#csv").value }));
  } catch (err) {
    toast(err.message, true);
  } finally {
    busy($("#analyze"), false);
    lock(false);
  }
};
$("#export-json").onclick = () =>
  result &&
  download(
    "statement-analysis.json",
    JSON.stringify(result, null, 2),
    "application/json",
  );
$("#export-csv").onclick = () => {
  if (!result) return;
  download(
    "statement-ratios.csv",
    csv([
      [
        "company",
        "year",
        "currency",
        "unit",
        ...ratios.map(([key]) => key),
        "revenueGrowth",
        "issues",
      ],
      ...result.companies.flatMap((c) =>
        c.records.map((r) => [
          c.name,
          r.year,
          c.currency,
          c.unit,
          ...ratios.map(([key]) => r.ratios[key]),
          r.revenueGrowth,
          [...r.issues, ...Object.values(r.ratioReasons).filter(Boolean)].join(
            "；",
          ),
        ]),
      ),
    ]),
    "text/csv;charset=utf-8",
  );
};
$("#export-html").onclick = () => {
  if (!result) return;
  download(
    "statement-report.html",
    reportHTML({
      title: "年度财报比率分析报告",
      subtitle: "Statement Lens · 仅自然年全年数据",
      metrics: [
        { label: "公司数", value: result.summary.companyCount },
        { label: "年度记录", value: result.summary.periodCount },
        { label: "缺失金额单元格", value: result.summary.missingCells },
        { label: "核对提示", value: result.summary.issueCount },
      ],
      sections: [
        ...result.companies.flatMap((c) =>
          c.records.flatMap((r) => [
            {
              title: `${c.name} · ${r.year} · 财务比率`,
              text: `金额单位 ${unitLabel(c)}。\n` + r.issues.join("\n"),
              headers: ["指标", "结果", "口径 / 未定义原因"],
              rows: ratioRows(r),
            },
            {
              title: `${c.name} · ${r.year} · 原始金额`,
              headers: ["字段", `${unitLabel(c)}`],
              rows: fields.map(([key, label]) => [
                label,
                r.values[key] === null ? "缺失" : num(r.values[key], 4),
              ]),
            },
          ]),
        ),
        { title: "数据集解读", text: result.insight },
      ],
      notes: [
        "比率的 — 表示缺失、非正分母或计算范围问题，不表示0。总负债与有息债务分开列示。",
        "ROA/ROE使用对应年度期初与期末平均余额；不替代缺失的期初数据。收入增长只比较连续年度。",
        "原始金额不跨公司加总，币种或单位不自动换算。资产恒等式检查只提示，不修补原值。",
        ...result.warnings,
      ],
    }),
    "text/html;charset=utf-8",
  );
};
await init();
