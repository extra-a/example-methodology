import ndjson from 'ndjson';
import { pipeline } from 'node:stream/promises';
import parseArgs from 'minimist';
import fs from 'node:fs';
import path from 'node:path';
import { GameReader } from 'dmo-expositor/build/src/lib.js';
import { angDistPlotter, Options } from './lib.js';

async function main() {
  let cfg: Options = {
    acn: 0,
    tcn: 0,
    gun: 'RIFLE',
    before: 1000,
    after: 0,
    dir: process.cwd(),
    shift: 'attacker',
  };
  console.time('total');
  try {
    const argv = parseArgs(process.argv.slice(2));
    const filePath = argv._[0];
    if (argv.usage || !argv.acn || !argv.tcn) {
      showUsage();
    }
    cfg = {...cfg, ...argv};
    cfg.dir = path.normalize(cfg.dir);
    const isStdin = !filePath;
    const reader = new GameReader();
    await pipeline(
      isStdin ? process.stdin : fs.createReadStream(filePath),
      ndjson.parse(),
      reader.getStreamConsumer(),
    );
    const gameState = reader.getGameState();
    await angDistPlotter(gameState, cfg);
  } catch (e) {
    console.error(e);
    process.exit(-1);
  }
  console.timeEnd('total');
  process.exit(0);
}

main();

function showUsage() {
  const usage = `
Usage: npm start -- --acn=1 --tcn=2 input.json

Other options:
  --gun=<FIST | SG | CG | RL | RIFLE | GL | PISTOL> RIFLE    Attacker weapon
  --before=<number> 1000    Interval before the shot
  --after=<number> 0    Interval after the shot
  --dir=<path> .   Output directory
  --shift=<attacker | target | none> attacker   Ping shift
`;
  console.log(usage);
  process.exit(0);
}
