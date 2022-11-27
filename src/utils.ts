import { Position, Vec3 } from 'dmo-expositor/src/lib.js';
import { cross, dot, unaryMinus, add } from 'mathjs';
import { ChartConfiguration } from 'chart.js';
import { createCanvas } from 'canvas';
import pkg from 'chart.js';
const { Chart } = pkg;

export function getAngularDist(target: Position, origin: Position) {
  const viewRay = yawPitchTovec(origin.yaw, origin.pitch);
  const tpos = add(target.pos, [0, 0, 7.5]) as Vec3;
  const opos = add(origin.pos, [0, 0, 14]) as Vec3;
  const distBetween = add(tpos, unaryMinus(opos));
  const distViewRay = cross(viewRay, distBetween);
  const lenO = vecLength(distViewRay as Vec3);
  const lenH = vecLength(distBetween as Vec3);
  return Math.asin(lenO / lenH) * 180 / Math.PI;
}

export function getAngularEstSz(target: Position, origin: Position) {
  const dist = getDist(target, origin);
  const sz = (180 / Math.PI) / dist;
  const ax = sz * 8.2;
  const ay = sz * 15;
  return { ax, ay };
}

export function getDist(target: Position, origin: Position) {
  const tpos = add(target.pos, [0, 0, 7.5]) as Vec3;
  const opos = add(origin.pos, [0, 0, 14]) as Vec3;
  const distBetween = add(tpos, unaryMinus(opos));
  return vecLength(distBetween as Vec3);
}

export function lookAngDiff(pos: Position, prevpos: Position) {
  const viewRay = (yawPitchTovec(pos.yaw, pos.pitch));
  const prevViewRay = (yawPitchTovec(prevpos.yaw, prevpos.pitch));
  return Math.acos(Math.max(-1, Math.min(1, dot(prevViewRay, viewRay)))) * 180 / Math.PI;
}

export function yawPitchTovec(yaw: number, pitch: number) {
  const vec: Vec3 = [0, 0, 0];
  yaw *= Math.PI / 180;
  pitch *= Math.PI / 180;
  vec[0] = - Math.sin(yaw) * Math.cos(pitch);
  vec[1] = Math.cos(yaw) * Math.cos(pitch);
  vec[2] = Math.sin(pitch);
  return vec;
}

export function vecLength(vec: Vec3) {
  return Math.sqrt(vec[0]**2 + vec[1]**2 + vec[2]**2);
}

export function vecNorm(vec: Vec3) {
  const len = vecLength(vec);
  return vec.map(val => val/len) as Vec3;
}

const plugin = {
  id: 'customCanvasBackgroundColor',
  beforeDraw: (chart: any, _args: any, options: any) => {
    const {ctx} = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = options.color || '#99ffff';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};

Chart.defaults.font.size = 30;

export async function renderPNG(configuration: ChartConfiguration, width = 4000) {
  configuration = {...configuration};
  const canvas = createCanvas(width, 2000) as any;
  // Disable animation (otherwise charts will throw exceptions)
  configuration.options = {...(configuration.options ?? {})};
  configuration.options.responsive = false;
  configuration.options.animation = false;
  configuration.options.animation = false;
  configuration.plugins = configuration.plugins ? [plugin, ...configuration.plugins] : [plugin];
  configuration.options.plugins = {
    ...(configuration.options.plugins ?? {}),
    customCanvasBackgroundColor: {
      color: 'white',
    }
  } as any;
  canvas.style = {};
  const context = canvas.getContext('2d');
  const chart = new Chart(context, configuration);
  const buffer = await (chart.canvas as any).toBuffer()
  return buffer;
}
