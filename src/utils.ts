import { ChartConfiguration } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

export async function renderPNG(configuration: ChartConfiguration, width = 4000) {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height: 2000, backgroundColour: 'white', chartCallback: (ChartJS) => {
    ChartJS.defaults.font.size = 30;
  } });
  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return buffer;
}
