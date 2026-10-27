import {
  createDiaryStore,
  importBackup,
  isValidLocalDate,
  serializeBackup,
  validateEntry,
} from "./storage.js";
import {
  calculateStatistics,
  getConsecutiveSegments,
  getPeriodForPreset,
  localDateString as statisticsDateString,
  validatePeriod,
} from "./statistics.js";

const viewIds = ["today", "history", "calendar", "stats", "settings"];
const weekdayKeys = [
  "calendar.weekday.mon",
  "calendar.weekday.tue",
  "calendar.weekday.wed",
  "calendar.weekday.thu",
  "calendar.weekday.fri",
  "calendar.weekday.sat",
  "calendar.weekday.sun",
];
const optionalFields = {
  energy: "energy",
  tension: "tension",
  sleep: "sleepQuality",
};

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function entryDate(dateString, locale) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function initializeApp({ translations, localeByLanguage }) {
  const navigationButtons = document.querySelectorAll(".tab[data-view]");
  const views = document.querySelectorAll(".view");
  const languageSelect = document.querySelector("#language");
  const dateInput = document.querySelector("#entry-date");
  const moodScale = document.querySelector("#mood");
  const notesInput = document.querySelector("#notes");
  const medicationsInput = document.querySelector("#medications");
  const notesCount = document.querySelector("#notes-count");
  const medicationsCount = document.querySelector("#medications-count");
  const optionalScales = document.querySelectorAll("[data-optional-scale]");
  const saveButton = document.querySelector("#save-entry");
  const deleteButton = document.querySelector("#delete-entry");
  const saveStatus = document.querySelector("#save-status");
  const appMessage = document.querySelector("#app-message");
  const settingsMessage = document.querySelector("#settings-message");
  const historyList = document.querySelector("#history-list");
  const calendarGrid = document.querySelector("#calendar-grid");
  const calendarEmpty = document.querySelector("#calendar-empty");
  const importFile = document.querySelector("#import-file");
  const statsRange = document.querySelector("#stats-range");
  const statsCustomDates = document.querySelector("#stats-custom-dates");
  const statsStart = document.querySelector("#stats-start");
  const statsEnd = document.querySelector("#stats-end");
  let language = "de";
  let entries = [];
  let store;
  let storageReady = false;
  let currentDate = localDateString(new Date());
  let calendarDate = new Date();
  calendarDate.setDate(1);
  let baseline = "";

  const translate = (key, values = {}) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      translations[language][key] ?? key,
    );

  try {
    store = createDiaryStore(window.localStorage);
    entries = store.loadEntries();
    storageReady = true;
    language = store.loadLanguage() ?? language;
    languageSelect.value = language;
  } catch (error) {
    storageReady = false;
    showAppMessage(
      error?.code === "corrupt_storage" || error?.code === "unsupported_version"
        ? "settings.storageCorrupt"
        : "settings.storageFailed",
    );
  }

  function showAppMessage(key) {
    appMessage.dataset.messageKey = key;
    appMessage.textContent = translate(key);
    appMessage.hidden = false;
  }

  function showSettingsMessage(key) {
    settingsMessage.dataset.messageKey = key;
    settingsMessage.textContent = translate(key);
  }

  function clearSaveStatus() {
    saveStatus.textContent = "";
    delete saveStatus.dataset.messageKey;
  }

  function currentFormData() {
    const data = {
      date: dateInput.value,
      mood: Number(moodScale.value),
      notes: notesInput.value,
      medications: medicationsInput.value,
    };
    for (const [id, field] of Object.entries(optionalFields)) {
      const scale = document.querySelector(`#${id}`);
      const toggle = document.querySelector(`[data-scale-toggle="${id}"]`);
      data[field] = toggle.checked ? Number(scale.value) : null;
    }
    return data;
  }

  function updateBaseline() {
    baseline = JSON.stringify(currentFormData());
  }

  function isDirty() {
    const form = currentFormData();
    form.date = currentDate;
    return JSON.stringify(form) !== baseline;
  }

  function updateMoodOutput() {
    const output = document.querySelector("#mood-value");
    output.value = moodScale.value;
    output.textContent = moodScale.value;
    output.classList.add("selected");
    moodScale.setAttribute(
      "aria-label",
      `${translate("today.mood")}: ${moodScale.value} / 5`,
    );
  }

  function updateOptionalScale(scale) {
    const output = document.querySelector(`#${scale.id}-value`);
    const isEnabled = document.querySelector(
      `[data-scale-toggle="${scale.id}"]`,
    ).checked;
    output.value = isEnabled ? scale.value : translate("scale.notSelected");
    output.textContent = output.value;
    output.classList.toggle("selected", isEnabled);
    scale.setAttribute(
      "aria-label",
      `${scale.closest("fieldset").querySelector("legend").textContent}: ${
        isEnabled ? scale.value : translate("scale.notSelected")
      } / 5`,
    );
  }

  function setForm(entry, date) {
    currentDate = date;
    dateInput.value = date;
    moodScale.value = String(entry?.mood ?? 3);
    updateMoodOutput();

    for (const [id, field] of Object.entries(optionalFields)) {
      const scale = document.querySelector(`#${id}`);
      const toggle = document.querySelector(`[data-scale-toggle="${id}"]`);
      const value = entry?.[field] ?? null;
      toggle.checked = value !== null;
      scale.disabled = value === null;
      scale.value = String(value ?? 3);
      updateOptionalScale(scale);
    }

    notesInput.value = entry?.notes ?? "";
    medicationsInput.value = entry?.medications ?? "";
    notesCount.textContent = String(notesInput.value.length);
    medicationsCount.textContent = String(medicationsInput.value.length);
    deleteButton.hidden = !entry;
    clearSaveStatus();
    updateBaseline();
  }

  function showView(viewId) {
    if (!viewIds.includes(viewId)) return;

    views.forEach((view) => {
      const isActive = view.id === viewId;
      view.classList.toggle("active", isActive);
      view.hidden = !isActive;
    });
    navigationButtons.forEach((button) => {
      const isActive = button.dataset.view === viewId;
      button.classList.toggle("active", isActive);
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function renderHistory() {
    historyList.replaceChildren();
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    if (!sortedEntries.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = translate("empty.entries");
      historyList.append(empty);
      return;
    }

    sortedEntries.forEach((entry) => {
      const item = document.createElement("article");
      item.className = "entry";
      const details = document.createElement("div");
      details.className = "entry-head";
      const date = document.createElement("strong");
      date.textContent = entryDate(entry.date, localeByLanguage[language]);
      const mood = document.createElement("span");
      mood.className = "entry-mood";
      mood.textContent = `${translate("history.mood")}: ${entry.mood} / 5`;
      details.append(date, mood);

      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary";
      open.dataset.openDate = entry.date;
      open.textContent = translate("history.open");
      item.append(details, open);
      historyList.append(item);
    });
  }

  function renderCalendar() {
    const locale = localeByLanguage[language];
    document.querySelector("#calendar-month").textContent =
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
        new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1, 12),
      );
    calendarGrid.replaceChildren();

    weekdayKeys.forEach((key) => {
      const weekday = document.createElement("span");
      weekday.className = "calendar-weekday";
      weekday.textContent = translate(key);
      weekday.setAttribute("aria-hidden", "true");
      calendarGrid.append(weekday);
    });

    const firstOfMonth = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth(),
      1,
    );
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth() + 1,
      0,
    ).getDate();
    const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));

    for (let blank = 0; blank < offset; blank += 1) {
      const emptyCell = document.createElement("span");
      emptyCell.className = "calendar-day calendar-day-empty";
      emptyCell.setAttribute("aria-hidden", "true");
      calendarGrid.append(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
      const dateString = localDateString(date);
      const entry = entriesByDate.get(dateString);
      const dayCell = document.createElement("button");
      dayCell.type = "button";
      dayCell.className = "calendar-day";
      dayCell.textContent = String(day);
      dayCell.dataset.date = dateString;
      dayCell.setAttribute(
        "aria-label",
        `${entryDate(dateString, locale)}. ${
          entry ? `${translate("calendar.hasEntry")}, ${entry.mood} / 5` : translate("calendar.noEntry")
        }`,
      );
      if (entry) dayCell.classList.add("has-entry");
      if (dateString === localDateString(new Date())) {
        dayCell.classList.add("calendar-day-today");
        dayCell.setAttribute("aria-current", "date");
      }
      calendarGrid.append(dayCell);
    }
    calendarEmpty.hidden = entries.length > 0;
  }

  function formatStatisticsDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(localeByLanguage[language], {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12));
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function renderTrendChart(container, statistics, metric, title, compact = false) {
    container.replaceChildren();
    const width = 760;
    const height = compact ? 120 : 320;
    const left = compact ? 12 : 58;
    const right = width - (compact ? 12 : 18);
    const top = compact ? 12 : 24;
    const bottom = compact ? height - 12 : 252;
    const rangeStart = Date.UTC(
      Number(statistics.startDate.slice(0, 4)),
      Number(statistics.startDate.slice(5, 7)) - 1,
      Number(statistics.startDate.slice(8, 10)),
    );
    const rangeDays = statistics.dayCount - 1;
    const xForDate = (date) => {
      const timestamp = Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
      );
      return left + (rangeDays ? ((timestamp - rangeStart) / 86400000 / rangeDays) * (right - left) : (right - left) / 2);
    };
    const yForValue = (value) => bottom - ((value - 1) / 4) * (bottom - top);
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": compact
        ? translate("stats.optionalChartDescription", { metric: title })
        : translate("stats.chartDescription"),
      preserveAspectRatio: "xMidYMid meet",
      class: compact ? "trend-svg compact" : "trend-svg",
    });
    const svgTitle = svgElement("title", { id: `${container.id}-title` });
    svgTitle.textContent = title;
    svg.append(svgTitle);

    if (!compact) {
      for (let value = 1; value <= 5; value += 1) {
        const y = yForValue(value);
        svg.append(
          svgElement("line", {
            x1: left,
            y1: y,
            x2: right,
            y2: y,
            class: "chart-gridline",
          }),
        );
        const label = svgElement("text", {
          x: left - 12,
          y: y + 4,
          class: "chart-axis-label",
          "text-anchor": "end",
        });
        label.textContent = String(value);
        svg.append(label);
      }

      const axisTitle = svgElement("text", {
        x: 16,
        y: (top + bottom) / 2,
        class: "chart-axis-title",
        transform: `rotate(-90 16 ${(top + bottom) / 2})`,
        "text-anchor": "middle",
      });
      axisTitle.textContent = translate("stats.axisMood");
      svg.append(axisTitle);

      statistics.ticks.forEach((date) => {
        const tick = svgElement("text", {
          x: xForDate(date),
          y: bottom + 24,
          class: "chart-axis-label",
          "text-anchor": "middle",
        });
        tick.textContent = new Intl.DateTimeFormat(localeByLanguage[language], {
          month: "short",
          day: "numeric",
        }).format(
          new Date(
            Number(date.slice(0, 4)),
            Number(date.slice(5, 7)) - 1,
            Number(date.slice(8, 10)),
            12,
          ),
        );
        svg.append(tick);
      });
      const dateAxisTitle = svgElement("text", {
        x: (left + right) / 2,
        y: height - 4,
        class: "chart-axis-title",
        "text-anchor": "middle",
      });
      dateAxisTitle.textContent = translate("stats.axisDate");
      svg.append(dateAxisTitle);
    }

    getConsecutiveSegments(statistics.entries, metric).forEach((segment) => {
      if (segment.length > 1) {
        const path = svgElement("path", {
          d: segment
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"} ${xForDate(point.date).toFixed(2)} ${yForValue(point.value).toFixed(2)}`,
            )
            .join(" "),
          class: compact ? "chart-line chart-line-optional" : "chart-line",
        });
        svg.append(path);
      }
      segment.forEach((point) => {
        const circle = svgElement("circle", {
          cx: xForDate(point.date),
          cy: yForValue(point.value),
          r: compact ? 4 : 5,
          class: compact ? "chart-point chart-point-optional" : "chart-point",
        });
        const detail = svgElement("title");
        detail.textContent = `${formatStatisticsDate(point.date)}: ${point.value} / 5`;
        circle.append(detail);
        svg.append(circle);
      });
    });
    container.append(svg);
  }

  function renderStatistics() {
    const custom = statsRange.value === "custom";
    statsCustomDates.hidden = !custom;
    const error = document.querySelector("#stats-error");
    const summary = document.querySelector("#stats-period-summary");
    const empty = document.querySelector("#stats-empty");
    const results = document.querySelector("#stats-results");
    error.hidden = true;
    results.hidden = true;
    empty.hidden = true;

    let period;
    try {
      if (custom) {
        period = validatePeriod(statsStart.value, statsEnd.value);
      } else {
        period = getPeriodForPreset(statsRange.value, localDateString(new Date()));
      }
      const statistics = calculateStatistics(entries, period.startDate, period.endDate);
      summary.textContent = translate("stats.periodSummary", {
        start: formatStatisticsDate(statistics.startDate),
        end: formatStatisticsDate(statistics.endDate),
        count: statistics.dayCount,
      });

      if (!statistics.entryCount) {
        empty.hidden = false;
        return;
      }
      results.hidden = false;

      const numberFormat = new Intl.NumberFormat(localeByLanguage[language], {
        maximumFractionDigits: 2,
      });
      document.querySelector("#stat-entry-count").textContent = String(statistics.entryCount);
      document.querySelector("#stat-average").textContent = numberFormat.format(
        statistics.averageMood,
      );
      document.querySelector("#stat-highest").textContent = String(statistics.highestMood);
      document.querySelector("#stat-lowest").textContent = String(statistics.lowestMood);
      document.querySelector("#stat-day-count").textContent = String(statistics.dayCount);
      document.querySelector("#stat-days-with-entry").textContent =
        String(statistics.daysWithEntry);

      const tableBody = document.querySelector("#mood-data-table");
      tableBody.replaceChildren();
      statistics.entries.forEach((entry) => {
        const row = document.createElement("tr");
        const dateCell = document.createElement("td");
        const moodCell = document.createElement("td");
        dateCell.textContent = formatStatisticsDate(entry.date);
        moodCell.textContent = `${entry.mood} / 5`;
        row.append(dateCell, moodCell);
        tableBody.append(row);
      });
      renderTrendChart(
        document.querySelector("#mood-chart"),
        statistics,
        "mood",
        translate("stats.moodChartTitle"),
      );

      const optionalMetrics = [
        { key: "energy", label: translate("stats.energy"), emptyKey: "stats.noOptionalEnergy" },
        { key: "tension", label: translate("stats.tension"), emptyKey: "stats.noOptionalTension" },
        {
          key: "sleepQuality",
          label: translate("stats.sleepQuality"),
          emptyKey: "stats.noOptionalSleep",
        },
      ];
      optionalMetrics.forEach(({ key, label, emptyKey }) => {
        const metricStats = statistics.optional[key];
        const card = document.querySelector(`[data-optional-stat="${key}"]`);
        const average = document.querySelector(`#average-${key}`);
        const emptyMetric = card.querySelector("[data-empty-optional]");
        const chart = card.querySelector(".sparkline");
        if (!metricStats.count) {
          average.closest("p").hidden = true;
          emptyMetric.textContent = translate(emptyKey);
          chart.hidden = true;
          return;
        }
        average.closest("p").hidden = false;
        average.textContent = numberFormat.format(metricStats.average);
        emptyMetric.textContent = "";
        chart.hidden = false;
        renderTrendChart(chart, statistics, key, label, true);
        chart.querySelector("svg").setAttribute(
          "aria-label",
          translate("stats.averageValue", {
            value: numberFormat.format(metricStats.average),
            count: metricStats.count,
          }),
        );
      });
      const invalidNotice = document.querySelector("#stats-invalid-count");
      if (invalidNotice) {
        invalidNotice.hidden = statistics.invalidEntryCount === 0;
        if (!invalidNotice.hidden) {
          invalidNotice.textContent = translate("stats.invalidEntryCount", {
            count: statistics.invalidEntryCount,
          });
        }
      }
    } catch (caught) {
      summary.textContent = "";
      error.textContent = translate(
        caught?.code === "invalid_period"
          ? "stats.invalidPeriod"
          : caught?.code === "invalid_date"
            ? "stats.invalidDate"
            : "stats.invalidEntries",
      );
      error.hidden = false;
    }
  }

  function updateTranslations() {
    document.documentElement.lang = language;
    document.title = `${translate("app.title")} — ${translate("today.heading")}`;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = translate(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
    });
    updateMoodOutput();
    optionalScales.forEach(updateOptionalScale);
    renderHistory();
    renderCalendar();
    renderStatistics();
    if (!appMessage.hidden) {
      const messageKey = appMessage.dataset.messageKey;
      if (messageKey) appMessage.textContent = translate(messageKey);
    }
    if (saveStatus.dataset.messageKey) {
      saveStatus.textContent = translate(saveStatus.dataset.messageKey);
    }
    if (settingsMessage.dataset.messageKey) {
      settingsMessage.textContent = translate(settingsMessage.dataset.messageKey);
    }
  }

  function setEntryDate(date) {
    if (!isValidLocalDate(date)) {
      showSaveStatus("today.dateInvalid");
      dateInput.value = currentDate;
      return;
    }
    if (date === currentDate) return;
    if (isDirty() && !window.confirm(translate("settings.confirmDiscard"))) {
      dateInput.value = currentDate;
      return;
    }
    const entry = entries.find((item) => item.date === date);
    setForm(entry, date);
  }

  function showSaveStatus(key) {
    saveStatus.dataset.messageKey = key;
    saveStatus.textContent = translate(key);
  }

  function saveCurrentEntry() {
    if (!storageReady) {
      showAppMessage("settings.storageFailed");
      return;
    }
    const form = currentFormData();
    if (!isValidLocalDate(form.date)) {
      showSaveStatus("today.dateInvalid");
      return;
    }
    if (!Number.isInteger(form.mood) || form.mood < 1 || form.mood > 5) {
      showSaveStatus("today.moodRequired");
      return;
    }
    if (form.notes.length > 2000 || form.medications.length > 2000) {
      showSaveStatus("today.textTooLong");
      return;
    }

    const existing = entries.find((item) => item.date === form.date);
    const timestamp = new Date().toISOString();
    const entry = validateEntry({
      ...form,
      id: existing?.id ?? createId(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    const nextEntries = [...entries.filter((item) => item.date !== entry.date), entry].sort(
      (a, b) => a.date.localeCompare(b.date),
    );

    try {
      store.saveEntries(nextEntries);
    } catch {
      showSaveStatus("today.saveFailed");
      return;
    }
    entries = nextEntries;
    setForm(entry, entry.date);
    showSaveStatus(existing ? "today.savedUpdated" : "today.savedNew");
    renderHistory();
    renderCalendar();
    renderStatistics();
  }

  function deleteCurrentEntry() {
    const entry = entries.find((item) => item.date === currentDate);
    if (!entry) return;
    if (isDirty() && !window.confirm(translate("settings.confirmDiscard"))) return;
    if (!window.confirm(translate("settings.confirmDelete"))) return;
    let nextEntries;
    try {
      nextEntries = store.deleteEntry(currentDate);
    } catch {
      showSaveStatus("today.deleteFailed");
      return;
    }
    entries = nextEntries;
    setForm(null, currentDate);
    showSaveStatus("today.deleted");
    renderHistory();
    renderCalendar();
    renderStatistics();
  }

  function downloadBackup(backupEntries = entries) {
    const contents = serializeBackup(backupEntries, language);
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `stimmungstagebuch-backup-${localDateString(new Date())}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleExport() {
    if (!storageReady) {
      showAppMessage("settings.storageFailed");
      return;
    }
    try {
      downloadBackup();
      showSettingsMessage("settings.exportDone");
    } catch {
      showSettingsMessage("settings.exportFailed");
    }
  }

  function importErrorKey(error) {
    if (error?.code === "unsupported_version") return "settings.unsupportedFile";
    if (error?.code?.startsWith("invalid_") || error?.code?.startsWith("duplicate_")) {
      return "settings.invalidFile";
    }
    return "settings.importFailed";
  }

  async function handleImport() {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = importBackup({
        text,
        existingEntries: entries,
        beforeConfirm: () =>
          !isDirty() || window.confirm(translate("settings.confirmDiscard")),
        confirm: (key) => window.confirm(translate(key)),
        backupExisting: (currentEntries) => {
          downloadBackup(currentEntries);
          return true;
        },
        saveEntries: (nextEntries) => store.saveEntries(nextEntries),
      });
      if (!result.imported) {
        showSettingsMessage("settings.importCancelled");
        return;
      }
      const { backup } = result;
      entries = backup.entries;
      let languageWarning = false;
      if (backup.language) {
        language = backup.language;
        languageSelect.value = language;
        try {
          store.saveLanguage(language);
        } catch {
          languageWarning = true;
        }
      }
      setForm(
        entries.find((entry) => entry.date === currentDate) ?? null,
        currentDate,
      );
      storageReady = true;
      appMessage.hidden = true;
      delete appMessage.dataset.messageKey;
      updateTranslations();
      renderHistory();
      renderCalendar();
      renderStatistics();
      showSettingsMessage(
        languageWarning ? "settings.languageSaveFailed" : "settings.importDone",
      );
    } catch (error) {
      showSettingsMessage(importErrorKey(error));
    } finally {
      importFile.value = "";
    }
  }

  navigationButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  languageSelect.addEventListener("change", () => {
    language = languageSelect.value;
    updateTranslations();
    try {
      store.saveLanguage(language);
      settingsMessage.textContent = "";
      delete settingsMessage.dataset.messageKey;
    } catch {
      showSettingsMessage("settings.languageSaveFailed");
    }
  });

  dateInput.addEventListener("change", () => setEntryDate(dateInput.value));
  moodScale.addEventListener("input", () => {
    updateMoodOutput();
    clearSaveStatus();
  });
  optionalScales.forEach((scale) => {
    scale.addEventListener("input", () => {
      updateOptionalScale(scale);
      clearSaveStatus();
    });
    document
      .querySelector(`[data-scale-toggle="${scale.id}"]`)
      .addEventListener("change", (event) => {
        scale.disabled = !event.currentTarget.checked;
        updateOptionalScale(scale);
        clearSaveStatus();
      });
  });
  notesInput.addEventListener("input", () => {
    notesCount.textContent = String(notesInput.value.length);
    clearSaveStatus();
  });
  medicationsInput.addEventListener("input", () => {
    medicationsCount.textContent = String(medicationsInput.value.length);
    clearSaveStatus();
  });
  saveButton.addEventListener("click", saveCurrentEntry);
  deleteButton.addEventListener("click", deleteCurrentEntry);
  historyList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-open-date]");
    if (!button) return;
    const date = button.dataset.openDate;
    if (isDirty() && !window.confirm(translate("settings.confirmDiscard"))) {
      return;
    }
    setForm(entries.find((entry) => entry.date === date), date);
    showView("today");
  });
  calendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    const date = button.dataset.date;
    if (isDirty() && !window.confirm(translate("settings.confirmDiscard"))) {
      return;
    }
    setForm(entries.find((entry) => entry.date === date), date);
    showView("today");
  });
  document.querySelector("#calendar-prev").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.querySelector("#calendar-next").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });
  statsRange.addEventListener("change", () => {
    if (statsRange.value === "custom") {
      const defaultPeriod = getPeriodForPreset("14", localDateString(new Date()));
      statsStart.value = defaultPeriod.startDate;
      statsEnd.value = defaultPeriod.endDate;
    }
    renderStatistics();
  });
  statsStart.addEventListener("change", renderStatistics);
  statsEnd.addEventListener("change", renderStatistics);
  document.querySelector("#export-data").addEventListener("click", handleExport);
  importFile.addEventListener("change", handleImport);

  setForm(entries.find((entry) => entry.date === currentDate), currentDate);
  saveButton.disabled = !storageReady;
  updateTranslations();
  if (!storageReady && appMessage.hidden) showAppMessage("today.readFailed");
  renderHistory();
  renderCalendar();
  showView("today");
}
