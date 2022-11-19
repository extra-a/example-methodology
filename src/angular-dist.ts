import { GameState, Position, GunNames } from 'dmo-expositor/build/src/lib.js';
import { getAngularDist, lookAngDiff, renderPNG } from './utils.js';
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

class AlgState {
  items = new Map<number, DataItem[]>;
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
        if (apos && tpos) {
          const adist = getAngularDist(tpos.value, apos.value);
          if (Math.abs(adist) < 30) {
            return { tcn, acn, ...ev, adist };
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
  return gameState.reduceFilteredTime(filter, new AlgState(), (state, ts, [data]) => {
    const tpos = gameState.getPos(tcn, ts)?.value;
    const apos = gameState.getPos(acn, ts)?.value;
    const sts = data.timestamp;
    const acc = state.items
    if (!acc.get(sts)) {
      acc.set(sts, []);
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
    const alvel = srs.map(item => item.alvel);
    const config: ChartConfiguration = {
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          {
            label: `Angular distance`,
            data,
            borderColor: 'rgb(244, 226, 133)',
            spanGaps: false,
            yAxisID: 'left-y-axis'
          },
          {
            label: `Target contributed angular vel`,
            data: tavel,
            borderColor: 'rgb(188, 75, 81)',
            spanGaps: false,
            yAxisID: 'right-y-axis'
          },
          {
            label: `Attacker contributed angular vel`,
            data: aavel,
            borderColor: 'rgb(91, 142, 125)',
            spanGaps: false,
            yAxisID: 'right-y-axis'
          },
          {
            label: `Attacker aim angular vel`,
            data: alvel,
            borderColor: 'rgb(140, 179, 105)',
            spanGaps: false,
            yAxisID: 'right-y-axis'
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
          'left-y-axis': {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              text: 'deg',
              display: true,
            },
          },
          'right-y-axis': {
            type: 'linear',
            display: true,
            position: 'right',
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
