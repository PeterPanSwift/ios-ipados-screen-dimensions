const DATA_URL = "ios_ipados_screen_dimensions.json";

const state = {
  data: null,
  platform: "all",
  query: "",
};

const elements = {
  rows: document.querySelector("#device-rows"),
  tableShell: document.querySelector("#table-shell"),
  errorCard: document.querySelector("#error-card"),
  errorMessage: document.querySelector("#error-message"),
  deviceCount: document.querySelector("#device-count"),
  sizeCount: document.querySelector("#size-count"),
  updatedAt: document.querySelector("#updated-at"),
  sourceLink: document.querySelector("#source-link"),
  searchInput: document.querySelector("#device-search"),
  clearSearch: document.querySelector("#clear-search"),
  filters: [...document.querySelectorAll(".filter")],
};

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
  unit.textContent = "points · portrait";
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

function filteredDevices() {
  const query = state.query.trim().toLocaleLowerCase("en");
  return state.data.devices.filter((device) => {
    const matchesPlatform =
      state.platform === "all" || device.platform === state.platform;
    const matchesQuery =
      query === "" || device.model.toLocaleLowerCase("en").includes(query);
    return matchesPlatform && matchesQuery;
  });
}

function createEmptyRow() {
  const row = document.createElement("tr");
  row.className = "empty-row";
  const cell = document.createElement("td");
  cell.colSpan = 2;
  const title = document.createElement("strong");
  title.textContent = "找不到符合的裝置";
  const hint = document.createElement("span");
  hint.textContent = "請嘗試其他名稱，或切換平台篩選。";
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
  elements.deviceCount.textContent = devices.length.toLocaleString("zh-TW");
  elements.sizeCount.textContent = groups.length.toLocaleString("zh-TW");
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
    return "更新日期未提供";
  }
  return `資料產生於 ${new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)}`;
}

function showError(error) {
  elements.tableShell.hidden = true;
  elements.errorCard.hidden = false;
  elements.errorMessage.textContent =
    location.protocol === "file:"
      ? "請透過本機 HTTP 伺服器開啟網頁，例如執行 python3 -m http.server 8000。"
      : error.message;
  elements.updatedAt.textContent = "資料載入失敗";
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}：找不到 ${DATA_URL}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.devices)) {
      throw new Error("JSON 格式錯誤：缺少 devices 陣列。");
    }

    state.data = data;
    if (data.source) {
      elements.sourceLink.href = data.source;
    }
    elements.updatedAt.textContent = formatUpdatedAt(data.generated_at);
    render();
  } catch (error) {
    showError(error instanceof Error ? error : new Error("發生未知錯誤。"));
  }
}

for (const filter of elements.filters) {
  filter.addEventListener("click", () => updateFilter(filter));
}

elements.searchInput.addEventListener("input", updateSearch);
elements.searchInput.addEventListener("search", updateSearch);
elements.clearSearch.addEventListener("click", () => {
  elements.searchInput.value = "";
  updateSearch();
  elements.searchInput.focus();
});

loadData();
