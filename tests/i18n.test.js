import test from "node:test";
import assert from "node:assert/strict";
import { translations } from "../src/i18n.js";

test("German, French, and English contain the same non-empty UI messages", () => {
  const languages = Object.keys(translations);
  assert.deepEqual(languages.sort(), ["de", "en", "fr"]);

  const referenceKeys = Object.keys(translations.de).sort();
  for (const language of languages) {
    assert.deepEqual(Object.keys(translations[language]).sort(), referenceKeys);
    for (const [key, value] of Object.entries(translations[language])) {
      assert.equal(typeof value, "string", `${language}.${key} must be a string`);
      assert.notEqual(value.trim(), "", `${language}.${key} must not be empty`);
    }
  }
});

test("mood scale and medication field are translated in all supported languages", () => {
  const expectedMoodLabels = {
    de: [
      "1 · Sehr schlecht",
      "2 · Eher schlecht",
      "3 · Mittel",
      "4 · Gut",
      "5 · Sehr gut",
    ],
    fr: ["1 · Très mal", "2 · Plutôt mal", "3 · Moyen", "4 · Bien", "5 · Très bien"],
    en: ["1 · Very bad", "2 · Rather bad", "3 · Medium", "4 · Good", "5 · Very good"],
  };

  for (const [language, labels] of Object.entries(expectedMoodLabels)) {
    labels.forEach((label, index) => {
      assert.equal(translations[language][`scale.mood${index + 1}`], label);
    });
    assert.match(translations[language]["today.medications"], /\S/);
    assert.match(translations[language]["today.medicationsHelp"], /\S/);
    assert.match(translations[language]["today.medicationsPlaceholder"], /\S/);
  }
});

test("scale guidance, first-run introduction, and PDF messages exist in all languages", () => {
  for (const language of ["de", "fr", "en"]) {
    for (const key of [
      "scale.ratherLow",
      "scale.ratherHigh",
      "intro.title",
      "intro.today",
      "intro.history",
      "intro.calendar",
      "intro.stats",
      "intro.settings",
      "intro.dismiss",
      "intro.close",
      "stats.exportPdf",
      "pdf.emptyPeriod",
      "pdf.opened",
      "pdf.downloaded",
      "pdf.createFailed",
    ]) {
      assert.match(translations[language][key], /\S/, `${language}.${key} must be translated`);
    }
  }
});
