import { GameState, Position, GunNames, Filter } from 'dmo-expositor/build/src/lib.js';
import { getAngularDist, getAngularEstSz, getDist, renderPNG } from './utils.js';
import { open } from 'node:fs/promises';
import { ChartConfiguration } from 'chart.js';
import path from 'node:path';

export type ShiftOpts = 'attacker' | 'target' | 'none';

export interface Options {
  tcn: number,
  acn: number,
  gun: GunNames,
  interval: number,
  dir: string,
  shift: ShiftOpts,
}

export interface DataItem {
  ts: number,
  tpos: Position,
  apos: Position,
  adist: number,
  tavel: number,
  aavel: number,
}

type UnpackFilter<T> = T extends Filter<(infer U)[]> ? U : never;
type FilterEv = UnpackFilter<ReturnType<typeof makeFilter>>;

export class AlgState {
  items = new Map<number, DataItem[]>;
  evs = new Map<number, FilterEv[]>;
  lasttpos?: Position;
  lastapos?: Position;
}

export async function angDistPlotter(gameState: GameState, options: Options) {
  const filter = makeFilter(gameState, options);
  const result = processData(filter, gameState, options);
  await plot(result, options);
}

export function makeFilter(gameState: GameState, {tcn, acn, gun, interval, shift}: Options) {
  return gameState.makeEventFilter(
    acn,
    (ev) => {
      if (ev.type === 'SHOT' && ev.gun === gun && acn !== tcn) {
        const {tts, ats} = calcShiftedTime(gameState, ev.timestamp, acn, tcn, shift);
        const apos = gameState.getPos(acn, ats);
        const tpos = gameState.getPos(tcn, tts);
        const isHit = gameState.reduceGameEvents(acn, ev.timestamp-50, ev.timestamp+50, false, (acc, ev) => {
          if (ev.type === 'HIT' && ev.tcn === tcn) {
            return true;
          }
          return acc;
        });
        if (apos && tpos) {
          const adist = getAngularDist(tpos.value, apos.value);
          const dist = getDist(tpos.value, apos.value);
          const { ax, ay } = getAngularEstSz(tpos.value, apos.value);
          if (Math.abs(adist) < 30) {
            return { tcn, acn, ...ev, isHit, adist, dist, ax, ay };
          }
        }
      }
      return;
    },
    () => ({ before: interval, after: 0, mergeOverlap: true }),
    'game'
  );
}

export function processData(filter: ReturnType<typeof makeFilter>, gameState: GameState, {acn, tcn, shift}: Options, step = 10) {
  return gameState.reduceFilteredTime(filter, new AlgState(), (state, ts, data) => {
    const {tts, ats} = calcShiftedTime(gameState, ts, acn, tcn, shift);
    const tpos = gameState.getPos(tcn, tts)?.value;
    const apos = gameState.getPos(acn, ats)?.value;
    const sts = data[0].timestamp;
    const acc = state.items;
    if (!acc.get(sts)) {
      acc.set(sts, []);
      state.evs.set(sts, data);
      state.lasttpos = undefined;
      state.lastapos = undefined;
    }
    if (tpos && apos) {
      const adist = getAngularDist(tpos, apos);
      const array = acc.get(sts)!;
      let tavel = 0;
      let aavel = 0;
      if (state.lasttpos && state.lastapos) {
        const deltaA = getAngularDist(tpos, state.lastapos) - adist;
        const deltaT = getAngularDist(state.lasttpos, apos) - adist;
        tavel = deltaT / step * 1000;
        aavel = deltaA / step * 1000;
      }
      array.push({ts: ts-sts, tpos, apos, adist, tavel, aavel});
    }
    state.lasttpos = tpos;
    state.lastapos = apos;
    return state;
  }, step);
}

export function calcShiftedTime(gameState: GameState, ts: number, acn: number, tcn: number, shift: ShiftOpts) {
  if (shift === 'target') {
    const ping = gameState.getPing(tcn, ts);
    if (ping) {
      const dts = ping.value.ping;
      const ats = ts-dts;
      return {tts: ts, ats};
    }
  } else if (shift === 'attacker') {
    const ping = gameState.getPing(acn, ts);
    if (ping) {
      const dts = ping.value.ping;
      const tts = ts-dts;
      return {tts, ats: ts};
    }
  }
  return {tts: ts, ats: ts};
}

async function plot(acc: AlgState, {acn, tcn, gun, dir}: Options) {
  if (!acc.items.size) {
    return;
  }
  for (const [sts, srs] of acc.items.entries()) {
    const data = srs.map(item => item.adist);
    const labels = srs.map(item => item.ts);
    const tavel = srs.map(item => item.tavel);
    const aavel = srs.map(item => item.aavel);
    const maxVel = aavel.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const evs = acc.evs.get(sts)!;
    const sevs = evs.map(ev => {
      return { ...ev, timestamp: ev.timestamp - sts };
    });
    const adist = sevs.map(ev => ({ x: ev.timestamp, y: ev.adist, isHit: ev.isHit }));
    const aszx = sevs.map(ev => ({ x: ev.timestamp, y: ev.ax }));
    const aszy = sevs.map(ev => ({ x: ev.timestamp, y: ev.ay }));
    const hits = adist.filter(ev => ev.isHit);
    const miss = adist.filter(ev => !ev.isHit);
    const config: ChartConfiguration = {
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          {
            label: `Angular distance`,
            data,
            borderColor: 'rgb(244, 162, 89)',
            backgroundColor: 'rgb(244, 162, 89)',
            cubicInterpolationMode: 'monotone',
            tension: 1,
            yAxisID: 'angle-y-axis'
          },
          {
            label: `Target contributed angular vel`,
            data: tavel,
            borderColor: 'rgb(188, 75, 81)',
            backgroundColor: 'rgb(188, 75, 81)',
            cubicInterpolationMode: 'monotone',
            tension: 1,
            yAxisID: 'avel-y-axis'
          },
          {
            label: `Attacker contributed angular vel`,
            data: aavel,
            borderColor: 'rgb(91, 142, 125)',
            backgroundColor: 'rgb(91, 142, 125)',
            cubicInterpolationMode: 'monotone',
            tension: 1,
            yAxisID: 'avel-y-axis'
          },
          {
            label: `Hit`,
            data: hits,
            type: 'scatter',
            pointBackgroundColor: 'rgb(0, 250, 0)',
            pointRadius: 10,
            yAxisID: 'angle-y-axis'
          },
          {
            label: `Miss`,
            data: miss,
            type: 'scatter',
            pointBackgroundColor: 'rgb(250, 0, 0)',
            pointRadius: 10,
            yAxisID: 'angle-y-axis'
          },
          {
            label: `Target angular sz X`,
            data: aszx,
            type: 'line',
            backgroundColor: 'rgb(50, 150, 255)',
            pointRadius: 5,
            yAxisID: 'angle-y-axis'
          },
          {
            label: `Target angular sz Y`,
            data: aszy,
            type: 'line',
            backgroundColor: 'rgb(150, 50, 255)',
            pointRadius: 5,
            yAxisID: 'angle-y-axis'
          },
        ]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            title: {
              text: 'ms',
              display: true,
            },
          },
          'angle-y-axis': {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              text: 'deg',
              display: true,
            },
            min: 0,
          },
          'avel-y-axis': {
            type: 'linear',
            display: true,
            position: 'right',
            suggestedMax: maxVel,
            suggestedMin: -maxVel,
            title: {
              text: 'deg/s',
              display: true,
            },
          },
        },
      }
    };
    const png = await renderPNG(config);
    const out = path.join(dir, `${gun}-acn_${acn}-tcn_${tcn}-ts_${sts}.png`);
    const fd = await open(out, 'w');
    try {
      await fd.write(png);
    } finally {
      await fd?.close();
    }
  }
}
