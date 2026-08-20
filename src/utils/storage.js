import { INITIAL_FLAVORS } from '../constants/flavors';

const STORAGE_KEYS = {
  ACTIVE_SHIFT: 'maicitos_active_shift_v1',
  HISTORY: 'maicitos_history_v1',
  CUSTOM_FLAVORS: 'maicitos_flavors_v1',
  SETTINGS: 'maicitos_settings_v1'
};

export const getStoredFlavors = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_FLAVORS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading flavors', e);
  }
  return INITIAL_FLAVORS;
};

export const saveStoredFlavors = (flavors) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FLAVORS, JSON.stringify(flavors));
  } catch (e) {
    console.error('Error saving flavors', e);
  }
};

export const getActiveShift = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading active shift', e);
  }
  return null;
};

export const saveActiveShift = (shift) => {
  try {
    if (shift) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT, JSON.stringify(shift));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
    }
  } catch (e) {
    console.error('Error saving active shift', e);
  }
};

export const getHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading history', e);
  }
  return [];
};

export const saveHistory = (history) => {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving history', e);
  }
};

export const addShiftToHistory = (completedShift) => {
  const history = getHistory();
  const updated = [completedShift, ...history];
  saveHistory(updated);
  return updated;
};
