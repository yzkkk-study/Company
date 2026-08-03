(() => {
  "use strict";

  const D = window.DECK_DATA;
  if (!D) {
    document.body.innerHTML = '<div class="empty-state">看板数据未加载。</div>';
    return;
  }

  const YEAR_COLORS = {
    2019: "#7C3AED",
    2020: "#A78BFA",
    2021: "#1F77B4",
    2022: "#FFD700",
    2023: "#2E9F4F",
    2024: "#808080",
    2025: "#000000",
    2026: "#E60012",
  };
  const NS = "http://www.w3.org/2000/svg";
  const profiles = [...D.company_profiles];
  const profileById = new Map(profiles.map((profile) => [profile.company_id, profile]));
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const number = (value, digits = 1) => value == null || Number.isNaN(Number(value))
    ? "—"
    : Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const wan = (kt, digits = 1) => kt == null ? "—" : `${number(Number(kt) / 10, digits)}万吨`;
  const pct = (value, digits = 1) => value == null ? "—" : `${number(Number(value) * 100, digits)}%`;
  const signed = (value, digits = 1) => value == null ? "—" : `${Number(value) > 0 ? "+" : ""}${number(value, digits)}`;
  const signedWan = (kt, digits = 1) => kt == null ? "—" : `${signed(Number(kt) / 10, digits)}万吨`;
  const signedPct = (value, digits = 1) => value == null ? "—" : `${Number(value) > 0 ? "+" : ""}${number(value, digits)}%`;
  const shorten = (value, length = 96) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > length ? `${text.slice(0, length - 1)}…` : text;
  };
  const classForValue = (value) => Number(value) > 0 ? "positive" : Number(value) < 0 ? "negative" : "";
  const svg = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function kpi(label, value, note, valueClass = "") {
    return `<div class="kpi-cell"><span>${esc(label)}</span><strong class="${valueClass}">${esc(value)}</strong><small>${esc(note)}</small></div>`;
  }

  function guidanceRange(row) {
    if (!row?.available || row.low_kt == null || row.high_kt == null) return "未披露";
    return Number(row.low_kt) === Number(row.high_kt)
      ? wan(row.low_kt)
      : `${number(Number(row.low_kt) / 10, 1)}-${number(Number(row.high_kt) / 10, 1)}万吨`;
  }

  function progressLabel(status) {
    return {
      ahead: "快于时间进度",
      behind: "慢于时间进度",
      on_track: "大致匹配时间进度",
      unavailable: "无法计算",
    }[status] || "无法计算";
  }

  function progressClass(status) {
    return { ahead: "ahead", behind: "behind", on_track: "on-track" }[status] || "";
  }

  function basisLabel(guidance, profile) {
    const metric = String(guidance?.metric || "");
    if (/equivalent|铜当量/i.test(metric)) return "铜当量口径";
    if (/sales|销量/i.test(metric)) return "铜销量口径";
    if (/anode|blister/i.test(metric)) return "阳极铜或粗铜口径";
    return guidance?.basis_tag || profile?.basis_group || "公司产量口径";
  }

  function setTab(name, updateHash = true) {
    const target = $(`#panel-${name}`) ? name : "guidance";
    $$(".tab-button").forEach((button) => {
      const active = button.dataset.tab === target;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $$(".tab-panel").forEach((panel) => {
      const active = panel.id === `panel-${target}`;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    localStorage.setItem("copperMineDashboardTab", target);
    if (updateHash) history.replaceState(null, "", `#${target}`);
  }

  function setupTabs() {
    $$(".tab-button").forEach((button, index, buttons) => {
      button.addEventListener("click", () => setTab(button.dataset.tab));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = buttons[(index + direction + buttons.length) % buttons.length];
        setTab(next.dataset.tab);
        next.focus();
      });
    });
    const hashTab = location.hash.replace("#", "");
    const stored = localStorage.getItem("copperMineDashboardTab");
    setTab(hashTab || stored || "guidance", false);
  }

  function dashboardGuidance(profile) {
    const source = profile.current_guidance || D.guidance_overview.find((row) => row.company_id === profile.company_id) || { available: false };
    return { ...source };
  }

  const guidanceRows = profiles.map((profile) => ({ profile, guidance: dashboardGuidance(profile) }));
  const guidanceByCompany = new Map(guidanceRows.map(({ profile, guidance }) => [profile.company_id, guidance]));
  let guidanceSort = { key: "period", direction: -1 };

  function renderGuidanceSummary() {
    const available = guidanceRows.filter(({ guidance }) => guidance.available).length;
    const summary = D.aggregate_guidance_summary;
    const guidanceMidpoint = Number(summary.guidance_midpoint_kt);
    const priorActual = Number(summary.prior_actual_kt);
    const delta = Number(summary.delta_kt);
    const deltaPct = summary.delta_pct;
    const deltaClass = classForValue(delta);
    $("#guidance-summary").innerHTML = [
      kpi("连续跟踪企业", `${profiles.length}家`, `${available}家已形成2026年指引并纳入总样本`),
      kpi("可比指引中点合计", wan(guidanceMidpoint), `上年自然年对应实际 ${wan(priorActual)}`),
      kpi("指引隐含同比增减", signedWan(delta), signedPct(deltaPct), deltaClass),
      kpi("整体指引完成度", pct(summary.completion_mid), `${summary.completion_company_count}家已披露${summary.completion_period}`),
    ].join("");
  }

  function guidanceSortValue(row, key) {
    const { profile, guidance } = row;
    return {
      company: profile.company,
      guidance: guidance.midpoint_kt,
      prior: guidance.prior_actual_kt,
      delta: guidance.guidance_delta_pct,
      actual: guidance.actual_ytd_kt,
      completion: guidance.completion_mid,
      period: profile.latest_period,
      basis: basisLabel(guidance, profile),
    }[key];
  }

  function compareGuidanceRows(left, right) {
    const a = guidanceSortValue(left, guidanceSort.key);
    const b = guidanceSortValue(right, guidanceSort.key);
    if (a == null && b == null) return left.profile.company.localeCompare(right.profile.company, "zh-CN");
    if (a == null) return 1;
    if (b == null) return -1;
    const result = typeof a === "string" ? a.localeCompare(b, "zh-CN") : Number(a) - Number(b);
    return result * guidanceSort.direction;
  }

  function renderGuidanceTable() {
    const query = $("#guidance-search").value.trim().toLocaleLowerCase("zh-CN");
    const filtered = guidanceRows
      .filter(({ profile, guidance }) => !query || `${profile.company} ${guidance.metric || ""}`.toLocaleLowerCase("zh-CN").includes(query))
      .sort(compareGuidanceRows);

    $("#guidance-count").textContent = `显示 ${filtered.length} / ${guidanceRows.length} 家`;
    $("#guidance-body").innerHTML = filtered.map(({ profile, guidance }) => {
      const basis = basisLabel(guidance, profile);
      const delta = guidance.guidance_delta_pct == null ? "—" : signedPct(guidance.guidance_delta_pct);
      const deltaNote = guidance.guidance_delta_kt == null ? guidance.exclusion_reason || "未形成可比上年实际" : signedWan(guidance.guidance_delta_kt);
      const completion = guidance.completion_mid;
      const completionWidth = completion == null ? 0 : Math.max(0, Math.min(Number(completion) * 100, 100));
      const completionNote = guidance.completion_basis_note || guidance.exclusion_reason || progressLabel(guidance.progress_status);
      return `<tr>
        <td><strong class="cell-main">${esc(profile.company)}</strong><span class="cell-sub">${esc(profile.metric || "公司主口径")}</span></td>
        <td><strong class="cell-main">${esc(guidanceRange(guidance))}</strong><span class="cell-sub">${esc(guidance.metric || "未提取到可用指引")}</span></td>
        <td><strong class="cell-main">${esc(wan(guidance.prior_actual_kt))}</strong><span class="cell-sub">同口径全年实际</span></td>
        <td><strong class="cell-main ${classForValue(guidance.guidance_delta_pct)}">${esc(delta)}</strong><span class="cell-sub">${esc(deltaNote)}</span></td>
        <td><strong class="cell-main">${esc(wan(guidance.actual_ytd_kt))}</strong><span class="cell-sub">${esc(guidance.actual_note || "同口径累计")}</span></td>
        <td>
          <div class="completion-value"><span>${esc(pct(completion))}</span><span>${esc(progressLabel(guidance.progress_status))}</span></div>
          <div class="progress-track"><i class="${progressClass(guidance.progress_status)}" style="width:${completionWidth}%"></i></div>
          <span class="cell-sub">${esc(completionNote)}</span>
        </td>
        <td><span class="period-label">${esc(profile.latest_period || guidance.disclosed_period || "—")}</span><span class="cell-sub">最新产量期</span></td>
        <td><span class="basis-label">${esc(basis)}</span><span class="cell-sub">${esc(guidance.exclusion_reason || guidance.metric || profile.basis || "")}</span></td>
      </tr>`;
    }).join("") || '<tr><td colspan="8"><div class="empty-state">没有符合筛选条件的企业。</div></td></tr>';
  }

  function setupGuidance() {
    renderGuidanceSummary();
    $("#guidance-search").addEventListener("input", renderGuidanceTable);
    $$(".sort-button").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.sort;
        guidanceSort = guidanceSort.key === key
          ? { key, direction: guidanceSort.direction * -1 }
          : { key, direction: key === "period" ? -1 : 1 };
        $$(".sort-button").forEach((item) => {
          const active = item.dataset.sort === key;
          item.classList.toggle("is-sorted", active);
          item.querySelector("span").textContent = active ? (guidanceSort.direction > 0 ? "↑" : "↓") : "↕";
        });
        renderGuidanceTable();
      });
    });
    renderGuidanceTable();
  }

  function smoothPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
    let path = `M${points[0][0]},${points[0][1]}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[Math.max(0, index - 1)];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[Math.min(points.length - 1, index + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return path;
  }

  function niceAxisStep(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = 10 ** Math.floor(Math.log10(value));
    const fraction = value / exponent;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return niceFraction * exponent;
  }

  function renderDisclosedChart(container, rows) {
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">未形成可用的按披露期产量序列。</div>';
      return;
    }
    const compact = window.matchMedia("(max-width: 680px)").matches;
    const width = compact ? 520 : 1040;
    const height = compact ? 390 : 350;
    const margin = compact
      ? { top: 24, right: 20, bottom: 54, left: 58 }
      : { top: 24, right: 34, bottom: 52, left: 68 };
    const ordered = [...rows].sort((a, b) => a.period.localeCompare(b.period));
    const values = ordered.map((row) => Number(row.kt) / 10);
    const rawMin = Math.min(...values), rawMax = Math.max(...values);
    const step = niceAxisStep(((rawMax - rawMin) || Math.max(rawMax * 0.08, 1)) / 5);
    let min = Math.max(0, Math.floor(rawMin / step) * step);
    let max = Math.ceil(rawMax / step) * step;
    if (max === min) max += step;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const x = (index) => margin.left + (ordered.length === 1 ? plotWidth / 2 : index * plotWidth / (ordered.length - 1));
    const y = (value) => margin.top + (max - value) / (max - min) * plotHeight;
    const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "按披露期产量趋势图" });
    for (let index = 0; index <= 5; index += 1) {
      const value = min + (max - min) * index / 5;
      const yy = y(value);
      root.append(svg("line", { x1: margin.left, y1: yy, x2: width - margin.right, y2: yy, stroke: "#E5E8EC" }));
      const label = svg("text", { x: margin.left - 10, y: yy + 4, "text-anchor": "end", class: "svg-label" });
      label.textContent = number(value, step < 1 ? 1 : 0);
      root.append(label);
    }
    const points = ordered.map((row, index) => [x(index), y(Number(row.kt) / 10), row]);
    root.append(svg("path", { d: smoothPath(points.map(([px, py]) => [px, py])), fill: "none", stroke: "#0F766E", "stroke-width": 4, "stroke-linecap": "round" }));
    points.forEach(([px, py, row], index) => {
      root.append(svg("circle", { cx: px, cy: py, r: index === points.length - 1 ? 5 : 3, fill: "#0F766E", stroke: "#FFFFFF", "stroke-width": 2 }));
      const label = svg("text", { x: px, y: height - 20, "text-anchor": "middle", class: "svg-label" });
      label.textContent = row.period;
      root.append(label);
    });
    const unit = svg("text", { x: margin.left, y: 14, class: "svg-unit" });
    unit.textContent = "万吨";
    root.append(unit);
    container.innerHTML = "";
    container.append(root);
  }

  function renderSeasonalChart(container, rows, latestPeriod) {
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">未形成季度产量序列。</div>';
      return;
    }
    const compact = window.matchMedia("(max-width: 680px)").matches;
    const width = compact ? 520 : 1040;
    const height = compact ? 390 : 350;
    const margin = compact
      ? { top: 24, right: 20, bottom: 46, left: 52 }
      : { top: 24, right: 34, bottom: 48, left: 62 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = rows.map((row) => Number(row.kt) / 10).filter(Number.isFinite);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawRange = rawMax - rawMin;
    const step = niceAxisStep((rawRange || Math.max(rawMax * 0.08, 1)) / 5);
    let min = Math.max(0, Math.floor(rawMin / step) * step);
    let max = Math.ceil(rawMax / step) * step;
    if (max === min) {
      min = Math.max(0, min - step);
      max += step;
    }
    const tickCount = Math.max(2, Math.round((max - min) / step));
    const tickDigits = step < 0.1 ? 2 : step < 1 || step % 1 !== 0 ? 1 : 0;
    const xPadding = plotWidth * 0.04;
    const x = (quarter) => margin.left + xPadding + (Number(String(quarter).replace("Q", "")) - 1) * ((plotWidth - xPadding * 2) / 3);
    const y = (value) => margin.top + (max - value) / (max - min) * plotHeight;
    const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "季度产量季节性图" });

    for (let index = 0; index <= tickCount; index += 1) {
      const value = min + step * index;
      const yy = y(value);
      root.append(svg("line", { x1: margin.left, y1: yy, x2: width - margin.right, y2: yy, stroke: "#E5E8EC", "stroke-width": 1 }));
      const label = svg("text", { x: margin.left - 10, y: yy + 4, "text-anchor": "end", class: "svg-label" });
      label.textContent = number(value, tickDigits);
      root.append(label);
    }
    [1, 2, 3, 4].forEach((quarter) => {
      const label = svg("text", { x: x(`Q${quarter}`), y: height - 19, "text-anchor": "middle", class: "svg-label" });
      label.textContent = `Q${quarter}`;
      root.append(label);
    });

    const groups = new Map();
    rows.forEach((row) => {
      if (!groups.has(row.year)) groups.set(row.year, []);
      groups.get(row.year).push(row);
    });
    const latestYear = Number(String(latestPeriod).slice(0, 4));
    [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([year, items]) => {
      const sorted = items.sort((a, b) => a.quarter.localeCompare(b.quarter));
      const points = sorted.map((row) => [x(row.quarter), y(Number(row.kt) / 10), row]);
      const latest = Number(year) === latestYear;
      root.append(svg("path", {
        d: smoothPath(points.map(([px, py]) => [px, py])),
        fill: "none",
        stroke: YEAR_COLORS[year] || "#64748B",
        "stroke-width": latest ? 4 : 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }));
      if (latest) {
        points.forEach(([px, py, row]) => {
          const point = svg("circle", {
            cx: px,
            cy: py,
            r: 5,
            fill: YEAR_COLORS[year] || "#64748B",
            stroke: "#FFFFFF",
            "stroke-width": 2,
          });
          const title = svg("title");
          title.textContent = `${row.period}：${wan(row.kt)}`;
          point.append(title);
          root.append(point);
        });
      }
    });
    const unit = svg("text", { x: margin.left, y: 14, class: "svg-unit" });
    unit.textContent = "万吨";
    root.append(unit);

    container.innerHTML = "";
    container.append(root);
    const legend = document.createElement("div");
    legend.className = "svg-legend";
    legend.innerHTML = [...groups.keys()].sort().map((year) => `<span><i class="${Number(year) === latestYear ? "latest" : ""}" style="background:${YEAR_COLORS[year] || "#64748B"}"></i>${year}${Number(year) === latestYear ? "（最新）" : ""}</span>`).join("");
    container.append(legend);
  }

  function renderYoyChart(container, rows) {
    const data = rows
      .filter((row) => row.yoy_kt != null)
      .sort((left, right) => left.period.localeCompare(right.period));
    if (!data.length) {
      container.innerHTML = '<div class="empty-state">未形成季度同比序列。</div>';
      return;
    }
    const compact = window.matchMedia("(max-width: 680px)").matches;
    const width = compact ? 640 : 900;
    const height = compact ? 380 : 350;
    const margin = compact
      ? { top: 28, right: 16, bottom: 58, left: 56 }
      : { top: 28, right: 24, bottom: 54, left: 62 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = data.map((row) => Number(row.yoy_kt) / 10);
    const max = Math.max(...values.map(Math.abs), 1);
    const slotWidth = plotWidth / data.length;
    const barWidth = Math.max(5, slotWidth - (compact ? 4 : 6));
    const x = (index) => margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
    const y = (value) => margin.top + (max - value) / (max * 2) * plotHeight;
    const zero = y(0);
    const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "矿山季度同比增减量" });

    [-max, -max / 2, 0, max / 2, max].forEach((value) => {
      const yy = y(value);
      root.append(svg("line", {
        x1: margin.left,
        y1: yy,
        x2: width - margin.right,
        y2: yy,
        stroke: value === 0 ? "#64748B" : "#E5E8EC",
        "stroke-width": value === 0 ? 1.5 : 1,
      }));
      const label = svg("text", { x: margin.left - 9, y: yy + 4, "text-anchor": "end", class: "svg-label" });
      label.textContent = number(value, 1);
      root.append(label);
    });

    data.forEach((row, index) => {
      const value = Number(row.yoy_kt) / 10;
      const yy = value >= 0 ? y(value) : zero;
      const bar = svg("rect", {
        x: x(index),
        y: yy,
        width: barWidth,
        height: Math.max(Math.abs(y(value) - zero), 1),
        fill: value >= 0 ? "#087A62" : "#B63F3A",
        rx: 1.5,
      });
      const title = svg("title");
      title.textContent = `${row.period}：${signedWan(row.yoy_kt)}`;
      bar.append(title);
      root.append(bar);
      if (row.quarter === "Q1" || index === data.length - 1) {
        const label = svg("text", { x: x(index) + barWidth / 2, y: height - 23, "text-anchor": "middle", class: "svg-small" });
        label.textContent = row.period;
        root.append(label);
      }
    });

    const unit = svg("text", { x: margin.left, y: 15, class: "svg-unit" });
    unit.textContent = "同比变化（万吨）";
    root.append(unit);
    container.innerHTML = "";
    container.append(root);
  }

  function futureGuidanceAmount(row) {
    const low = Number(row.low);
    const high = Number(row.high);
    const unit = String(row.unit || "");
    if (row.kind === "产量") return low === high ? wan(low) : `${number(low / 10, 1)}-${number(high / 10, 1)}万吨`;
    if (/million/i.test(unit)) {
      const currency = (unit.match(/USD|CAD|RMB|PLN|SEK|AUD|EUR/i) || [""])[0].toUpperCase();
      return `${currency} ${low === high ? number(low / 1000, 2) : `${number(low / 1000, 2)}-${number(high / 1000, 2)}`} bn`;
    }
    if (/billion/i.test(unit)) {
      const currency = (unit.match(/USD|CAD|RMB|PLN|SEK|AUD|EUR/i) || [""])[0].toUpperCase();
      return `${currency} ${low === high ? number(low, 2) : `${number(low, 2)}-${number(high, 2)}`} bn`;
    }
    if (unit === "USD/lb") return low === high ? `$${number(low, 2)}/lb` : `$${number(low, 2)}-${number(high, 2)}/lb`;
    return `${low === high ? number(low, 2) : `${number(low, 2)}-${number(high, 2)}`} ${unit}`.trim();
  }

  function costMetricLabel(cost) {
    const metric = String(cost?.metric || "");
    if (/net(?: unit)? cash|净现金/i.test(metric)) return "净现金成本";
    if (/C1/i.test(metric)) return "C1成本";
    if (/site production and delivery/i.test(metric)) return "现场生产交付成本";
    if (/unit cost|单位成本|单位销售成本/i.test(metric)) return "单位成本";
    if (/cash operating/i.test(metric)) return "现金运营成本";
    return "成本";
  }

  function stageText(value) {
    const text = String(value || "");
    const labels = [];
    const rules = [
      [/operat|commission/i, "运营/调试"], [/ramp.?up/i, "爬坡"], [/construction|execution/i, "建设/执行"],
      [/sanction|approved/i, "已批准"], [/permitting/i, "许可推进"], [/pre.?feasibility|studies/i, "预可研/研究"],
      [/exploration|drilling|resource/i, "勘探/资源界定"], [/business.?case|pre.?sanction/i, "方案优化/待批准"],
      [/feasibility|engineering|study/i, "研究/工程"], [/development|early works/i, "开发/前期工程"],
      [/environmental|EIA/i, "环境审批"], [/acquir|integrat/i, "收购整合"], [/preparation/i, "准备阶段"],
      [/project update/i, "项目更新"],
    ];
    rules.forEach(([pattern, label]) => {
      if (pattern.test(text) && !labels.includes(label)) labels.push(label);
    });
    return labels.length ? labels.join(" / ") : text ? "进展已披露，详见摘要" : "进展未披露";
  }

  let currentCompanyId = localStorage.getItem("copperMineDashboardCompany");
  if (!profileById.has(currentCompanyId)) currentCompanyId = profiles[0].company_id;

  function renderCompany(profile) {
    currentCompanyId = profile.company_id;
    localStorage.setItem("copperMineDashboardCompany", currentCompanyId);
    $("#company-select").value = currentCompanyId;
    $$(".company-option").forEach((button) => button.classList.toggle("is-active", button.dataset.companyId === currentCompanyId));
    const activeRailItem = $(`.company-option[data-company-id="${currentCompanyId}"]`);
    activeRailItem?.scrollIntoView({ block: "nearest" });

    const stats = profile.quarter_stats;
    const quarterly = profile.production_period_basis === "quarterly";
    const guidance = guidanceByCompany.get(profile.company_id) || profile.current_guidance;
    $("#company-period").textContent = `数据截至 ${profile.latest_period}`;
    $("#company-name").textContent = profile.company;
    $("#company-basis-group").textContent = profile.basis_group || "公司披露口径";
    $("#company-metric").textContent = `${profile.metric || "公司主口径"} · 公司自身时间序列`;
    $(".seasonal-panel h4").textContent = quarterly ? "季度产量季节性" : "按披露期产量趋势";
    $("#company-basis").textContent = profile.basis || "未披露";
    $("#company-kpis").innerHTML = [
      kpi(quarterly ? "当季度产量" : "最新披露产量", wan(stats.current_kt), profile.metric || "公司主口径"),
      kpi(quarterly ? "单季同比增减" : "同口径同比增减", signedWan(stats.quarter_change_kt), signedPct(stats.quarter_change_pct), classForValue(stats.quarter_change_kt)),
      quarterly
        ? kpi("累计同比增减", signedWan(stats.ytd_change_kt), signedPct(stats.ytd_change_pct), classForValue(stats.ytd_change_kt))
        : kpi("上年同口径产量", wan(stats.prior_kt), "不拆分自然季度"),
      kpi("年度指引完成度", pct(guidance?.completion_mid), progressLabel(guidance?.progress_status)),
    ].join("");

    const seasonal = D.company_seasonal.filter((row) => row.company_id === profile.company_id);
    const disclosed = (D.company_disclosed || []).filter((row) => row.company_id === profile.company_id);
    if (quarterly) renderSeasonalChart($("#company-seasonal-chart"), seasonal, profile.latest_period);
    else renderDisclosedChart($("#company-seasonal-chart"), disclosed);
    $("#production-explanation").textContent = profile.production_summary_cn || "报告未提供可稳定提取的产量变化解释。";
    $("#cost-explanation").textContent = profile.cost_detail?.explanation_cn || "公司未在已提取文本中单列成本变动原因。";

    let guidanceSummary = "未提取到2026年度可用产量指引。";
    if (guidance?.available) {
      guidanceSummary = `${guidanceRange(guidance)}；截至当前完成${pct(guidance.completion_mid)}，${progressLabel(guidance.progress_status)}。`;
      guidanceSummary += guidance.comparable
        ? `指引中点较上年对应实际${signedWan(guidance.guidance_delta_kt)}。`
        : `不纳入总览可比合计：${guidance.exclusion_reason || "口径不可比"}。`;
    }
    $("#company-guidance-summary").textContent = guidanceSummary;
    const futureRows = profile.future_guidance || [];
    $("#future-guidance-list").innerHTML = futureRows.length
      ? futureRows.map((row) => {
        const kind = row.kind === "成本" ? costMetricLabel(profile.cost_detail) : row.kind;
        return `<div class="guidance-line"><b>${esc(row.target)} · ${esc(kind)}</b><strong>${esc(futureGuidanceAmount(row))}</strong><span>${esc(shorten(row.metric, 46))}${row.note ? ` · ${esc(shorten(row.note, 38))}` : ""}</span></div>`;
      }).join("")
      : '<div class="empty-state">未提取到未来年度的产量、成本或资本开支指引。</div>';

    const historyNote = $("#guidance-history-note");
    if (profile.guidance_history?.length) {
      historyNote.hidden = false;
      historyNote.textContent = "历史回溯：2020-2025年仅披露品位但缺少同期全年处理量指引，未强行计算；2026年理论含铜量代理为14.3万吨。";
    } else {
      historyNote.hidden = true;
      historyNote.textContent = "";
    }

    const projects = profile.projects || [];
    const mineSnapshots = (profile.focus_mine_disclosures || []).map((row) => `<div class="project-row"><strong>${esc(row.mine)} · ${esc(row.period)}</strong><span>100%量 ${esc(wan(row.kt))}</span><small>${row.equity_kt == null ? esc(shorten(row.notes || row.basis || "权益量未披露", 120)) : `权益${esc(number(row.ownership_pct, 1))}% · ${esc(wan(row.equity_kt))}`}</small></div>`);
    const projectRows = mineSnapshots.concat(projects.map((row) => `<div class="project-row"><strong>${esc(row.project)}</strong><span>${esc(stageText(row.stage))}</span><small>${esc(shorten(row.summary_cn || "项目规模、时间和资本开支未披露", 150))}</small></div>`));
    $("#project-list").innerHTML = projectRows.length
      ? projectRows.join("")
      : '<div class="empty-state">本次结构化数据未提取到明确的未来铜矿项目。</div>';
  }

  function shiftCompany(direction) {
    const index = profiles.findIndex((profile) => profile.company_id === currentCompanyId);
    renderCompany(profiles[(index + direction + profiles.length) % profiles.length]);
  }

  function setupCompanies() {
    $("#rail-count").textContent = profiles.length;
    $("#company-select").innerHTML = profiles.map((profile) => `<option value="${esc(profile.company_id)}">${esc(profile.company)} · ${esc(profile.latest_period)}</option>`).join("");
    $("#company-list").innerHTML = profiles.map((profile) => `<button type="button" class="company-option" data-company-id="${esc(profile.company_id)}"><strong>${esc(profile.company)}</strong><span>${esc(profile.latest_period)}</span></button>`).join("");
    $("#company-select").addEventListener("change", (event) => renderCompany(profileById.get(event.target.value)));
    $("#company-prev").addEventListener("click", () => shiftCompany(-1));
    $("#company-next").addEventListener("click", () => shiftCompany(1));
    $$(".company-option").forEach((button) => button.addEventListener("click", () => renderCompany(profileById.get(button.dataset.companyId))));
    window.matchMedia("(max-width: 680px)").addEventListener("change", () => renderCompany(profileById.get(currentCompanyId)));
    renderCompany(profileById.get(currentCompanyId));
  }

  function computeMineYtd(view) {
    const year = Number(String(view.period).slice(0, 4));
    const quarter = Number(String(view.period).replace(/^.*Q/, ""));
    const rowsByMine = new Map();
    view.mine_seasonal.forEach((row) => {
      const rowQuarter = Number(String(row.quarter).replace("Q", ""));
      if (rowQuarter > quarter || ![year, year - 1].includes(Number(row.year))) return;
      if (!rowsByMine.has(row.mine_id)) {
        rowsByMine.set(row.mine_id, {
          mine_id: row.mine_id,
          mine: row.mine,
          company: row.company,
          current_kt: 0,
          prior_kt: 0,
          current_present: false,
          prior_present: false,
        });
      }
      const item = rowsByMine.get(row.mine_id);
      if (Number(row.year) === year) {
        item.current_kt += Number(row.kt) || 0;
        item.current_present = true;
        item.mine = row.mine || item.mine;
        item.company = row.company || item.company;
      } else {
        item.prior_kt += Number(row.kt) || 0;
        item.prior_present = true;
      }
    });
    const rows = [...rowsByMine.values()]
      .map((row) => ({ ...row, change_kt: row.current_kt - row.prior_kt }))
      .sort((left, right) => right.change_kt - left.change_kt);
    return { year, quarter, rows };
  }

  function renderMineList(container, rows, negative = false) {
    const max = Math.max(...rows.map((row) => Math.abs(row.change_kt)), 1);
    container.innerHTML = rows.map((row, index) => {
      const width = Math.max(1, Math.abs(row.change_kt) / max * 100);
      return `<div class="contribution-row">
        <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
        <div class="mine-label"><strong title="${esc(row.mine)}">${esc(row.mine)}</strong><span>${esc(row.company || "")}</span></div>
        <div class="bar-track ${negative ? "negative-bar" : ""}"><i style="width:${width}%"></i></div>
        <span class="change-value ${negative ? "negative" : "positive"}">${esc(signedWan(row.change_kt))}<small>${esc(wan(row.current_kt))} / ${esc(wan(row.prior_kt))}</small></span>
      </div>`;
    }).join("") || '<div class="empty-state">没有可比矿山。</div>';
  }

  function setupMines() {
    const button = $("#mine-scope-toggle");
    const sample = D.latest_reported_mine_sample;
    const common = D.common_mine_view || {
      scope: "common_complete",
      period: D.meta.as_of,
      company_count: D.meta.company_count,
      seasonal_totals: D.seasonal_totals,
      mine_seasonal: D.mine_seasonal,
      mine_yoy_contribution: D.mine_yoy_contribution,
    };
    let reportedScope = false;

    const render = () => {
      const view = reportedScope ? sample : common;
      const ytd = view.mine_ytd_contribution?.length
        ? { year: view.summary.year, quarter: view.summary.quarter, rows: view.mine_ytd_contribution }
        : computeMineYtd(view);
      const summary = view.summary || {};
      const currentTotal = Number(summary.current_total_kt ?? view.seasonal_totals
        .filter((row) => Number(row.year) === ytd.year && Number(String(row.quarter).replace("Q", "")) <= ytd.quarter)
        .reduce((sum, row) => sum + Number(row.kt), 0).toFixed(1));
      const priorTotal = Number(summary.prior_total_kt ?? view.seasonal_totals
        .filter((row) => Number(row.year) === ytd.year - 1 && Number(String(row.quarter).replace("Q", "")) <= ytd.quarter)
        .reduce((sum, row) => sum + Number(row.kt), 0).toFixed(1));
      const delta = Number(summary.change_kt ?? (currentTotal - priorTotal).toFixed(1));
      const currentMineCount = Number(summary.current_mine_count ?? ytd.rows.filter((row) => row.current_present).length);
      const priorMineCount = Number(summary.prior_mine_count ?? ytd.rows.filter((row) => row.prior_present).length);
      const comparisonMineCount = Number(summary.comparison_mine_count ?? ytd.rows.length);
      const positives = ytd.rows.filter((row) => row.change_kt > 0).slice(0, 10);
      const negatives = ytd.rows.filter((row) => row.change_kt < 0).sort((left, right) => left.change_kt - right.change_kt).slice(0, 10);
      const latest = view.seasonal_totals.find((row) => row.period === view.period);
      const quarterlyRows = [...view.mine_yoy_contribution];
      const strongest = quarterlyRows[0];
      const weakest = [...quarterlyRows].sort((left, right) => left.change_kt - right.change_kt)[0];
      const sampleLabel = reportedScope
        ? `${view.period}已披露 · ${view.company_count}家企业`
        : `${view.period}共同完整季度 · ${view.company_count}家企业`;

      $("#mine-title").textContent = `${ytd.year}年截至Q${ytd.quarter}累计矿山贡献与季度趋势`;
      $("#mine-summary").innerHTML = [
        kpi("当年累计产量", wan(currentTotal), `${ytd.year}Q1-Q${ytd.quarter}去重矿山合计`),
        kpi("上年同期产量", wan(priorTotal), `${ytd.year - 1}Q1-Q${ytd.quarter}同口径`),
        kpi("累计同比增减", signedWan(delta), priorTotal ? signedPct(delta / priorTotal * 100) : "—", classForValue(delta)),
        kpi("纳入同比矿山/矿组", `${comparisonMineCount}个`, `当年${currentMineCount} / 上年${priorMineCount}`),
      ].join("");
      renderSeasonalChart($("#mine-seasonal-chart"), view.seasonal_totals, view.period);
      renderYoyChart($("#mine-yoy-chart"), view.seasonal_totals);
      $("#mine-seasonal-scope-note").textContent = `${sampleLabel} · ${latest?.mine_count || 0}个矿山/矿组`;
      $("#mine-yoy-scope-note").textContent = `${sampleLabel} · 单季同比`;
      $("#mine-yoy-insights").innerHTML = [
        `<span><b>最新季度</b>${esc(signedWan(latest?.yoy_kt))}</span>`,
        `<span><b>最大增量矿山</b>${esc(strongest?.mine || "—")} ${esc(signedWan(strongest?.change_kt))}</span>`,
        `<span><b>最大减量矿山</b>${esc(weakest?.mine || "—")} ${esc(signedWan(weakest?.change_kt))}</span>`,
      ].join("");
      $("#positive-title").textContent = `${ytd.year}年截至Q${ytd.quarter}累计同比增量前十大矿山`;
      $("#negative-title").textContent = `${ytd.year}年截至Q${ytd.quarter}累计同比减量后十大矿山`;
      $("#positive-scope-note").textContent = reportedScope ? `${view.company_count}家已披露企业` : `${view.company_count}家企业样本`;
      $("#negative-scope-note").textContent = $("#positive-scope-note").textContent;
      renderMineList($("#positive-mines"), positives, false);
      renderMineList($("#negative-mines"), negatives, true);
      $("#mine-method-note").textContent = `本页全部数据按${sampleLabel}统一计算；累计贡献榜、季度季节性和季度同比使用同一企业样本。矿山100%含铜量按mine_id去重，并沿用固定优先来源、收购前回填和出售后剔除规则。`;
      button.classList.toggle("is-active", reportedScope);
      button.setAttribute("aria-pressed", String(reportedScope));
      button.title = reportedScope ? "切换回共同完整季度口径" : "切换至最新一期已披露企业样本";
    };
    if (!sample?.seasonal_totals?.length || !sample?.mine_seasonal?.length) {
      button.hidden = true;
      reportedScope = false;
    }
    button.addEventListener("click", () => {
      reportedScope = !reportedScope;
      render();
    });
    window.matchMedia("(max-width: 680px)").addEventListener("change", render);
    render();
  }

  $("#header-as-of").textContent = D.meta.as_of;
  $("#header-company-count").textContent = D.meta.company_count;
  setupTabs();
  setupGuidance();
  setupCompanies();
  setupMines();
})();
