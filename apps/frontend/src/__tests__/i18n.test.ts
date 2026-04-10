/**
 * TDD RED: i18next scaffold tests
 * Tests that i18n module initializes correctly and translation files are complete.
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("i18n module", () => {
  beforeAll(async () => {
    // Import triggers initialization
    await import("../i18n.js");
  });

  it("initializes i18next without error", async () => {
    const i18n = (await import("../i18n.js")).default;
    expect(i18n.isInitialized).toBe(true);
  });

  it("has 'de' and 'en' languages loaded", async () => {
    const i18n = (await import("../i18n.js")).default;
    expect(i18n.hasResourceBundle("de", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
  });

  it("t('common.appName') returns 'ACM KPI Pro' in German", async () => {
    const i18n = (await import("../i18n.js")).default;
    expect(i18n.getFixedT("de")("common.appName")).toBe("ACM KPI Pro");
  });

  it("t('common.appName') returns 'ACM KPI Pro' in English", async () => {
    const i18n = (await import("../i18n.js")).default;
    expect(i18n.getFixedT("en")("common.appName")).toBe("ACM KPI Pro");
  });

  it("de.json has all required namespaces", async () => {
    const de = (await import("../locales/de.json")).default;
    expect(de).toHaveProperty("common");
    expect(de).toHaveProperty("auth");
    expect(de).toHaveProperty("dashboard");
    expect(de).toHaveProperty("upload");
    expect(de).toHaveProperty("theme");
  });

  it("en.json has all required namespaces", async () => {
    const en = (await import("../locales/en.json")).default;
    expect(en).toHaveProperty("common");
    expect(en).toHaveProperty("auth");
    expect(en).toHaveProperty("dashboard");
    expect(en).toHaveProperty("upload");
    expect(en).toHaveProperty("theme");
  });

  it("de.json and en.json have the same top-level keys", async () => {
    const de = (await import("../locales/de.json")).default;
    const en = (await import("../locales/en.json")).default;
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it("fallback language is 'de'", async () => {
    const i18n = (await import("../i18n.js")).default;
    expect(i18n.options.fallbackLng).toBe("de");
  });
});
