export const INTRO_DISMISSED_STORAGE_KEY = "stimmungstagebuch.intro.dismissed.v1";

export function hasDismissedIntro(storage) {
  return storage.getItem(INTRO_DISMISSED_STORAGE_KEY) === "true";
}

export function saveIntroDismissal(storage, dismissed) {
  if (dismissed) storage.setItem(INTRO_DISMISSED_STORAGE_KEY, "true");
}
