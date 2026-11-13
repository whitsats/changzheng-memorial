'use strict';
// Regression coverage for quick search over the events this memorial site actually ships
// (the 1917–1949 dataset in js/map_data.js). The full-history suite lives in
// search.test.cjs and needs the upstream all-dynasty atlas, which this repository does
// not include, so CI runs only this file.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {buildIndex, loadSources, renderBundle} = require('./build.cjs');
const ROOT = path.resolve(__dirname, '../..');

const context = vm.createContext({window: {addEventListener() {}}, clearTimeout, URLSearchParams});
context.location = {search: '', origin: 'https://example.org', pathname: '/'};
context.window.location = context.location;
for (const name of ['china_geo_data.js', 'atlas_snapshots.js', 'map_data.js', 'lore_core.js', 'lore_detail.js',
  'i18n_dict.js', 'zh_hant.js', 'event_pinyin.js', 'app.js', 'atlas_trace.js', 'atlas_search.js', 'atlas_api.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', name), 'utf8'), context, {filename: name});
}

const w = context.window;

function controller() {
  const ctrl = Object.assign(Object.create(w.HistoricalAtlasController.prototype), {
    dynasties: w.DYNASTY_DATA, provinces: w.PROVINCE_OUTLINES, corridors: w.CORRIDOR_DATA,
    snapshots: w.ATLAS_SNAPSHOTS, enLocale: w.EN_LOCALE, locale: 'zh', year: 1935, dynastyIdx: 0,
    minYear: 1917, maxYear: 1949, _fullSnapshotsLoaded: true,
    camera: {x: 350, y: 215, w: 500, h: 420, zoom: 2},
    projector: new w.MercatorProjector(1000, 700, {west: 66, east: 142, south: 14, north: 55}),
  });
  ctrl._setEnglishLocale(w.EN_LOCALE);
  ctrl._initTimelineBands();
  ctrl._ensureSearchIndex();
  return ctrl;
}

const milestones = () => Object.values(w.DYNASTY_DATA).flatMap(d => d.milestones || []);
const eventHit = (ctrl, query, year, title) => ctrl._queryQuickSearch(query).find(hit =>
  hit.kind === 'event' && hit.rawYear === year && hit.titleZh.includes(title));

test('the checked-in index is reproducible and covers every shipped event and landmark', () => {
  const {dynasties, landmarks} = loadSources();
  const index = buildIndex(dynasties, landmarks);
  assert.equal(fs.readFileSync(path.join(ROOT, 'js/event_pinyin.js'), 'utf8'), renderBundle(index));
  for (const dynasty of dynasties) {
    assert.equal(index.milestones[dynasty.key].length, (dynasty.milestones || []).length);
  }
  assert.equal(index.landmarks.length, landmarks.length);
  const rows = [...Object.values(index.milestones).flat(), ...index.landmarks];
  assert(rows.length >= 172, 'expected the shipped milestones plus landmark rows, got ' + rows.length);
  for (const keys of rows) {
    assert(keys.length, 'event has no title/location keys');
    assert(keys.every(key => /^[a-z]+$/.test(key)), 'unconverted text in ' + keys);
  }
});

test('shipped milestones are all reachable by their own pinyin title', () => {
  const ctrl = controller();
  const rows = milestones();
  assert.equal(rows.length, 172, 'shipped milestone count changed; update the dataset expectations');
  for (const event of rows) {
    const year = Number(event.year);
    assert(Number.isFinite(year), event.headline);
    // A query made of every syllable of the headline must return that event of that year.
    const key = buildIndex([{key: 'probe', milestones: [event]}], [{zh: event.headline}]).landmarks[0][0];
    const hits = ctrl._queryQuickSearch(key);
    assert(hits.some(hit => hit.kind === 'event' && hit.rawYear === year && hit.titleZh === event.headline),
      `${key} -> ${event.headline}`);
  }
});

for (const [query, year, title] of [
  ['zhongguogongchandangdiyiciquanguodaibiaodahui', 1921, '中国共产党第一次全国代表大会'],
  ['zunyihuiyi', 1935, '遵义会议'],
  ['siduchishui', 1935, '四渡赤水'],
  ['feiduoludingqiao', 1935, '飞夺泸定桥'],
  ['xianshibian', 1936, '西安事变'],
  ['pingxingguandajie', 1937, '平型关大捷'],
  ['baituandazhan', 1940, '百团大战'],
  ['wannanshibian', 1941, '皖南事变'],
  ['yananzhengfeng', 1941, '延安整风开始'],
  ['chongqingtanpan', 1945, '重庆谈判'],
  ['kaiguodadian', 1949, '开国大典'],
]) {
  test(`${title} is found by compact, spaced, upper-case and tone-marked pinyin`, () => {
    const ctrl = controller();
    const spaced = query.match(/[a-z]+/g).join(' ');
    const ctrlHit = eventHit(ctrl, query, year, title);
    assert(ctrlHit, query);
    for (const variant of [
      spaced,
      spaced.toUpperCase(),
      query.toUpperCase(),
    ]) {
      const hit = eventHit(ctrl, variant, year, title);
      assert(hit, variant);
      assert.deepEqual(hit.coord, ctrlHit.coord, variant);
    }
  });
}

test('tone-marked pinyin reaches the same events as toneless pinyin', () => {
  const ctrl = controller();
  for (const [query, year, title] of [
    ['zūn yì huì yì', 1935, '遵义会议'],
    ['fēi duó lú dìng qiáo', 1935, '飞夺泸定桥'],
    ['kāi guó dà diǎn', 1949, '开国大典'],
  ]) {
    assert(eventHit(ctrl, query, year, title), query);
  }
});

test('event sites are searchable by place pinyin', () => {
  const ctrl = controller();
  for (const [query, year, title] of [
    ['nanchang', 1927, '南昌起义'],
    ['zunyi', 1935, '遵义会议'],
    ['huining', 1936, '会宁会师'],
    ['yanan', 1937, '中共中央进驻延安'],
    ['xibaipo', 1949, '中共七届二中全会'],
    ['beijingtiananmen', 1949, '开国大典'],
  ]) {
    assert(eventHit(ctrl, query, year, title), query);
  }
});

test('pinyin results keep the map action: coordinate, event context and year', () => {
  const ctrl = controller();
  const hits = ctrl._queryQuickSearch('zunyihuiyi');
  assert.equal(hits.length, 1);
  const [hit] = hits;
  assert.equal(hit.kind, 'event');
  assert.deepEqual([...hit.coord], [106.93, 27.73]);
  assert(hit.milestone, 'result retains its event context for the balloon');
  assert.equal(hit.year, 1935);
});

test('selecting a pinyin result jumps to its year, opens the event and pans to it', () => {
  const ctrl = controller();
  const calls = [];
  ctrl.stopAutoplay = ctrl.clearCustomRoute = ctrl._clearQuickSearchInput = () => {};
  ctrl.jumpToYear = year => calls.push(['year', year]);
  ctrl.openMilestoneBalloon = (_dynasty, event) => calls.push(['card', event.headline]);
  ctrl._panToward = (lon, lat) => calls.push(['pan', lon, lat]);
  const hit = eventHit(ctrl, 'kaiguodadian', 1949, '开国大典');
  assert(hit);
  assert.equal(hit.rawYear, 1949);
  ctrl._selectSearchResult(hit);
  // The jump target is the dynasty-clamped display year, which is what the balloon needs.
  assert.deepEqual(calls, [['year', hit.year], ['card', hit.titleZh], ['pan', 116.397, 39.909]]);
});

test('Chinese titles still outrank their pinyin keys', () => {
  const ctrl = controller();
  const chinese = ctrl._queryQuickSearch('遵义会议');
  const pinyin = ctrl._queryQuickSearch('zunyihuiyi');
  assert.equal(chinese[0].titleZh, '遵义会议（1月）');
  assert.equal(pinyin[0].titleZh, '遵义会议（1月）');
  assert(chinese[0].score > pinyin[0].score, 'exact Chinese match must score above the pinyin alias');
});

test('short or empty ASCII queries do not pick up pinyin-only event noise', () => {
  const ctrl = controller();
  for (const query of ['', 'zz', 'jgs', 'qwx', 'not-a-real-event']) {
    assert.equal(ctrl._queryQuickSearch(query).filter(hit => hit.kind === 'event').length, 0, query);
  }
});
