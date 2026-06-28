const DATA_URL = "ios_ipados_screen_dimensions.json";

const translations = {
  "zh-Hant": {
    pageTitle: "Apple 裝置尺寸圖鑑",
    pageDescription: "依 point 尺寸分組的 iPhone 與 iPad 螢幕尺寸一覽。",
    topbarLabel: "頁首導覽",
    homeLabel: "回到頁首",
    heroTitle: "裝置尺寸",
    heroAccent: "一目瞭然。",
    heroIntro: "將歷代 iPhone 與 iPad 依照直向螢幕尺寸分組，快速找出共用相同版面空間的裝置。",
    statsLabel: "資料摘要",
    devicesLabel: "款裝置",
    sizesLabel: "種尺寸",
    sectionLabel: "01 / Dimensions",
    catalogTitle: "依尺寸分組",
    searchLabel: "搜尋裝置名稱或尺寸",
    searchPlaceholder: "搜尋名稱或尺寸",
    clearSearchLabel: "清除搜尋",
    filterLabel: "依平台篩選",
    filterAll: "全部",
    sizeColumn: "尺寸",
    devicesColumn: "對應裝置",
    loading: "正在載入裝置資料…",
    loadingShort: "資料載入中",
    loadErrorTitle: "無法讀取裝置資料",
    dimensionUnit: "points · 直向",
    emptyTitle: "找不到符合的裝置",
    emptyHint: "請嘗試其他名稱、point 尺寸，或切換平台篩選。",
    dateUnavailable: "更新日期未提供",
    generatedAt: "資料產生於 {date}",
    fileError: "請透過本機 HTTP 伺服器開啟網頁，例如執行 python3 -m http.server 8000。",
    loadFailed: "資料載入失敗",
    httpError: "HTTP {status}：找不到 {file}",
    jsonError: "JSON 格式錯誤：缺少 devices 陣列。",
    unknownError: "發生未知錯誤。",
  },
  en: {
    pageTitle: "Apple Device Screen Atlas",
    pageDescription: "iPhone and iPad screen dimensions grouped by point size.",
    topbarLabel: "Header navigation",
    homeLabel: "Back to top",
    heroTitle: "Device sizes",
    heroAccent: "at a glance.",
    heroIntro: "Explore iPhone and iPad models grouped by portrait screen size, and quickly identify devices that share the same layout space.",
    statsLabel: "Data summary",
    devicesLabel: "devices",
    sizesLabel: "screen sizes",
    sectionLabel: "01 / Dimensions",
    catalogTitle: "Grouped by size",
    searchLabel: "Search device names or sizes",
    searchPlaceholder: "Search by name or size",
    clearSearchLabel: "Clear search",
    filterLabel: "Filter by platform",
    filterAll: "All",
    sizeColumn: "Size",
    devicesColumn: "Matching devices",
    loading: "Loading device data…",
    loadingShort: "Loading data",
    loadErrorTitle: "Unable to load device data",
    dimensionUnit: "points · portrait",
    emptyTitle: "No matching devices",
    emptyHint: "Try another name, point size, or platform filter.",
    dateUnavailable: "Update date unavailable",
    generatedAt: "Data generated on {date}",
    fileError: "Open this page through a local HTTP server, such as python3 -m http.server 8000.",
    loadFailed: "Data failed to load",
    httpError: "HTTP {status}: {file} was not found",
    jsonError: "Invalid JSON: the devices array is missing.",
    unknownError: "An unknown error occurred.",
  },
};

function getInitialLocale() {
  const savedLocale = localStorage.getItem("screen-atlas-locale");
  if (savedLocale === "en" || savedLocale === "zh-Hant") {
    return savedLocale;
  }

  const systemLanguage = navigator.language || navigator.languages?.[0] || "en";
  return systemLanguage.toLowerCase().startsWith("zh") ? "zh-Hant" : "en";
}

const state = {
  data: null,
  platform: "all",
  query: "",
  locale: getInitialLocale(),
};

const elements = {
  rows: document.querySelector("#device-rows"),
  tableShell: document.querySelector("#table-shell"),
  errorCard: document.querySelector("#error-card"),
  errorMessage: document.querySelector("#error-message"),
  deviceCount: document.querySelector("#device-count"),
  sizeCount: document.querySelector("#size-count"),
  updatedAt: document.querySelector("#updated-at"),
  pageDescription: document.querySelector("#page-description"),
  sourceLink: document.querySelector("#source-link"),
  searchInput: document.querySelector("#device-search"),
  clearSearch: document.querySelector("#clear-search"),
  filters: [...document.querySelectorAll(".filter")],
  languageOptions: [...document.querySelectorAll(".language-option")],
};

function t(key, replacements = {}) {
  let value = translations[state.locale][key] ?? key;
  for (const [name, replacement] of Object.entries(replacements)) {
    value = value.replace(`{${name}}`, replacement);
  }
  return value;
}

function setLocale(locale) {
  state.locale = locale === "en" ? "en" : "zh-Hant";
  localStorage.setItem("screen-atlas-locale", state.locale);
  document.documentElement.lang = state.locale;
  document.title = t("pageTitle");
  elements.pageDescription.content = t("pageDescription");

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
  for (const button of elements.languageOptions) {
    const selected = button.dataset.locale === state.locale;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  if (state.data) {
    elements.updatedAt.textContent = formatUpdatedAt(state.data.generated_at);
    render();
  }
}

function groupByPointSize(devices) {
  const groups = new Map();

  for (const device of devices) {
    const points = device?.portrait?.points;
    if (
      !device?.model ||
      !["iOS", "iPadOS"].includes(device.platform) ||
      !Number.isFinite(points?.width) ||
      !Number.isFinite(points?.height)
    ) {
      continue;
    }

    const key = `${points.width}x${points.height}`;
    if (!groups.has(key)) {
      groups.set(key, {
        width: points.width,
        height: points.height,
        devices: [],
      });
    }
    groups.get(key).devices.push(device);
  }

  return [...groups.values()];
}

function createDeviceItem(device) {
  const item = document.createElement("li");
  item.className = "device";
  item.dataset.platform = device.platform;
  item.textContent = device.model;
  return item;
}

function createRow(group) {
  const row = document.createElement("tr");

  const dimensionCell = document.createElement("td");
  const dimension = document.createElement("div");
  dimension.className = "dimension";

  const glyph = document.createElement("span");
  glyph.className = "dimension__glyph";
  const relativeHeight = Math.round(31 * (group.height / group.width));
  glyph.style.setProperty("--glyph-height", `${Math.min(50, relativeHeight)}px`);
  glyph.setAttribute("aria-hidden", "true");

  const dimensionText = document.createElement("span");
  const value = document.createElement("span");
  value.className = "dimension__value";
  value.textContent = `${group.width} × ${group.height}`;
  const unit = document.createElement("span");
  unit.className = "dimension__unit";
  unit.textContent = t("dimensionUnit");
  dimensionText.append(value, unit);
  dimension.append(glyph, dimensionText);
  dimensionCell.append(dimension);

  const devicesCell = document.createElement("td");
  const deviceList = document.createElement("ul");
  deviceList.className = "device-list";
  for (const device of group.devices) {
    deviceList.append(createDeviceItem(device));
  }
  devicesCell.append(deviceList);

  row.append(dimensionCell, devicesCell);
  return row;
}

function matchesPointSize(points, query) {
  if (!points || !/^[\d\sx×*]+$/i.test(query)) {
    return false;
  }

  const numbers = query.match(/\d+/g) ?? [];
  const width = String(points.width);
  const height = String(points.height);

  if (numbers.length === 1) {
    return width.includes(numbers[0]) || height.includes(numbers[0]);
  }
  if (numbers.length === 2) {
    return (
      (width.includes(numbers[0]) && height.includes(numbers[1])) ||
      (width.includes(numbers[1]) && height.includes(numbers[0]))
    );
  }
  return false;
}

function filteredDevices() {
  const query = state.query.trim().toLocaleLowerCase("en");
  return state.data.devices.filter((device) => {
    const matchesPlatform =
      state.platform === "all" || device.platform === state.platform;
    const matchesQuery =
      query === "" ||
      device.model.toLocaleLowerCase("en").includes(query) ||
      matchesPointSize(device?.portrait?.points, query);
    return matchesPlatform && matchesQuery;
  });
}

function createEmptyRow() {
  const row = document.createElement("tr");
  row.className = "empty-row";
  const cell = document.createElement("td");
  cell.colSpan = 2;
  const title = document.createElement("strong");
  title.textContent = t("emptyTitle");
  const hint = document.createElement("span");
  hint.textContent = t("emptyHint");
  cell.append(title, hint);
  row.append(cell);
  return row;
}

function render() {
  const devices = filteredDevices();
  const groups = groupByPointSize(devices);
  const fragment = document.createDocumentFragment();

  if (groups.length === 0) {
    fragment.append(createEmptyRow());
  } else {
    for (const group of groups) {
      fragment.append(createRow(group));
    }
  }

  elements.rows.replaceChildren(fragment);
  const numberLocale = state.locale === "en" ? "en-US" : "zh-TW";
  elements.deviceCount.textContent = devices.length.toLocaleString(numberLocale);
  elements.sizeCount.textContent = groups.length.toLocaleString(numberLocale);
  elements.tableShell.setAttribute("aria-busy", "false");
}

function updateSearch() {
  state.query = elements.searchInput.value;
  elements.clearSearch.hidden = state.query.length === 0;
  if (state.data) {
    render();
  }
}

function updateFilter(selectedButton) {
  state.platform = selectedButton.dataset.platform;
  for (const button of elements.filters) {
    const selected = button === selectedButton;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  render();
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("dateUnavailable");
  }
  const dateLocale = state.locale === "en" ? "en-US" : "zh-TW";
  const formattedDate = new Intl.DateTimeFormat(dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  return t("generatedAt", { date: formattedDate });
}

function showError(error) {
  elements.tableShell.hidden = true;
  elements.errorCard.hidden = false;
  elements.errorMessage.textContent =
    location.protocol === "file:"
      ? t("fileError")
      : error.message;
  elements.updatedAt.textContent = t("loadFailed");
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(t("httpError", { status: response.status, file: DATA_URL }));
    }

    const data = await response.json();
    if (!Array.isArray(data.devices)) {
      throw new Error(t("jsonError"));
    }

    state.data = data;
    if (data.source) {
      elements.sourceLink.href = data.source;
    }
    elements.updatedAt.textContent = formatUpdatedAt(data.generated_at);
    render();
  } catch (error) {
    showError(error instanceof Error ? error : new Error(t("unknownError")));
  }
}

for (const filter of elements.filters) {
  filter.addEventListener("click", () => updateFilter(filter));
}

for (const option of elements.languageOptions) {
  option.addEventListener("click", () => setLocale(option.dataset.locale));
}

elements.searchInput.addEventListener("input", updateSearch);
elements.searchInput.addEventListener("search", updateSearch);
elements.clearSearch.addEventListener("click", () => {
  elements.searchInput.value = "";
  updateSearch();
  elements.searchInput.focus();
});

setLocale(state.locale);
loadData();
