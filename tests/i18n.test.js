import test from "node:test";
import assert from "node:assert/strict";
import { getPreferredLanguage, translations } from "../src/i18n.js";

test("all supported languages contain the same non-empty UI messages", () => {
  const languages = Object.keys(translations);
  assert.deepEqual(languages.sort(), ["de", "en", "fr", "it"]);

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
    it: ["1 · Molto male", "2 · Abbastanza male", "3 · Così così", "4 · Bene", "5 · Molto bene"],
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
  for (const language of Object.keys(translations)) {
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

test("browser language preferences select the first supported language", () => {
  assert.equal(getPreferredLanguage(["es-ES", "it-IT", "fr"]), "it");
  assert.equal(getPreferredLanguage(["es-ES", "fr-FR", "en"]), "fr");
  assert.equal(getPreferredLanguage(["en-US", "de-DE"]), "en");
  assert.equal(getPreferredLanguage(["es-ES"]), "de");
  assert.equal(getPreferredLanguage([]), "de");
});
