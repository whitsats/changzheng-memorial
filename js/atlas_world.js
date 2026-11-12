/**
 * 域外大事小地图（World Events Inset）
 * 主图取景只有 66—142°E / 14—55°N，莫斯科、柏林、巴黎、华盛顿等地落在框外，
 * 这里用一张北半球示意小地图承载这些地点：真实经纬度落点、随年份点亮，
 * 悬停看地名，点红点看该城条目。以 mixin 形式挂到 HistoricalAtlasController。
 */
(function () {
  'use strict';

  let HistoricalAtlasController = null;

  // 小地图经纬范围与画布尺寸（SVG 用户单位）
  const BOX = { w: -170, e: 145, s: 0, n: 75 };
  const VIEW_W = 316;
  const VIEW_H = 120;
  const DEG = Math.PI / 180;
  const PIN_GAP = 9;

  const CITY_EN = {
    彼得格勒: 'Petrograd',
    巴黎: 'Paris',
    莫斯科: 'Moscow',
    华盛顿: 'Washington',
    纽约: 'New York',
    柏林: 'Berlin',
    慕尼黑: 'Munich',
    华沙: 'Warsaw',
    檀香山: 'Honolulu',
    开罗: 'Cairo',
    雅尔塔: 'Yalta',
    旧金山: 'San Francisco',
    波茨坦: 'Potsdam',
  };

  const TEXT = {
    zh: {
      title: '域外大事',
      frame: '主图范围',
      hint: '悬停看地名 · 点红点看条目',
      count: (n, c) => `${n} 条 · ${c} 城`,
      city: (n) => `域外 · ${n} 条`,
      close: '关闭',
      overview: '影响一览',
      ovTitle: '外部力量 → 国内形势',
      ovSub: (n) => `${n} 条域外大事`,
      impact: '对国内的影响',
      links: '国内对应',
    },
    en: {
      title: 'World Events',
      frame: 'Main map',
      hint: 'Hover for place · click a dot for entries',
      count: (n, c) => `${n} events · ${c} cities`,
      city: (n) => `${n} entries`,
      close: 'Close',
      overview: 'Impacts',
      ovTitle: 'Outside forces → China',
      ovSub: (n) => `${n} world events`,
      impact: 'Impact in China',
      links: 'In China',
    },
  };

  // 「影响一览」按外部力量分组，顺序固定
  const ACTOR_ORDER = ['共产国际', '苏联', '日本', '英美', '德意', '世界'];

  const mercY = (lat) => Math.log(Math.tan(Math.PI * 0.25 + (lat * DEG) * 0.5));

  const spanLng = BOX.e - BOX.w;
  const spanMerc = (mercY(BOX.n) - mercY(BOX.s)) / DEG;
  const SCALE = Math.min(VIEW_W / spanLng, VIEW_H / spanMerc);
  const PAD_X = (VIEW_W - spanLng * SCALE) / 2;
  const PAD_Y = (VIEW_H - spanMerc * SCALE) / 2;

  function project(lng, lat) {
    return [
      (lng - BOX.w) * SCALE + PAD_X,
      ((mercY(BOX.n) - mercY(lat)) / DEG) * SCALE + PAD_Y,
    ];
  }

  const svgEl = (name, attrs, parent) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) {
      for (const k in attrs) node.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(node);
    return node;
  };

  const pathOf = (ring, close) =>
    ring
      .map(([lng, lat], i) => {
        const [x, y] = project(lng, lat);
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join('') + (close ? 'Z' : '');

  const monthOf = (headline) => {
    const hit = String(headline || '').match(/（(\d+)(?:[—-]\d+)?月）\s*$/);
    return hit ? String(Number(hit[1])).padStart(2, '0') : '';
  };

  const stripMonth = (headline) =>
    String(headline || '').replace(/（\d+(?:[—-]\d+)?月）\s*$/, '');

  function isOffFrame(coord, bounds) {
    if (!coord) return false;
    const [lng, lat] = coord;
    return lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north;
  }

  function textWidth(str) {
    let w = 0;
    for (const ch of String(str)) w += /[^\x00-\xff]/.test(ch) ? 9 : 4.9;
    return w;
  }

  class WorldInset {
    constructor(app) {
      this.app = app;
      this.built = false;
      this.groups = [];
      this.pins = [];
      this.activeSite = null;
      this.mode = null;
      this._build();
    }

    t() {
      return TEXT[this.app.locale === 'en' ? 'en' : 'zh'];
    }

    cityName(site) {
      return this.app.locale === 'en' ? CITY_EN[site] || site : site;
    }

    _build() {
      const frame = document.getElementById('viewport-frame');
      if (!frame) return;
      const bounds = (this.app.projector && this.app.projector.bounds) || {
        west: 66,
        east: 142,
        south: 14,
        north: 55,
      };
      this.bounds = bounds;
      window.__wiFrame = bounds;

      const roc = (this.app.dynasties || []).find((d) => d.key === 'roc');
      if (!roc) return;

      const groups = new Map();
      (roc.milestones || []).forEach((m) => {
        if (!isOffFrame(m.coord, bounds)) return;
        let g = groups.get(m.site);
        if (!g) {
          g = { site: m.site, coord: m.coord, events: [] };
          groups.set(m.site, g);
        }
        g.events.push(m);
      });
      this.groups = Array.from(groups.values())
        .map((g) => {
          g.events.sort((a, b) => a.year - b.year);
          return g;
        })
        .sort((a, b) => a.coord[0] - b.coord[0]);
      if (!this.groups.length) return;

      const sec = document.createElement('section');
      sec.id = 'world-inset';
      sec.className = 'world-inset';
      sec.setAttribute('aria-label', '域外大事小地图');
      sec.innerHTML =
        '<button class="wi-head" type="button" aria-expanded="true">' +
        '<span class="wi-title"></span><span class="wi-count"></span><span class="wi-chevron">▾</span>' +
        '</button>' +
        '<div class="wi-map"><svg class="wi-svg" viewBox="0 0 ' +
        VIEW_W +
        ' ' +
        VIEW_H +
        '" role="img" aria-label="域外大事小地图"></svg>' +
        '<div class="wi-tip is-hidden"></div></div>' +
        '<div class="wi-card is-hidden" role="dialog"></div>' +
        '<div class="wi-hint"><span class="wi-hint-text"></span>' +
        '<button class="wi-ov-btn" type="button"></button></div>';

      // 卡片内容每次重绘，事件委托挂在卡片本身
      const cardEl = sec.querySelector('.wi-card');
      cardEl.addEventListener('click', (ev) => {
        try {
          this._onCardClick(ev);
        } catch (err) {
          console.warn('[world-inset] card click', err);
        }
      });

      const ovBtn = sec.querySelector('.wi-ov-btn');
      if (ovBtn) {
        ovBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (this.mode === 'ov') this.closeCard();
          else this.openOverview();
        });
      }

      const svg = sec.querySelector('.wi-svg');
      svgEl(
        'rect',
        { class: 'wi-ocean', x: 0, y: 0, width: VIEW_W, height: VIEW_H, rx: 2 },
        svg
      );
      const gLand = svgEl('g', { class: 'wi-land' }, svg);
      (window.WORLD_LAND || []).forEach((ring) => {
        svgEl('path', { d: pathOf(ring, true) }, gLand);
      });
      const gBorders = svgEl('g', { class: 'wi-borders' }, svg);
      (window.WORLD_BORDERS || []).forEach((line) => {
        svgEl('path', { d: pathOf(line, false) }, gBorders);
      });

      // 主图（时间轴地图）实际取景范围，用来交代这些红点为什么不在主图上
      const [fx0, fy0] = project(bounds.west, bounds.north);
      const [fx1, fy1] = project(bounds.east, bounds.south);
      this.frameRect = {
        x: fx0,
        y: fy0,
        w: Math.max(2, fx1 - fx0),
        h: Math.max(2, fy1 - fy0),
      };
      const gFrame = svgEl('g', { class: 'wi-frame-group' }, svg);
      svgEl(
        'rect',
        {
          class: 'wi-frame',
          x: fx0.toFixed(1),
          y: fy0.toFixed(1),
          width: this.frameRect.w.toFixed(1),
          height: this.frameRect.h.toFixed(1),
          rx: 2,
        },
        gFrame
      );
      this.frameLabel = svgEl(
        'text',
        { class: 'wi-frame-label', x: fx0.toFixed(1), y: (fy1 + 9).toFixed(1) },
        gFrame
      );

      const gPins = svgEl('g', { class: 'wi-pins' }, svg);
      const placed = [];
      this.pins = this.groups.map((g) => {
        const [tx, ty] = project(g.coord[0], g.coord[1]);
        const candidates = [
          [0, 0], [0, -9], [-10, -4], [10, -4], [0, 9], [-11, -10], [11, -10],
          [-11, 9], [11, 9], [0, -17], [0, 17], [-16, 0], [16, 0],
        ];
        let pos = [tx, ty];
        for (const [dx, dy] of candidates) {
          const cand = [tx + dx, ty + dy];
          if (cand[0] < 3 || cand[0] > VIEW_W - 3 || cand[1] < 4 || cand[1] > VIEW_H - 4) continue;
          if (placed.every((p) => Math.hypot(p[0] - cand[0], p[1] - cand[1]) >= PIN_GAP)) {
            pos = cand;
            break;
          }
        }
        placed.push(pos);

        const node = svgEl(
          'g',
          {
            class: 'wi-pin',
            'data-site': g.site,
            tabindex: '0',
            role: 'button',
            transform: `translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)})`,
          },
          gPins
        );
        if (Math.hypot(pos[0] - tx, pos[1] - ty) > 1.2) {
          svgEl(
            'line',
            {
              class: 'wi-leader',
              x1: (tx - pos[0]).toFixed(1),
              y1: (ty - pos[1]).toFixed(1),
              x2: '0',
              y2: '0',
            },
            node
          );
        }
        svgEl('circle', { class: 'wi-pin-halo', r: 7.5 }, node);
        svgEl('circle', { class: 'wi-pin-dot', r: 3 }, node);
        const label = svgEl('text', { class: 'wi-pin-name', x: 5.5, y: 3 }, node);

        node.addEventListener('mouseenter', () => this._showTip(g));
        node.addEventListener('mouseleave', () => this._hideTip());
        node.addEventListener('focus', () => this._showTip(g));
        node.addEventListener('blur', () => this._hideTip());
        node.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.openCity(g.site);
        });
        node.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            this.openCity(g.site);
          }
        });
        return { g, node, label, x: pos[0], y: pos[1] };
      });

      frame.appendChild(sec);
      this.el = sec;
      this.svg = svg;
      this.labelLayer = gFrame;
      this.tip = sec.querySelector('.wi-tip');
      this.card = sec.querySelector('.wi-card');
      this.built = true;

      const head = sec.querySelector('.wi-head');
      head.addEventListener('click', () => {
        const collapsed = sec.classList.toggle('is-collapsed');
        head.setAttribute('aria-expanded', String(!collapsed));
        head.querySelector('.wi-chevron').textContent = collapsed ? '▸' : '▾';
        if (collapsed) this._hideTip();
      });

      document.addEventListener('click', () => this._hideTip());
      this._applyLabels();
      this.sync();
    }

    // 标签只在放得下的地方常显，其余靠悬停；地名彼此、地名与点都不压字
    _layoutLabels() {
      const blocks = this.pins.map((pin, i) => [pin.x - 4.5, pin.y - 4.5, pin.x + 4.5, pin.y + 4.5, i]);
      this.pins.forEach((pin) => (pin.label.textContent = this.cityName(pin.g.site)));
      const order = this.pins
        .map((pin, i) => ({ pin, i }))
        .sort((a, b) => (this.groups[b.i]?.events.length || 0) - (this.groups[a.i]?.events.length || 0));
      order.forEach(({ pin, i }) => {
        const label = pin.label;
        let w = 0;
        try {
          w = label.getComputedTextLength();
        } catch (err) {
          /* 未渲染时退回估算 */
        }
        if (!w) w = textWidth(label.textContent);
        const h = 9.5;
        const x = pin.x;
        const y = pin.y;
        const options = [
          { ax: x + 5.5, ay: y + 3, anchor: 'start' },
          { ax: x - 5.5, ay: y + 3, anchor: 'end' },
          { ax: x, ay: y - 6.5, anchor: 'middle' },
          { ax: x, ay: y + 10.5, anchor: 'middle' },
        ];
        let choice = null;
        for (const opt of options) {
          const x0 = opt.anchor === 'start' ? opt.ax : opt.anchor === 'end' ? opt.ax - w : opt.ax - w / 2;
          const x1 = x0 + w;
          const y0 = opt.ay - h;
          const y1 = opt.ay + 1;
          if (x0 < 1 || x1 > VIEW_W - 1 || y0 < 0 || y1 > VIEW_H) continue;
          const hit = blocks.some((r) => r[4] !== i && x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]);
          if (hit) continue;
          choice = opt;
          break;
        }
        if (choice) {
          // 标签在已 translate 的 pin 组里，写回相对偏移
          label.setAttribute('x', (choice.ax - x).toFixed(1));
          label.setAttribute('y', (choice.ay - y).toFixed(1));
          label.setAttribute('text-anchor', choice.anchor);
          const bw = choice.anchor === 'start' ? choice.ax : choice.anchor === 'end' ? choice.ax - w : choice.ax - w / 2;
          blocks.push([bw, choice.ay - h, bw + w, choice.ay + 1, i]);
        }
        label.classList.toggle('is-hidden', !choice);
      });
      return this.pins;
    }

    _applyLabels() {
      if (!this.built) return;
      const t = this.t();
      this.el.querySelector('.wi-title').textContent = t.title;
      this.el.querySelector('.wi-count').textContent = t.count(
        this.groups.reduce((n, g) => n + g.events.length, 0),
        this.groups.length
      );
      this.el.querySelector('.wi-hint-text').textContent = t.hint;
      this.el.querySelector('.wi-ov-btn').textContent = t.overview;
      this.frameLabel.textContent = t.frame;
      if (this.frameLabel.getBBox) {
        try {
          const box = this.frameLabel.getBBox();
          if (box.x + box.width > VIEW_W - 2) {
            this.frameLabel.setAttribute('text-anchor', 'end');
            this.frameLabel.setAttribute(
              'x',
              (this.frameRect.x + this.frameRect.w).toFixed(1)
            );
          }
        } catch (err) {
          /* getBBox 在隐藏时可能抛错，忽略 */
        }
      }
      this._layoutLabels();
      if (this.mode === 'ov') this.openOverview();
      else if (this.activeSite) this.openCity(this.activeSite, { keepScroll: true });
    }

    _showTip(g) {
      if (!this.built || !this.tip) return;
      const pin = this.pins.find((p) => p.g.site === g.site);
      if (!pin) return;
      this.tip.textContent = `${this.cityName(g.site)} · ${this.t().city(g.events.length)}`;
      this.tip.style.left = `${(pin.x / VIEW_W) * 100}%`;
      this.tip.style.top = `${(pin.y / VIEW_H) * 100}%`;
      this.tip.classList.remove('is-hidden');
      this.tip.classList.toggle('is-flipped', pin.x > VIEW_W * 0.6);
    }

    _hideTip() {
      if (this.tip) this.tip.classList.add('is-hidden');
    }

    // 域外事件展开后：这条外部大事怎样影响了国内形势，并给出可点的国内对应事件
    _impactHtml(e, esc) {
      if (!e.inf) return '';
      const t = this.t();
      return (
        '<div class="wi-impact">' +
        '<div class="wi-impact-head">' +
        `<span class="wi-actor">${esc(e.inf.actor)}</span>` +
        `<span class="wi-impact-label">${t.impact}</span>` +
        '</div>' +
        `<p class="wi-impact-text">${esc(e.inf.text)}</p>` +
        (e.inf.links && e.inf.links.length ? this._linksHtml(e.inf.links, esc) : '') +
        '</div>'
      );
    }

    _linksHtml(links, esc) {
      return (
        '<div class="wi-links">' +
        `<span class="wi-links-label">${this.t().links}</span>` +
        links
          .map(
            (l) =>
              '<button class="wi-link" type="button"' +
              ` data-year="${l.year}" data-headline="${esc(l.headline)}">` +
              `<span class="wi-link-when">${l.year}${monthOf(l.headline) ? '.' + monthOf(l.headline) : ''}</span>` +
              `<span class="wi-link-name">${esc(stripMonth(l.headline))}</span>` +
              (l.note ? `<span class="wi-link-note">${esc(l.note)}</span>` : '') +
              '</button>'
          )
          .join('') +
        '</div>'
      );
    }

    _onCardClick(ev) {
      const hit = ev.target.closest ? ev.target.closest('.wi-link, .wi-ov-ev') : null;
      if (!hit) return;
      const year = Number(hit.dataset.year);
      const headline = hit.dataset.headline || '';
      if (hit.classList.contains('wi-link')) {
        this._gotoMilestone(year, headline);
        return;
      }
      // 影响一览里的域外事件：能进小地图城卡的就地展开，否则直接跳到主图
      const g = this.groups.find((x) => x.site === hit.dataset.site);
      if (g) this.reveal({ site: g.site, coord: g.coord, year });
      else this._gotoMilestone(year, headline);
    }

    // 影响一览：按外部力量分组，一条外部大事配上它对国内形势的影响与可点线索
    _allInfluences() {
      const out = [];
      (this.app.dynasties || []).forEach((d) => {
        (d.milestones || []).forEach((m) => {
          if (m.inf && m.inf.text) out.push(m);
        });
      });
      return out.sort((a, b) => a.year - b.year);
    }

    openOverview() {
      if (!this.built) return;
      const all = this._allInfluences();
      if (!all.length) return;
      const esc = HistoricalAtlasController._escHtml || ((s) => s);
      const t = this.t();
      const year = this.app.year;
      const byActor = new Map();
      all.forEach((m) => {
        const a = m.inf.actor;
        if (!byActor.has(a)) byActor.set(a, []);
        byActor.get(a).push(m);
      });
      const order = ACTOR_ORDER.filter((a) => byActor.has(a)).concat(
        Array.from(byActor.keys()).filter((a) => ACTOR_ORDER.indexOf(a) < 0)
      );
      const body = order
        .map((actor) => {
          const items = byActor
            .get(actor)
            .map((m) => {
              const month = monthOf(m.headline);
              return (
                `<div class="wi-ov-item${m.year > year ? ' is-future' : ''}${m.year === year ? ' is-hit' : ''}" data-year="${m.year}" data-month="${month}">` +
                `<button class="wi-ov-ev" type="button" data-site="${esc(m.site || '')}"` +
                ` data-year="${m.year}" data-month="${month}" data-headline="${esc(m.headline)}">` +
                `<span class="wi-date">${m.year}${month ? '.' + month : ''}</span>` +
                `<span class="wi-row-title">${esc(stripMonth(m.headline))}</span>` +
                '</button>' +
                `<p class="wi-impact-text">${esc(m.inf.text)}</p>` +
                (m.inf.links && m.inf.links.length ? this._linksHtml(m.inf.links, esc) : '') +
                '</div>'
              );
            })
            .join('');
          return (
            `<div class="wi-ov-group"><div class="wi-ov-head">` +
            `<span class="wi-actor">${esc(actor)}</span>` +
            `<span class="wi-ov-n">${byActor.get(actor).length}</span>` +
            `</div>${items}</div>`
          );
        })
        .join('');
      this.mode = 'ov';
      this.activeSite = null;
      this.pins.forEach((p) => p.node.classList.remove('is-active'));
      this.card.classList.add('is-overview');
      this.card.innerHTML =
        '<div class="wi-card-head">' +
        `<span class="wi-card-title">${t.ovTitle}</span>` +
        `<span class="wi-card-sub">${t.ovSub(all.length)}</span>` +
        `<button class="wi-card-close" type="button" aria-label="${t.close}">×</button>` +
        '</div>' +
        `<div class="wi-card-body">${body}</div>`;
      this.card.classList.remove('is-hidden');
      this.card.querySelector('.wi-card-close').addEventListener('click', () => this.closeCard());
      this.expand();
    }

    // 点 chip 跳到国内（或后续）事件：与侧栏条目同一条路径，域外目标自然转成小地图城卡
    _gotoMilestone(year, headline) {
      const app = this.app;
      if (!app) return;
      const want = stripMonth(headline);
      let dynasty = null;
      let milestone = null;
      (app.dynasties || []).some((d) => {
        const hit = (d.milestones || []).find(
          (m) => m.year === year && stripMonth(m.headline) === want
        );
        if (!hit) return false;
        dynasty = d;
        milestone = hit;
        return true;
      });
      if (!milestone) return;
      try {
        app.stopAutoplay();
      } catch (err) {
        /* 自动播放可能未启动 */
      }
      this.closeCard();
      app.jumpToYear(milestone.year);
      app.openMilestoneBalloon(dynasty, milestone);
      if (typeof app._frameMilestoneAnchors === 'function') {
        app._frameMilestoneAnchors(dynasty, milestone, {
          isMapChange: Boolean(milestone.isMapChange),
        });
      }
    }

    openCity(site, opts = {}) {
      const g = this.groups.find((x) => x.site === site);
      if (!g || !this.built) return;
      this.activeSite = site;
      this.mode = 'city';
      if (this.card) this.card.classList.remove('is-overview');
      const year = this.app.year;
      const esc = HistoricalAtlasController._escHtml || ((s) => s);
      const rows = g.events
        .map((e) => {
          const month = monthOf(e.headline);
          return (
            `<button class="wi-row" type="button" data-year="${e.year}" data-month="${month}" aria-expanded="false">` +
            `<span class="wi-date">${e.year}${month ? '.' + month : ''}</span>` +
            `<span class="wi-row-title">${esc(stripMonth(e.headline))}</span>` +
            '</button>' +
            `<div class="wi-detail is-hidden">${esc(e.detail || '')}${e.source ? `<div class="wi-source">出处：${esc(e.source)}</div>` : ''}${this._impactHtml(e, esc)}</div>`
          );
        })
        .join('');
      this.card.innerHTML =
        '<div class="wi-card-head">' +
        `<span class="wi-card-title">${esc(this.cityName(site))}</span>` +
        `<span class="wi-card-sub">${this.t().city(g.events.length)}</span>` +
        `<button class="wi-card-close" type="button" aria-label="${this.t().close}">×</button>` +
        '</div>' +
        `<div class="wi-card-body">${rows}</div>`;
      this.card.classList.remove('is-hidden');
      this.card.querySelector('.wi-card-close').addEventListener('click', () => this.closeCard());
      const body = this.card.querySelector('.wi-card-body');
      const rowEls = body.querySelectorAll('.wi-row');
      g.events.forEach((e, i) => {
        const btn = rowEls[i];
        const detail = btn.nextElementSibling;
        btn.classList.toggle('is-future', e.year > year);
        btn.classList.toggle('is-hit', e.year === year);
        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') === 'true';
          rowEls.forEach((b) => b.setAttribute('aria-expanded', 'false'));
          body.querySelectorAll('.wi-detail').forEach((d) => d.classList.add('is-hidden'));
          btn.setAttribute('aria-expanded', String(!open));
          detail.classList.toggle('is-hidden', open);
        });
      });
      this.pins.forEach((p) => p.node.classList.toggle('is-active', p.g.site === site));
      if (!opts.keepScroll) body.scrollTop = 0;
    }

    expand() {
      if (!this.el || !this.el.classList.contains('is-collapsed')) return;
      this.el.classList.remove('is-collapsed');
      const head = this.el.querySelector('.wi-head');
      if (head) {
        head.setAttribute('aria-expanded', 'true');
        const chev = head.querySelector('.wi-chevron');
        if (chev) chev.textContent = '▾';
      }
    }

    closeCard() {
      this.activeSite = null;
      this.mode = null;
      if (this.card) {
        this.card.classList.remove('is-overview');
        this.card.classList.add('is-hidden');
      }
      if (this.pins) this.pins.forEach((p) => p.node.classList.remove('is-active'));
    }

    // 自动推进到框外事件：不开主图浮签，只展开小地图并让对应城市脉冲
    pulse(milestone) {
      if (!this.built || !milestone || !this.bounds) return;
      if (!isOffFrame(milestone.coord, this.bounds)) return;
      const g = this.groups.find((x) => x.site === milestone.site);
      if (!g) return;
      this.expand();
      // 按年整体替换脉冲点：同年多城同时亮，往年残留一律熄灭。
      // 连续播放时每年只 pulse 一次也可能被多次调用，toggle 保证同一组结果、不叠点。
      const year = milestone.year;
      this.pins.forEach((p) => {
        p.node.classList.toggle(
          'is-hit',
          p.g.events.some((e) => e.year === year)
        );
      });
      clearTimeout(this._pulseTimer);
      this._pulseTimer = setTimeout(() => {
        this.pins.forEach((p) => p.node.classList.remove('is-hit'));
      }, 2600);
      if (this.activeSite === g.site && this.card && !this.card.classList.contains('is-hidden')) {
        this.card.querySelectorAll('.wi-row').forEach((b) => {
          b.classList.toggle('is-hit', Number(b.dataset.year) === milestone.year);
        });
      }
    }

    // 年份变化：已发生的域外地点点亮，当年地点加脉冲；城卡与一览同步高亮当年事件行
    sync() {
      if (!this.built) return;
      const year = this.app.year;
      this.pins.forEach(({ g, node }) => {
        const hot = g.events.some((e) => e.year === year);
        node.classList.toggle('is-past', g.events.some((e) => e.year <= year));
        node.classList.toggle('is-current', hot);
        // 年份推进后不留上一年的脉冲点
        if (!hot) node.classList.remove('is-hit');
      });
      if (this.card && !this.card.classList.contains('is-hidden')) {
        this.card.querySelectorAll('.wi-row, .wi-ov-item').forEach((btn) => {
          const y = Number(btn.dataset.year);
          btn.classList.toggle('is-future', y > year);
          btn.classList.toggle('is-hit', y === year);
        });
      }
    }

    // 从主图浮签 / 侧栏条目反查域外城市
    reveal(milestone) {
      if (!this.built || !milestone || !this.bounds) return;
      if (!isOffFrame(milestone.coord, this.bounds)) return;
      const g = this.groups.find((x) => x.site === milestone.site);
      if (!g) return;
      this.expand();
      this.openCity(g.site, { keepScroll: true });
      const row = this.card.querySelector(`.wi-row[data-year="${milestone.year}"]`);
      if (!row) return;
      if (row.getAttribute('aria-expanded') !== 'true') row.click();
      row.classList.add('is-hit');
      const body = row.parentElement;
      if (body && row.offsetTop - body.scrollTop > body.clientHeight - 40) {
        body.scrollTop = row.offsetTop - 10;
      }
    }
  }

  const install = (Controller) => {
    HistoricalAtlasController = Controller;
    const proto = Controller.prototype;
    let instance = null;

    const ensure = (app) => {
      if (!instance) {
        try {
          instance = new WorldInset(app);
        } catch (err) {
          console.warn('[world-inset] init failed', err);
          return null;
        }
      }
      return instance;
    };

    const wrap = (name, after) => {
      const orig = proto[name];
      if (typeof orig !== 'function') return;
      proto[name] = function (...args) {
        const out = orig.apply(this, args);
        try {
          after.call(this, args, out);
        } catch (err) {
          console.warn('[world-inset]', name, err);
        }
        return out;
      };
    };

    wrap('jumpToYear', function () {
      const wi = ensure(this);
      if (wi) wi.sync();
    });

    wrap('applyLocale', function () {
      const wi = ensure(this);
      if (wi) wi._applyLabels();
    });

    // 框外事件不把主图镜头拽出取景框，只在小地图上点城
    const origEnsure = proto._ensureMilestoneInView;
    if (typeof origEnsure === 'function') {
      proto._ensureMilestoneInView = function (dynasty, m) {
        try {
          const wi = ensure(this);
          if (wi && wi.bounds && m && isOffFrame(m.coord, wi.bounds)) return false;
        } catch (err) {
          console.warn('[world-inset] ensure skipped', err);
        }
        return origEnsure.apply(this, arguments);
      };
    }

    // 侧栏条目点击会调 _frameMilestoneAnchors 把镜头移到事件处；框外事件一律不动镜头
    const origFrame = proto._frameMilestoneAnchors;
    if (typeof origFrame === 'function') {
      proto._frameMilestoneAnchors = function (dynasty, m, opts) {
        try {
          const wi = ensure(this);
          if (wi && wi.bounds && typeof this._getMilestoneAnchors === 'function') {
            const coords = (this._getMilestoneAnchors(dynasty, m) || [])
              .filter((a) => a && a.coord)
              .map((a) => a.coord);
            const leadOff = m && m.coord && isOffFrame(m.coord, wi.bounds);
            if (leadOff || (coords.length && coords.every((c) => isOffFrame(c, wi.bounds)))) {
              wi.reveal(m);
              return false;
            }
          }
        } catch (err) {
          console.warn('[world-inset] frame skipped', err);
        }
        return origFrame.apply(this, arguments);
      };
    }

    // 自动推进：当前事件在框外时不向主图框外锚点开浮签，只在小地图上脉冲对应城市
    const origSyncAuto = proto._syncAutoMilestoneBalloon;
    if (typeof origSyncAuto === 'function') {
      proto._syncAutoMilestoneBalloon = function (dynasty) {
        try {
          const wi = ensure(this);
          if (wi && wi.bounds && dynasty && !this.challenge && typeof this._activeMilestoneIndex === 'function') {
            const idx = this._activeMilestoneIndex(dynasty);
            const m = idx >= 0 ? (dynasty.milestones || [])[idx] : null;
            if (m && m.coord && isOffFrame(m.coord, wi.bounds)) {
              const list = dynasty.milestones || [];
              // 同年域外事件全部脉冲（pulse 按年整体替换，重复调用不会叠点）
              list.forEach((mm) => {
                if (mm && mm.year === this.year && mm.coord && isOffFrame(mm.coord, wi.bounds)) {
                  wi.pulse(mm);
                }
              });
              // 当年首条是域外事件时，主图浮签让给同年的国内事件；
              // 没有国内事件才收起浮签，避免主图上出现框外锚点
              const dismissed = this.dismissedCalloutIds;
              const domestic = list.find(
                (mm, i) =>
                  mm &&
                  mm.year === this.year &&
                  mm.coord &&
                  !isOffFrame(mm.coord, wi.bounds) &&
                  !(dismissed && dismissed.has(`${dynasty.key}:${i}`))
              );
              const am = this.activeMilestone;
              const visible =
                this.milestoneBalloon && !this.milestoneBalloon.classList.contains('is-hidden');
              if (domestic) {
                if (!(am && am.isAuto && am.milestone === domestic && visible)) {
                  this.openMilestoneBalloon(dynasty, domestic, { isAuto: true });
                } else {
                  this._positionMilestoneBalloon();
                }
              } else if (am && am.isAuto) {
                this.closeMilestoneBalloon();
              }
              return;
            }
            // 同年既有国内事件又有域外事件时，主图浮签留给国内事件，域外事件同步在小地图脉冲
            (dynasty.milestones || []).forEach((mm) => {
              if (mm && mm.year === this.year && mm.coord && isOffFrame(mm.coord, wi.bounds)) {
                wi.pulse(mm);
              }
            });
          }
        } catch (err) {
          console.warn('[world-inset] auto sync skipped', err);
        }
        return origSyncAuto.apply(this, arguments);
      };
    }

    // 主图浮签打开后（含侧栏条目、逐事件跳转），框外地点在小地图上亮出来
    const origOpen = proto.openMilestoneBalloon;
    if (typeof origOpen === 'function') {
      proto.openMilestoneBalloon = function () {
        const out = origOpen.apply(this, arguments);
        try {
          const wi = ensure(this);
          const m = arguments[1];
          if (wi && m && m.coord) wi.reveal(m);
        } catch (err) {
          console.warn('[world-inset] reveal failed', err);
        }
        return out;
      };
    }
  };

  if (window.HistoricalAtlasController) install(window.HistoricalAtlasController);
  else (window.__ATLAS_MIXINS = window.__ATLAS_MIXINS || []).push(install);
})();
