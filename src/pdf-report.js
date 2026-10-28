import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getConsecutiveSegments } from "./statistics.js";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const INK = [41, 37, 36];
const MUTED = [100, 91, 85];
const GRID = [231, 221, 212];
const ACCENT = [194, 65, 12];
const AMBER = [180, 83, 9];

function formatDate(dateString, locale) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function dayNumber(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function createTranslator(translations, language) {
  return (key, values = {}) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      translations[language][key] ?? key,
    );
}

function drawTrendChart(doc, statistics, metric, title, locale, x, y, width, height, color) {
  const left = x + 12;
  const right = x + width - 3;
  const top = y + 11;
  const bottom = y + height - 12;
  const periodStart = dayNumber(statistics.startDate);
  const daySpan = statistics.dayCount - 1;
  const xForDate = (date) =>
    left + (daySpan ? ((dayNumber(date) - periodStart) / daySpan) * (right - left) : (right - left) / 2);
  const yForValue = (value) => bottom - ((value - 1) / 4) * (bottom - top);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(title, x, y + 5);
  doc.setLineWidth(0.25);
  doc.setDrawColor(...GRID);
  for (let value = 1; value <= 5; value += 1) {
    const position = yForValue(value);
    doc.line(left, position, right, position);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(String(value), left - 3, position + 1.5, { align: "right" });
  }

  statistics.ticks.forEach((date) => {
    const label = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
      new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 12),
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(label, xForDate(date), bottom + 5, { align: "center" });
  });

  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.8);
  getConsecutiveSegments(statistics.entries, metric).forEach((segment) => {
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const current = segment[index];
      doc.line(
        xForDate(previous.date),
        yForValue(previous.value),
        xForDate(current.date),
        yForValue(current.value),
      );
    }
    segment.forEach((point) => {
      doc.circle(xForDate(point.date), yForValue(point.value), 1.15, "F");
    });
  });
}

function drawSummary(doc, statistics, translate, locale) {
  const cards = [
    [translate("stats.entries"), statistics.entryCount],
    [translate("stats.average"), new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(statistics.averageMood)],
    [translate("stats.highest"), `${statistics.highestMood} / 5`],
    [translate("stats.lowest"), `${statistics.lowestMood} / 5`],
  ];
  const gap = 3;
  const cardWidth = (PAGE_WIDTH - 2 * MARGIN - gap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + gap);
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(...GRID);
    doc.roundedRect(x, 32, cardWidth, 24, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(String(label), x + 2.5, 38, { maxWidth: cardWidth - 5 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ACCENT);
    doc.text(String(value), x + 2.5, 50);
  });
}

function setFooter(doc, translate) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      translate("pdf.page", { page, total: totalPages }),
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 6,
      { align: "right" },
    );
  }
}

export function createMoodReport(statistics, language, translations, localeByLanguage, createdAt = new Date()) {
  if (!statistics?.entryCount) {
    const error = new Error("empty_period");
    error.code = "empty_period";
    throw error;
  }
  const translate = createTranslator(translations, language);
  const locale = localeByLanguage[language];
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  const periodLabel = `${formatDate(statistics.startDate, locale)} – ${formatDate(statistics.endDate, locale)}`;

  doc.setProperties({
    title: translate("pdf.title"),
    subject: translate("pdf.subject"),
    creator: "Stimmungstagebuch.ch",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ACCENT);
  doc.text(translate("pdf.title"), MARGIN, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(translate("pdf.period", { period: periodLabel }), MARGIN, 24);
  doc.text(
    translate("pdf.created", {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(createdAt),
    }),
    PAGE_WIDTH - MARGIN,
    17,
    { align: "right" },
  );
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, 27, PAGE_WIDTH - MARGIN, 27);

  drawSummary(doc, statistics, translate, locale);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    translate("pdf.daysSummary", {
      days: statistics.dayCount,
      entries: statistics.daysWithEntry,
    }),
    MARGIN,
    61,
  );

  drawTrendChart(
    doc,
    statistics,
    "mood",
    translate("stats.moodChartTitle"),
    locale,
    MARGIN,
    65,
    PAGE_WIDTH - 2 * MARGIN,
    78,
    ACCENT,
  );

  const optionalCharts = [
    ["energy", "stats.energy"],
    ["tension", "stats.tension"],
    ["sleepQuality", "stats.sleepQuality"],
  ].filter(([metric]) => statistics.optional[metric].count > 0);
  optionalCharts.forEach(([metric, label], index) => {
    drawTrendChart(
      doc,
      statistics,
      metric,
      translate("pdf.optionalChartTitle", { metric: translate(label) }),
      locale,
      MARGIN,
      147 + index * 42,
      PAGE_WIDTH - 2 * MARGIN,
      39,
      AMBER,
    );
  });

  doc.addPage();
  const formatScore = (value) => (value === null ? translate("pdf.missing") : `${value} / 5`);
  const rows = statistics.entries.map((entry) => [
    formatDate(entry.date, locale),
    formatScore(entry.mood),
    formatScore(entry.energy),
    formatScore(entry.tension),
    formatScore(entry.sleepQuality),
  ]);
  autoTable(doc, {
    startY: 24,
    margin: { top: 24, right: MARGIN, bottom: 14, left: MARGIN },
    head: [[
      translate("stats.date"),
      translate("stats.mood"),
      translate("stats.energy"),
      translate("stats.tension"),
      translate("stats.sleepQuality"),
    ]],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.2,
      overflow: "linebreak",
      valign: "middle",
      lineColor: GRID,
      lineWidth: 0.15,
      textColor: INK,
    },
    headStyles: {
      fillColor: [255, 237, 213],
      textColor: INK,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [255, 250, 245] },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 29 },
      2: { cellWidth: 29 },
      3: { cellWidth: 29 },
      4: { cellWidth: 39 },
    },
    showHead: "everyPage",
    rowPageBreak: "auto",
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(translate("pdf.tableTitle"), MARGIN, 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(periodLabel, PAGE_WIDTH - MARGIN, 15, { align: "right" });
      doc.setDrawColor(...GRID);
      doc.line(MARGIN, 18, PAGE_WIDTH - MARGIN, 18);
    },
  });

  setFooter(doc, translate);
  return doc;
}

export function presentPdfReport(doc, browser = window) {
  const blob = doc.output("blob");
  const url = browser.URL.createObjectURL(blob);
  const download = () => {
    const link = browser.document.createElement("a");
    link.href = url;
    link.download = "stimmungstagebuch-statistik.pdf";
    browser.document.body.append(link);
    link.click();
    link.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 60_000);
    return "downloaded";
  };
  let reportWindow;
  try {
    reportWindow = browser.open("", "_blank");
    if (!reportWindow) return download();
    reportWindow.opener = null;
    reportWindow.location.href = url;
  } catch {
    return download();
  }
  browser.setTimeout(() => browser.URL.revokeObjectURL(url), 60_000);
  return "opened";
}
