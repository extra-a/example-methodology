import { GameState, Position, GunNames, Filter } from 'dmo-expositor/build/src/lib.js';
import { getAngularDist, getDist, lookAngDiff, renderPNG } from './utils.js';
import { open } from 'node:fs/promises';
import { ChartConfiguration } from 'chart.js';
import path from 'node:path';

export interface Options {
  tcn: number,
  acn: number,
  gun: GunNames,
  interval: number,
  dir: string,
}

interface DataItem {
  ts: number,
  tpos: Position,
  apos: Position,
  adist: number,
  tavel: number,
  aavel: number,
  alvel: number,
}

type UnpackFilter<T> = T extends Filter<(infer U)[]> ? U : never;
type FilterEv = UnpackFilter<ReturnType<typeof makeFilter>>;

class AlgState {
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

function makeFilter(gameState: GameState, {tcn, acn, gun, interval}: Options) {
  return gameState.makeEventFilter(
    acn,
    (ev) => {
      if (ev.type === 'SHOT' && ev.gun === gun && acn !== tcn) {
        const apos = gameState.getPos(acn, ev.timestamp);
        const tpos = gameState.getPos(tcn, ev.timestamp);
        const isHit = gameState.reduceGameEvents(acn, ev.timestamp-50, ev.timestamp+50, false, (acc, ev) => {
          if (ev.type === 'HIT' && ev.tcn === tcn) {
            return true;
          }
          return acc;
        });
        if (apos && tpos) {
          const adist = getAngularDist(tpos.value, apos.value);
          const dist = getDist(tpos.value, apos.value);
          if (Math.abs(adist) < 30) {
            return { tcn, acn, ...ev, isHit, adist, dist };
          }
        }
      }
      return;
    },
    () => ({ before: interval, after: 0, mergeOverlap: true }),
    'game'
  );
}

function processData(filter: ReturnType<typeof makeFilter>, gameState: GameState, {acn, tcn}: Options) {
  return gameState.reduceFilteredTime(filter, new AlgState(), (state, ts, data) => {
    const tpos = gameState.getPos(tcn, ts)?.value;
    const apos = gameState.getPos(acn, ts)?.value;
    const sts = data[0].timestamp;
    const acc = state.items
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
      let alvel = 0;
      if (state.lasttpos && state.lastapos) {
        const deltaA = getAngularDist(tpos, state.lastapos) - adist;
        const deltaT = getAngularDist(state.lasttpos, apos) - adist;
        alvel = lookAngDiff(apos, state.lastapos) * 1000;
        tavel = deltaT * 1000;
        aavel = deltaA * 1000;
      }
      array.push({ts: ts-sts, tpos, apos, adist, tavel, aavel, alvel});
    }
    state.lasttpos = tpos;
    state.lastapos = apos;
    return state;
  })
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
    const evs = acc.evs.get(sts)!;
    const dist = evs.map(ev => ({ x: ev.timestamp - sts, y: ev.dist, isHit: ev.isHit }));
    const hits = dist.filter(ev => ev.isHit);
    const miss = dist.filter(ev => !ev.isHit);
    const config: ChartConfiguration = {
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          {
            label: `Angular distance`,
            data,
            borderColor: 'rgb(244, 162, 89)',
            spanGaps: false,
            yAxisID: 'angle-y-axis'
          },
          {
            label: `Target contributed angular vel`,
            data: tavel,
            borderColor: 'rgb(188, 75, 81)',
            spanGaps: false,
            yAxisID: 'avel-y-axis'
          },
          {
            label: `Attacker contributed angular vel`,
            data: aavel,
            borderColor: 'rgb(91, 142, 125)',
            spanGaps: false,
            yAxisID: 'avel-y-axis'
          },
          {
            label: `Hit`,
            data: hits,
            type: 'scatter',
            pointBackgroundColor: 'rgb(0, 200, 0)',
            pointRadius: 10,
            spanGaps: false,
            yAxisID: 'dist-y-axis'
          },
          {
            label: `Miss`,
            data: miss,
            type: 'scatter',
            pointBackgroundColor: 'rgb(200, 0, 0)',
            pointRadius: 10,
            spanGaps: false,
            yAxisID: 'dist-y-axis'
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
          },
          'avel-y-axis': {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              text: 'deg/s',
              display: true,
            },
          },
          'dist-y-axis': {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              text: 'units',
              display: true,
            },
            min: 0,
          }
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
