// Tags for which cumulative data IS available (add tag names here)
const CUMULATIVE_INCLUDED_TAGS = [
  "pollution", // example: cumulative pollution makes sense
  "production", // example: cumulative production
  "gold", // example: cumulative gold
  // Add more tag names as needed
  "mfg"
];
const DEFAULT_SCORELOG_FILES = [
  "json/Suomipeli2025_freeciv21-score.json",
  "json/demo1.json",
  "json/demo2.json"

];
let playerStatsSort = {
  key: "max",
  direction: "desc"
};
const BASE_SERIES_COLORS = [
  "#1f77b4",
  "#d62728",
  "#2ca02c",
  "#ff7f0e",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#17becf",
  "#bcbd22",
  "#7f7f7f",
  "#006d77",
  "#ef476f",
  "#118ab2",
  "#8338ec",
  "#3a86ff",
  "#fb5607",
  "#ff006e",
  "#6a994e",
  "#4361ee",
  "#f4a261"
];

async function loadScorelog(fileName) {
  const response = await fetch(fileName);
  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status}`);
  }
  return response.json();
}

function getSeriesColors(seriesCount) {
  const colors = [];

  for (let index = 0; index < seriesCount; index += 1) {
    if (index < BASE_SERIES_COLORS.length) {
      colors.push(BASE_SERIES_COLORS[index]);
      continue;
    }

    const extraIndex = index - BASE_SERIES_COLORS.length;
    const hue = Math.round((extraIndex * 137.508) % 360);
    const saturation = 68 - ((extraIndex % 3) * 6);
    const lightness = 42 + ((extraIndex % 4) * 7);
    colors.push(`hsl(${hue} ${saturation}% ${lightness}%)`);
  }

  return colors;
}

function getChartSeries(seriesList) {
  if (!Boolean(window.SCORELOG_STACKED) || !Array.isArray(seriesList)) {
    return seriesList;
  }

  const allTurns = [...new Set(seriesList.flatMap((series) => {
    if (!series || !Array.isArray(series.data)) {
      return [];
    }
    return series.data
      .map((point) => point?.x)
      .filter((turn) => typeof turn === "number");
  }))].sort((a, b) => a - b);

  const latestTurn = allTurns[allTurns.length - 1];
  if (typeof latestTurn !== "number") {
    return seriesList;
  }

  return seriesList.map((series) => {
    if (!series || !Array.isArray(series.data) || series.data.length === 0) {
      return series;
    }

    const lastTurn = series.data[series.data.length - 1]?.x;
    if (typeof lastTurn !== "number" || lastTurn >= latestTurn) {
      return series;
    }

    const trailingZeros = allTurns
      .filter((turn) => turn > lastTurn)
      .map((turn) => ({ x: turn, y: 0 }));

    return {
      ...series,
      data: [...series.data, ...trailingZeros]
    };
  });
}

function buildOptions(tag) {
  const stacked = Boolean(window.SCORELOG_STACKED);

  return {
    series: [],
    chart: {
      type: stacked ? "area" : "line",
      height: 620,
      stacked,
      stackType: "normal",
      toolbar: { show: true },
      zoom: { enabled: true }
    },
    stroke: { width: 2 },
    fill: { opacity: stacked ? 0.75 : 1 },
    markers: { size: 0 },
    xaxis: {
      type: "numeric",
      title: { text: "Turn" }
    },
    yaxis: {
      title: { text: "Value" }
    },
    legend: { position: "bottom" },

  tooltip: {
      shared: true,
      intersect: false,
      followCursor: true,
      // custom renderer ensures we list every series even when Apex's
      // internal "series" array is truncated for huge datasets.
      custom: function ({series, seriesIndex, dataPointIndex, w}) {
        let html = '<div class="tooltip-custom">';
        const configuredSeries = Array.isArray(w.config.series) ? w.config.series : [];
        // try to pull the x value from whatever is available
        const xval =
          (w.globals.seriesX && w.globals.seriesX[0]
            ? w.globals.seriesX[0][dataPointIndex]
            : dataPointIndex);
        html += `<div><strong>Turn ${xval}</strong></div>`;
        configuredSeries.forEach((s, idx) => {
          // skip collapsed (hidden) series
          if (
            w.globals.collapsedSeries &&
            w.globals.collapsedSeries.indexOf(idx) !== -1
          ) {
            return;
          }
          const val =
            w.globals.series && w.globals.series[idx]
              ? w.globals.series[idx][dataPointIndex]
              : null;
          const color =
            (w.globals.colors && w.globals.colors[idx]) ||
            (w.config.colors && w.config.colors[idx]) ||
            "#999";
          const marker = `<span style="display:inline-flex;align-items:center;margin-right:6px;vertical-align:middle;"><span style="display:inline-block;width:12px;height:3px;background:${color};border-radius:999px;position:relative;"><span style="position:absolute;left:3px;top:50%;width:6px;height:6px;background:${color};border-radius:50%;transform:translateY(-50%);"></span></span></span>`;
          html += `<div>${marker}<span style="font-weight:bold;">${s.name}</span>: ${
            val !== null && val !== undefined ? val : "–"
          }</div>`;
        });
        html += "</div>";
        return html;
      }
    },
    noData: { text: "Select a tag to view data" }
  };
}

function populateTags(tagSelect, seriesByTag) {
  tagSelect.innerHTML = "";
  const entries = Object.entries(seriesByTag);
  entries.sort((a, b) => a[1].tag.localeCompare(b[1].tag));

  for (const [tagId, item] of entries) {
    const option = document.createElement("option");
    option.value = tagId;
    option.textContent = `${item.tag} (tag ${tagId})`;
    tagSelect.appendChild(option);
  }
}

function populateFileSelect(fileSelect, files) {
  fileSelect.innerHTML = "";
  for (const file of files) {
    const option = document.createElement("option");
    option.value = file;
    // Show only the filename, not the path
    option.textContent = file.split("/").pop();
    fileSelect.appendChild(option);
  }
}

function getRequestedFile(files) {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("file");
  if (requested && files.includes(requested)) {
    return requested;
  }
  return files[0];
}

function showGovLegend(show) {
  let govLegend = document.getElementById("gov-legend");
  if (!govLegend) {
    govLegend = document.createElement("div");
    govLegend.id = "gov-legend";
    govLegend.style.margin = "12px 0";
    govLegend.style.fontSize = "0.95em";
    govLegend.style.display = "none";
    document.querySelector("#chart").parentNode.appendChild(govLegend);
  }
  if (!show) {
    govLegend.style.display = "none";
    return;
  }
  const GOVERNMENT_NAMES = {
    "default": "Tribal (default)",
    0: "Anarchy",
    1: "Despotism",
    2: "Republic",
    3: "Democracy",
    4: "Monarchy",
    5: "Communism",
    6: "Fundamentalism",
    7: "Fascism",
    8: "Federation",
    9: "Corporate",
    10: "Cybernetic",
    11: "Ecotopia",
    12: "Theocracy",
    13: "Oligarchy",
    14: "Plutocracy",
    15: "Technocracy",
    16: "Matriarchy",
    17: "Patriarchy",
    18: "Utopia",
    19: "Tribal"
  };
  let html = '<b>Government Codes:</b><br><ul style="margin:0 0 0 1.2em;padding:0">';
  for (const [code, name] of Object.entries(GOVERNMENT_NAMES)) {
    html += `<li><b>${code}</b>: ${name}</li>`;
  }
  html += '</ul><br>According AI, taken from Freeciv government codes (common for classic rulesets). ';
  html += 'See: <a href="https://github.com/freeciv/freeciv/blob/master/common/government.h" target="_blank">https://github.com/freeciv/freeciv/blob/master/common/government.h</a>';
  govLegend.innerHTML = html;
  govLegend.style.display = "block";
}

function getDefaultSortDirection(key) {
  return key === "name" ? "asc" : "desc";
}

function getEffectivePlayerStatsSort(cumulativeAllowed) {
  if (!cumulativeAllowed && (playerStatsSort.key === "total" || playerStatsSort.key === "share")) {
    return {
      key: "max",
      direction: "desc"
    };
  }
  return playerStatsSort;
}

function togglePlayerStatsSort(key) {
  if (playerStatsSort.key === key) {
    playerStatsSort = {
      key,
      direction: playerStatsSort.direction === "asc" ? "desc" : "asc"
    };
    return;
  }

  playerStatsSort = {
    key,
    direction: getDefaultSortDirection(key)
  };
}

function sortPlayerStats(statList, sortState) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  return [...statList].sort((a, b) => {
    if (sortState.key === "name") {
      return a.cleanName.localeCompare(b.cleanName) * direction;
    }

    const aValue = a[sortState.key] ?? Number.NEGATIVE_INFINITY;
    const bValue = b[sortState.key] ?? Number.NEGATIVE_INFINITY;

    if (aValue === bValue) {
      return a.cleanName.localeCompare(b.cleanName);
    }

    return (aValue - bValue) * direction;
  });
}

function buildPlayerStatsHeader(label, key, align, sortState) {
  const isActive = sortState.key === key;
  const arrow = isActive ? (sortState.direction === "asc" ? " ▲" : " ▼") : "";
  return `<th style="text-align:${align};padding:2px 8px"><button type="button" data-sort-key="${key}" style="background:none;border:0;color:inherit;cursor:pointer;font:inherit;padding:0;white-space:nowrap;">${label}${arrow}</button></th>`;
}

function updateChart(chart, seriesByTag, tagId) {
  const tagBlock = seriesByTag[tagId];
  if (!tagBlock) {
    chart.updateSeries([]);
    showGovLegend(false);
    return;
  }
  // Defensive: check tagBlock and tagBlock.series
  if (!tagBlock || !Array.isArray(tagBlock.series)) {
    chart.updateSeries([]);
    showGovLegend(false);
    return;
  }
  const chartSeries = getChartSeries(tagBlock.series);
  const colors = getSeriesColors(chartSeries.length);
  chart.updateOptions(buildOptions(tagBlock.tag), false, true);
  chart.updateOptions({
    colors,
    yaxis: { title: { text: tagBlock.tag } }
  }, false, true);
  chart.updateSeries(chartSeries);
  showGovLegend(tagBlock.tag === "gov");

  // Show maximum and cumulative values per player in a table, or message if not available
  let statsDiv = document.getElementById("max-values");
  if (!statsDiv) {
    statsDiv = document.createElement("div");
    statsDiv.id = "max-values";
    statsDiv.style.margin = "8px 0 0 0";
    statsDiv.style.fontSize = "0.95em";
    document.querySelector("#chart").parentNode.appendChild(statsDiv);
  }
  if (Array.isArray(tagBlock.series)) {
    const tagName = tagBlock.tag;
    const cumulativeAllowed = CUMULATIVE_INCLUDED_TAGS.includes(tagName);
    const sortState = getEffectivePlayerStatsSort(cumulativeAllowed);
    // Build stats: max value, turn, cumulative
    let statList = tagBlock.series
      .filter(s => s && Array.isArray(s.data) && s.data.length > 0)
      .map(s => {
        let max = -Infinity, maxTurn = null, total = 0;
        for (const d of s.data) {
          if (typeof d.y === 'number') {
            total += d.y;
            if (d.y > max) {
              max = d.y;
              maxTurn = d.x;
            }
          }
        }
        const cleanName = s.name.replace(/^\d+\s+/, "");
        return { name: s.name, cleanName, max, maxTurn, total, share: null };
      });
    let html = '<b>Player stats:</b>';
    html += '<table style="margin:0.5em 0 0 0.5em;border-collapse:collapse"><thead><tr>' +
      buildPlayerStatsHeader('Player', 'name', 'left', sortState) +
      buildPlayerStatsHeader('Max value', 'max', 'right', sortState) +
      buildPlayerStatsHeader('at turn', 'maxTurn', 'right', sortState);
    let totalSum = 0;
    if (cumulativeAllowed) {
      totalSum = statList.reduce((acc, entry) => acc + entry.total, 0);
      statList = statList.map((entry) => ({
        ...entry,
        share: totalSum > 0 ? (entry.total / totalSum) * 100 : 0
      }));
      html += buildPlayerStatsHeader('Cumulative', 'total', 'right', sortState);
      html += buildPlayerStatsHeader('Share (%)', 'share', 'right', sortState);
    }
    statList = sortPlayerStats(statList, sortState);
    html += '</tr></thead><tbody>';
    for (const entry of statList) {
      html += `<tr>` +
        `<td style="padding:2px 8px 2px 0"><b>${entry.cleanName}</b></td>` +
        `<td style="text-align:right;padding:2px 8px">${entry.max}</td>` +
        `<td style="text-align:right;padding:2px 8px">${entry.maxTurn}</td>`;
      if (cumulativeAllowed) {
        const percent = totalSum > 0 ? entry.share.toFixed(1) : "-";
        html += `<td style="text-align:right;padding:2px 8px">${entry.total}</td>`;
        html += `<td style="text-align:right;padding:2px 8px">${percent}</td>`;
      }
      html += `</tr>`;
    }
    // Add TOTAL row for cumulative
    if (cumulativeAllowed) {
      html += `<tr style="font-weight:bold;background:#003399;color:#ffff33"><td style="padding:2px 8px 2px 0">TOTAL</td><td></td><td></td><td style="text-align:right;padding:2px 8px">${totalSum}</td><td style="text-align:right;padding:2px 8px">100.0</td></tr>`;
    }
    html += '</tbody></table>';
    if (!cumulativeAllowed) {
      html += '<div style="color:#ff8080;margin-top:0.5em">Cumulative data not available for this tag type.</div>';
    }
    statsDiv.innerHTML = html;
    statsDiv.querySelectorAll("[data-sort-key]").forEach((button) => {
      button.addEventListener("click", () => {
        togglePlayerStatsSort(button.dataset.sortKey);
        updateChart(chart, seriesByTag, tagId);
      });
    });
    statsDiv.style.display = "block";
  } else {
    statsDiv.style.display = "none";
  }
}

(async () => {
  const fileSelect = document.getElementById("fileSelect");
  const tagSelect = document.getElementById("tagSelect");
  const status = document.getElementById("status");
  // Add stacked checkbox
  let stackedBox = document.getElementById("stackedBox");
  if (!stackedBox) {
    stackedBox = document.createElement("label");
    stackedBox.style.margin = "0 0 0 12px";
    stackedBox.innerHTML = '<input type="checkbox" id="stackedInput"> Stacked';
    fileSelect.parentNode.appendChild(stackedBox);
  }
  const stackedInput = document.getElementById("stackedInput");
  window.SCORELOG_STACKED = stackedInput && stackedInput.checked;

  const files = Array.isArray(window.SCORELOG_FILES)
    ? window.SCORELOG_FILES
    : DEFAULT_SCORELOG_FILES;

  let seriesByTag = {};

  populateFileSelect(fileSelect, files);
  fileSelect.value = getRequestedFile(files);

  // Determine initial tag for tooltip customization
  let initialTag = null;
  try {
    const payload = await loadScorelog(fileSelect.value);
    initialTag = Object.values(payload.seriesByTag || {})[0]?.tag || null;
  } catch (e) {}
  const chart = new ApexCharts(document.querySelector("#chart"), buildOptions(initialTag));
  chart.render();
  if (stackedInput) {
    stackedInput.addEventListener("change", () => {
      window.SCORELOG_STACKED = stackedInput.checked;
      const currentTag = tagSelect.value;
      if (currentTag && seriesByTag[currentTag]) {
        updateChart(chart, seriesByTag, currentTag);
      } else {
        chart.updateOptions(buildOptions(initialTag), false, true);
      }
    });
  }

  async function loadAndRender(fileName) {
    status.textContent = `Loading ${fileName}...`;
    try {
      const payload = await loadScorelog(fileName);
      seriesByTag = payload.seriesByTag || {};

      populateTags(tagSelect, seriesByTag);
      const firstTag = tagSelect.value;
      if (firstTag) {
        updateChart(chart, seriesByTag, firstTag);
      } else {
        updateChart(chart, {}, "");
      }

      status.textContent = `Loaded ${fileName}.`;
    } catch (error) {
      status.textContent = error.message;
      updateChart(chart, {}, "");
    }
  }

  try {
    await loadAndRender(fileSelect.value);

    fileSelect.addEventListener("change", (event) => {
      loadAndRender(event.target.value);
    });

    tagSelect.addEventListener("change", (event) => {
      updateChart(chart, seriesByTag, event.target.value);
    });
  } catch (error) {
    status.textContent = error.message;
  }
})();
