(() => {
  const state = {
    cfg: null,
    meta: null,
    allRows: [],
    filtered: [],
    q: "",
    prov: "",
    city: "",
    region: "",
    dynasty: "",
    fzType: "",
    sort: "default",
    page: 1,
    pageSize: 28,
    bag: new Map(), // skuNum -> record
    lastOrderText: "",
    tradDict: new Map(),
  };

  const VARIANT_MAP = {
    湻: "淳",
    颖: "颍",
    邱: "丘",
    鉅: "巨",
    钜: "巨",
    濬: "浚",
    霑: "沾",
    榖: "谷",
    澂: "澄",
    蘄: "蕲",
    崑: "昆",
    鄠: "户",
    嫰: "嫩",
    槁: "藁",
    锺: "钟",
    裡: "里",
    峯: "峰",
    谿: "溪",
    餘: "余",
    馀: "余",
  };

  const $ = (id) => document.getElementById(id);

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtSku(num) {
    return "FZ-" + String(num).padStart(5, "0");
  }

  function normSearchText(str) {
    let s = String(str || "").trim().toLowerCase();
    s = s.replace(/盩厔/g, "周至");
    let out = "";
    for (const ch of s) {
      const c1 = state.tradDict.get(ch) || ch;
      out += VARIANT_MAP[c1] || c1;
    }
    return out;
  }

  async function copyStr(str) {
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function getItemPrice(r) {
    if (r[10] && r[10] > 0) return r[10];
    return Number(state.cfg?.default_price || 9.9);
  }

  function calcBagTotal() {
    const items = Array.from(state.bag.values());
    const defP = Number(state.cfg?.default_price || 9.9);
    let stdCount = 0;
    let customSum = 0;
    for (const r of items) {
      const p = getItemPrice(r);
      if (Math.abs(p - defP) < 0.01 && Math.abs(defP - 9.9) < 0.01) {
        stdCount += 1;
      } else {
        customSum += p;
      }
    }
    const bundleGroups = Math.floor(stdCount / 3);
    const rem = stdCount % 3;
    const total = bundleGroups * 25 + rem * defP + customSum;
    return Math.round(total * 100) / 100;
  }

  function stampForType(typeName) {
    if (typeName.includes("省志") || typeName.includes("通志")) return { txt: "通志", cls: "stamp-tong" };
    if (typeName.includes("府志") || typeName.includes("州厅")) return { txt: "府州", cls: "stamp-fu" };
    if (typeName.includes("乡土")) return { txt: "乡土", cls: "" };
    if (typeName.includes("合订")) return { txt: "合订", cls: "stamp-fu" };
    if (typeName.includes("专志") || typeName.includes("山水")) return { txt: "专志", cls: "" };
    return { txt: "县志", cls: "" };
  }

  function applyFilters(resetPage = true) {
    if (resetPage) state.page = 1;
    const provs = state.meta.provinces;
    const dyns = state.meta.dynasties;
    const types = state.meta.types;

    const qNorm = normSearchText(state.q);
    const tokens = qNorm ? qNorm.split(/[\s,，、·/]+/).filter(Boolean) : [];

    const out = [];
    for (const r of state.allRows) {
      const pName = provs[r[2]]?.name || "";
      const dName = dyns[r[5]]?.name || "";
      const tName = types[r[6]]?.name || "";

      if (state.prov && pName !== state.prov) continue;
      if (state.city && r[14] !== state.city) continue;
      if (state.region && r[3] !== state.region) continue;
      if (state.dynasty && dName !== state.dynasty) continue;
      if (state.fzType && tName !== state.fzType) continue;

      if (tokens.length) {
        const hay = r._normHay;
        let ok = true;
        for (const tk of tokens) {
          if (!hay.includes(tk)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      out.push(r);
    }

    if (state.sort === "files_desc") {
      out.sort((a, b) => b[8] - a[8] || b[12] - a[12]);
    } else if (state.sort === "size_desc") {
      out.sort((a, b) => b[12] - a[12]);
    } else if (state.sort === "title_asc") {
      out.sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
    }

    state.filtered = out;
    syncUrlParams();
    renderProvPills();
    renderRegionFacets();
    renderProvLore();
    renderBooks();
    updateResetVisibility();
  }

  function updateResetVisibility() {
    const hasAny = Boolean(state.q || state.prov || state.city || state.region || state.dynasty || state.fzType);
    $("resetBtn").style.display = hasAny ? "inline-block" : "none";
    $("clearAllFilterBtn").style.display = hasAny ? "inline-flex" : "none";
  }

  function syncUrlParams() {
    const sp = new URLSearchParams();
    if (state.prov) sp.set("prov", state.prov);
    if (state.city) sp.set("city", state.city);
    if (state.region) sp.set("region", state.region);
    if (state.dynasty) sp.set("era", state.dynasty);
    if (state.fzType) sp.set("type", state.fzType);
    if (state.q) sp.set("q", state.q);
    const qs = sp.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState(null, "", newUrl);
  }

  function renderProvPills() {
    const box = $("provPills");
    box.innerHTML = state.meta.provinces
      .map((p) => {
        const active = state.prov === p.name ? "active" : "";
        return `<button type="button" class="pill-btn ${active}" data-prov="${esc(p.name)}">
          <span>${esc(p.name)}</span><small>${p.count}</small>
        </button>`;
      })
      .join("");
  }

  function renderRegionFacets() {
    const wrap = $("regionFacetWrap");
    const box = $("regionPills");
    const selCity = $("selCity");
    if (!state.prov) {
      wrap.style.display = "none";
      selCity.innerHTML = '<option value="">不限地市</option>';
      return;
    }
    const provIdx = state.meta.provinces.findIndex((p) => p.name === state.prov);
    const cityCnt = new Map();
    const countyCnt = new Map();
    for (const r of state.allRows) {
      if (r[2] !== provIdx) continue;
      if (r[14]) cityCnt.set(r[14], (cityCnt.get(r[14]) || 0) + 1);
      if (state.city && r[14] === state.city && r[15]) countyCnt.set(r[3], (countyCnt.get(r[3]) || 0) + 1);
    }
    const cities = Array.from(cityCnt.entries()).sort((a, b) => b[1] - a[1]);
    selCity.innerHTML =
      '<option value="">不限地市</option>' +
      cities.map(([c, n]) => `<option value="${esc(c)}" ${state.city === c ? "selected" : ""}>${esc(c)} (${n})</option>`).join("");

    if (!cities.length) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "flex";
    let html =
      `<button type="button" class="pill-btn ${!state.city ? "active" : ""}" data-city="">全部${esc(state.prov)}</button>` +
      cities
        .slice(0, 30)
        .map(([c, n]) => `<button type="button" class="pill-btn ${state.city === c ? "active" : ""}" data-city="${esc(c)}"><span>${esc(c)}</span><small>${n}</small></button>`)
        .join("");
    if (state.city && countyCnt.size) {
      html +=
        `<span style="flex-basis:100%;height:0;"></span><span class="sub-facet-lbl">${esc(state.city)}下辖：</span>` +
        `<button type="button" class="pill-btn ${!state.region ? "active" : ""}" data-region="">全部</button>` +
        Array.from(countyCnt.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([reg, n]) => `<button type="button" class="pill-btn ${state.region === reg ? "active" : ""}" data-region="${esc(reg)}"><span>${esc(reg.replace(/^.*· /, ""))}</span><small>${n}</small></button>`)
          .join("");
    }
    box.innerHTML = html;
  }

  function renderProvLore() {
    const box = $("provLoreBox");
    if (!state.prov || !state.meta.prov_lore?.[state.prov]) {
      box.style.display = "none";
      return;
    }
    const lore = state.meta.prov_lore[state.prov];
    const pObj = state.meta.provinces.find((x) => x.name === state.prov);
    const cnt = pObj ? pObj.count : state.filtered.length;
    box.style.display = "block";
    box.innerHTML = `
      <div class="lore-badge-row">
        <div class="lore-big-seal">${esc(state.prov.slice(0, 2))}</div>
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--cinnabar);font-weight:700;">${esc(lore.alias || "历代地方志馆藏")} · 本省实藏现货 ${cnt} 部</div>
          <h2 style="font-size:18px;margin:2px 0 4px;">${esc(state.prov)}古籍方志馆藏导览</h2>
          <p style="font-size:13px;color:var(--ink-mid);">${esc(lore.intro)}</p>
        </div>
      </div>
      <div class="lore-meta-grid">
        <div><strong>📚 代表名志：</strong>${esc(lore.highlights)}</div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
          ${lore.slug ? `<a href="${esc(lore.slug)}" class="ghost-btn" style="text-decoration:none;">进入${esc(state.prov)}独立目录页 →</a>` : ""}
          <button type="button" class="btn-wx" id="provBundleBtn" data-prov-bundle="${esc(state.prov)}">
            📦 微信咨询【${esc(state.prov)}】同县/全省方志打包优惠
          </button>
        </div>
      </div>
    `;
  }

  function renderBooks() {
    const total = state.filtered.length;
    const conds = [];
    if (state.prov) conds.push(state.prov);
    if (state.city) conds.push(state.city);
    if (state.region) conds.push(state.region.replace(/^.*· /, ""));
    if (state.dynasty) conds.push(state.dynasty);
    if (state.fzType) conds.push(state.fzType);
    if (state.q) conds.push(`“${state.q}”`);

    const prefix = conds.length ? `当前筛选（${conds.join(" · ")}）：` : "全馆现货目录：";
    $("resultStatus").innerHTML = `${prefix}共找到 <strong style="color:var(--cinnabar);">${total.toLocaleString()}</strong> 部古籍方志现货`;

    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    $("pageLabel").textContent = `第 ${state.page} / ${totalPages} 页`;
    $("prevBtn").disabled = state.page <= 1;
    $("nextBtn").disabled = state.page >= totalPages;

    const grid = $("bookGrid");
    if (!total) {
      grid.innerHTML = `
        <div class="box-card" style="grid-column:1/-1;text-align:center;padding:36px 20px;">
          <h3 style="font-size:16px;margin-bottom:6px;">暂未匹配到完全一致的书目名称</h3>
          <p style="font-size:13px;color:var(--ink-mid);margin-bottom:14px;">
            提示：许多县在清代或民国使用旧称（如阳新=兴国州、辛集=束鹿、周至=盩厔），或收录于上级《府志》《通志》中。建议点选【所属省份】浏览全目录，或直接加微信由掌柜为您核查库存！
          </p>
          <button type="button" class="btn-wx" id="emptyAskWxBtn">💬 发县名给掌柜微信帮查</button>
        </div>
      `;
      return;
    }

    const start = (state.page - 1) * state.pageSize;
    const slice = state.filtered.slice(start, start + state.pageSize);
    const provs = state.meta.provinces;
    const types = state.meta.types;
    const fmts = state.meta.formats;
    const showPrice = state.cfg?.show_price !== false;

    grid.innerHTML = slice
      .map((r) => {
        const sku = fmtSku(r[0]);
        const title = r[1];
        const pName = provs[r[2]]?.name || "";
        const reg = r[3];
        const loc = reg && reg !== pName ? `${pName} · ${reg}` : pName;
        const era = r[4];
        const tName = types[r[6]]?.name || "方志";
        const fmt = fmts[r[7]]?.name || "PDF";
        const fc = r[8];
        const sz = r[9];
        const note = r[11];
        const price = getItemPrice(r);
        const st = stampForType(tName);
        const inBag = state.bag.has(r[0]);

        const badges = [];
        if (loc) badges.push(`<span class="b-tag loc">📍 ${esc(loc)}</span>`);
        if (era) badges.push(`<span class="b-tag era">${esc(era)}</span>`);
        badges.push(`<span class="b-tag">${esc(tName)}</span>`);
        badges.push(`<span class="b-tag">📄 ${esc(fmt)} · ${fc}册/件 (${esc(sz)})</span>`);
        if (note) badges.push(`<span class="b-tag">${esc(note)}</span>`);

        return `<article class="book-card">
          <div class="card-top">
            <div class="type-stamp ${st.cls}">${esc(st.txt)}</div>
            <div class="book-main">
              <div class="book-sku">馆藏编号 ${esc(sku)}</div>
              <h3 class="book-name">${esc(title)}</h3>
              <div class="book-badges">${badges.join("")}</div>
            </div>
          </div>
          <div class="card-foot">
            <div class="price-wrap">
              ${showPrice ? `<span class="price-now">¥${price}</span><span class="price-old">¥39</span>` : `<span style="font-size:12.5px;color:var(--indigo);font-weight:600;">百度网盘高清现货</span>`}
            </div>
            <div class="card-btns">
              <button type="button" class="btn-bag ${inBag ? "in-bag" : ""}" data-bag-sku="${r[0]}">
                ${inBag ? "✓ 已选" : "+ 选书"}
              </button>
              <button type="button" class="btn-wx" data-buy-sku="${r[0]}">💬 微信获取</button>
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderBagBar() {
    const cnt = state.bag.size;
    const bar = $("bagBar");
    if (!cnt) {
      bar.classList.remove("visible");
      return;
    }
    bar.classList.add("visible");
    $("bagCount").textContent = String(cnt);
    $("bagPrice").textContent = `¥${calcBagTotal()}`;
  }

  async function openWechatModal(orderText) {
    state.lastOrderText = orderText;
    await copyStr(orderText);

    const wx = state.cfg?.wechat || {};
    const mode = wx.mode || "both";
    const kfUrl = (wx.kf_url || "").trim();

    $("wxOrderPreview").textContent = orderText;
    $("wxIdText").textContent = wx.wechat_id || "请配置微信号";
    $("wxQrImg").src = wx.qr_image || "./assets/wechat-qr.svg";
    $("wxWorkTime").textContent = wx.work_time || "每日 08:30 - 23:30 极速响应发货";
    $("wxCopiedBanner").textContent =
      "✅ 已自动复制您选中的方志编号与书名！打开微信直接「粘贴」发送给掌柜即可秒发网盘链接。";

    const kfBtn = $("wxKfDirectBtn");
    const pBlock = $("wxPersonalBlock");
    if (kfUrl && (mode === "both" || mode === "kf")) {
      kfBtn.style.display = "flex";
      kfBtn.href = kfUrl;
      kfBtn.textContent = wx.kf_button_text || "🚀 一键跳转微信在线客服窗口（直接粘贴发送）";
    } else {
      kfBtn.style.display = "none";
    }
    pBlock.style.display = mode === "kf" && kfUrl ? "none" : "block";
    $("wxBackdrop").classList.add("open");
  }

  function buildSingleOrderMsg(r) {
    const sku = fmtSku(r[0]);
    const pName = state.meta.provinces[r[2]]?.name || "";
    const loc = r[3] && r[3] !== pName ? `${pName}·${r[3]}` : pName;
    const fmt = state.meta.formats[r[7]]?.name || "PDF";
    const price = getItemPrice(r);
    const pricePart = state.cfg?.show_price !== false ? `（¥${price}）` : "";
    return (
      `您好！我想在方志馆获取这部古籍地方志${pricePart}：\n` +
      `📖 【${sku}】《${r[1]}》\n` +
      `📍 地区：${loc} ｜ 规格：${fmt}（${r[8]}册/件，${r[9]}）`
    );
  }

  function buildBagOrderMsg() {
    const list = Array.from(state.bag.values());
    const lines = list.map((r, i) => `${i + 1}. 【${fmtSku(r[0])}】《${r[1]}》（${r[9]}）`);
    const total = calcBagTotal();
    return (
      `您好！我在古籍方志馆选好了以下 ${list.length} 部方志（组合价 ¥${total}）：\n` +
      lines.join("\n") +
      `\n请发百度网盘链接，谢谢！`
    );
  }

  async function init() {
    const [cfgRes, metaRes, rowsRes] = await Promise.all([
      fetch("./site-config.json?t=" + Date.now()),
      fetch("./data/meta.json"),
      fetch("./data/all_compact.json"),
    ]);

    state.cfg = await cfgRes.json();
    state.meta = await metaRes.json();
    state.allRows = await rowsRes.json();

    // 初始化简繁映射字典
    if (Array.isArray(state.meta.trad_map) && state.meta.trad_map.length === 2) {
      const [tStr, sStr] = state.meta.trad_map;
      for (let i = 0; i < tStr.length; i++) {
        state.tradDict.set(tStr[i], sStr[i]);
      }
    }

    // 应用站点配置文案
    if (state.cfg.site_title) {
      document.title = `${state.cfg.site_title} — 全国历代省志·府志·州志·县志·乡土志PDF总库`;
      $("siteTitle").textContent = state.cfg.site_title;
      $("navBrandText").textContent = state.cfg.site_title;
    }
    if (state.cfg.site_subtitle) $("siteSubtitle").textContent = state.cfg.site_subtitle;
    if (state.cfg.bundle_tip) $("footerBundleTip").textContent = state.cfg.bundle_tip;

    // 预构建每条记录的高速搜索串（含编号、书名、省份、地区、朝代、体裁、合订子书名）
    const provs = state.meta.provinces;
    const dyns = state.meta.dynasties;
    const types = state.meta.types;
    const rowMap = new Map();

    for (const r of state.allRows) {
      const sku = fmtSku(r[0]);
      const pName = provs[r[2]]?.name || "";
      const dName = dyns[r[5]]?.name || "";
      const tName = types[r[6]]?.name || "";
      r._normHay = normSearchText(`${sku} ${r[0]} ${r[1]} ${pName} ${r[3]} ${r[4]} ${dName} ${tName} ${r[11]} ${r[13] || ""}`);
      rowMap.set(r[0], r);
    }

    // 填充下拉框
    $("selProv").innerHTML =
      `<option value="">全国省份 (${state.meta.total_works})</option>` +
      provs.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (${p.count})</option>`).join("");

    $("selDynasty").innerHTML =
      `<option value="">全部朝代</option>` +
      dyns.map((d) => `<option value="${esc(d.name)}">${esc(d.name)} (${d.count})</option>`).join("");

    $("selType").innerHTML =
      `<option value="">全部体裁</option>` +
      types.map((t) => `<option value="${esc(t.name)}">${esc(t.name)} (${t.count})</option>`).join("");

    // 填充底部 32 省静态专页直达链接与首页 6 篇专栏文章
    $("footerProvLinks").innerHTML = provs
      .filter((p) => p.slug)
      .map(
        (p) =>
          `<a class="pill-btn" href="${esc(p.slug)}"><span>${esc(p.name)}方志</span><small>${p.count}部</small></a>`
      )
      .join("");

    $("homeArticlesGrid").innerHTML = (state.meta.articles || [])
      .map(
        (a) => `<a class="topic-card" href="./articles/${esc(a.slug)}">
          <span class="topic-tag">${esc(a.tag)}</span>
          <h3>${esc(a.title)}</h3>
          <p>${esc(a.summary)}</p>
        </a>`
      )
      .join("");

    // 读取 URL 初始参数（支持分享专属省县链接）
    const sp = new URLSearchParams(window.location.search);
    state.prov = sp.get("prov") || "";
    state.city = sp.get("city") || "";
    state.region = sp.get("region") || "";
    state.dynasty = sp.get("era") || "";
    state.fzType = sp.get("type") || "";
    state.q = sp.get("q") || "";

    $("kwInput").value = state.q;
    $("selProv").value = state.prov;
    $("selDynasty").value = state.dynasty;
    $("selType").value = state.fzType;

    applyFilters(true);

    // 绑定交互事件
    $("searchBtn").onclick = () => {
      state.q = $("kwInput").value.trim();
      applyFilters(true);
    };
    $("kwInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        state.q = $("kwInput").value.trim();
        applyFilters(true);
      }
    });
    $("selCity").onchange = (e) => {
      state.city = e.target.value;
      state.region = "";
      applyFilters(true);
    };
    $("selProv").onchange = (e) => {
      state.prov = e.target.value;
      state.city = "";
      state.region = "";
      applyFilters(true);
    };
    $("selDynasty").onchange = (e) => {
      state.dynasty = e.target.value;
      applyFilters(true);
    };
    $("selType").onchange = (e) => {
      state.fzType = e.target.value;
      applyFilters(true);
    };
    $("sortSelect").onchange = (e) => {
      state.sort = e.target.value;
      applyFilters(true);
    };

    const resetAll = () => {
      state.q = "";
      state.prov = "";
      state.city = "";
      state.region = "";
      state.dynasty = "";
      state.fzType = "";
      $("kwInput").value = "";
      $("selProv").value = "";
      $("selDynasty").value = "";
      $("selType").value = "";
      applyFilters(true);
    };
    $("resetBtn").onclick = resetAll;
    $("clearAllFilterBtn").onclick = resetAll;

    document.querySelector(".hot-queries").addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      resetAll();
      if (a.dataset.hotQ) {
        state.q = a.dataset.hotQ;
        $("kwInput").value = state.q;
      } else if (a.dataset.hotEra) {
        state.dynasty = a.dataset.hotEra;
        $("selDynasty").value = state.dynasty;
      }
      applyFilters(true);
    });

    $("provPills").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-prov]");
      if (!btn) return;
      const p = btn.dataset.prov;
      state.prov = state.prov === p ? "" : p;
      state.city = "";
      state.region = "";
      $("selProv").value = state.prov;
      applyFilters(true);
    });

    $("regionPills").addEventListener("click", (e) => {
      const cbtn = e.target.closest("[data-city]");
      if (cbtn) {
        state.city = cbtn.dataset.city;
        state.region = "";
        applyFilters(true);
        return;
      }
      const btn = e.target.closest("[data-region]");
      if (!btn) return;
      state.region = btn.dataset.region;
      applyFilters(true);
    });

    $("prevBtn").onclick = () => {
      if (state.page > 1) {
        state.page -= 1;
        renderBooks();
        window.scrollTo({ top: $("bookGrid").offsetTop - 90, behavior: "smooth" });
      }
    };
    $("nextBtn").onclick = () => {
      state.page += 1;
      renderBooks();
      window.scrollTo({ top: $("bookGrid").offsetTop - 90, behavior: "smooth" });
    };

    $("shareLinkBtn").onclick = async () => {
      await copyStr(window.location.href);
      const btn = $("shareLinkBtn");
      const old = btn.textContent;
      btn.textContent = "✅ 已复制专属链接！";
      setTimeout(() => (btn.textContent = old), 2000);
    };

    document.body.addEventListener("click", (e) => {
      const buyBtn = e.target.closest("[data-buy-sku]");
      if (buyBtn) {
        const r = rowMap.get(Number(buyBtn.dataset.buySku));
        if (r) openWechatModal(buildSingleOrderMsg(r));
        return;
      }
      const bagBtn = e.target.closest("[data-bag-sku]");
      if (bagBtn) {
        const skuNum = Number(bagBtn.dataset.bagSku);
        const r = rowMap.get(skuNum);
        if (!r) return;
        if (state.bag.has(skuNum)) state.bag.delete(skuNum);
        else state.bag.set(skuNum, r);
        renderBooks();
        renderBagBar();
        return;
      }
      const provBundle = e.target.closest("[data-prov-bundle]");
      if (provBundle) {
        const pv = provBundle.dataset.provBundle;
        const regStr = state.city ? `·${state.city}${state.region ? state.region.replace(/^.*(?=·)/, "") : ""}` : "";
        openWechatModal(`您好！我想咨询【${pv}${regStr}】历代古籍地方志多本 / 全套打包特惠价格。`);
        return;
      }
      if (e.target.id === "emptyAskWxBtn") {
        openWechatModal(
          `您好！我想查找关于「${state.prov || ""}${state.q ? " " + state.q : ""}」的古籍县志/府志，请帮我核查馆藏现货。`
        );
      }
    });

    $("bundleAskBtn").onclick = () => {
      const target = state.prov ? `【${state.prov}${state.city ? "·" + state.city : ""}】` : "同县历代旧志 / 整省";
      openWechatModal(`您好！我想咨询${target}古籍方志电子书批量打包特惠方案。`);
    };
    $("fabWechatBtn").onclick = () => {
      if (state.bag.size > 0) openWechatModal(buildBagOrderMsg());
      else openWechatModal("您好！我想在古籍方志馆咨询调阅地方志电子书及打包优惠。");
    };
    $("clearBagBtn").onclick = () => {
      state.bag.clear();
      renderBooks();
      renderBagBar();
    };
    $("checkoutBagBtn").onclick = () => {
      if (state.bag.size > 0) openWechatModal(buildBagOrderMsg());
    };

    $("closeWxModalBtn").onclick = () => $("wxBackdrop").classList.remove("open");
    $("wxBackdrop").onclick = (e) => {
      if (e.target.id === "wxBackdrop") $("wxBackdrop").classList.remove("open");
    };
    $("copyWxIdOnlyBtn").onclick = async () => {
      const wid = state.cfg?.wechat?.wechat_id || "";
      await copyStr(wid);
      $("wxCopiedBanner").textContent = `✅ 已复制微信号「${wid}」！请打开微信添加好友粘贴。`;
    };
    $("openWeixinAppBtn").onclick = async () => {
      const wid = state.cfg?.wechat?.wechat_id || "";
      await copyStr(wid);
      $("wxCopiedBanner").textContent = `✅ 已复制微信号「${wid}」，正在唤起打开微信 App…`;
      window.location.href = "weixin://";
    };
    $("copyInquiryAgainBtn").onclick = async () => {
      await copyStr(state.lastOrderText);
      $("wxCopiedBanner").textContent = "✅ 已重新复制方志编号与书名！直接去微信粘贴发送即可。";
    };
  }

  init();
})();
