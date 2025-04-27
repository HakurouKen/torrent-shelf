import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import fetch from 'node-fetch';
import mv from 'mv';
import parseTorrent from 'parse-torrent';
import { load } from 'cheerio';
import filenamify from 'filenamify';
import minimist from 'minimist';
import pico from 'picocolors';

async function findTorrents(root) {
  const files = await fs.readdir(root);
  const torrents = files.filter(file => path.extname(file) === '.torrent');

  return torrents;
}

const move = promisify(mv);

const transformers = [
  {
    match: /^\[acgrip\]/,
    category: '[Public][acg.rip]',
    transform: async (name, readTorrent) => {
      const match = name.match(/^\[acgrip\]\s+(\d+?)\./);
      const id = match?.[1];
      if (!id) {
        return null;
      }
      const response = await fetch(`https://acg.rip/t/${id}`);
      if (!response.ok) {
        if (response.status === 500 || response.status === 404) {
          // use local torrent data instead
          const torrent = await readTorrent();
          return `[acgrip][${id}]${torrent.name}.torrent`;
        }
        throw new Error(`Response ${id} rejected with code:${response.status}`);
      }
      const $ = load(await response.text());
      const title = $('.post-show-content .panel-heading').text().trim();
      if (!title) {
        throw new Error(`Invalid Content`);
      }
      const filename = filenamify(title, { replacement: '-' });
      return `[acgrip][${id}]${filename}.torrent`;
    }
  },
  {
    match: /^\[acgrip\]/,
    category: '[Public][acg.rip][fallback]',
    transform: async (name, readTorrent) => {
      const match = name.match(/^\[acgrip\]\s+(\d+?)\./);
      const id = match?.[1];
      if (!id) {
        return null;
      }
      const torrent = await readTorrent();
      return `[acgrip][${id}]${torrent.name}.torrent`;
    }
  },
  {
    match: /^[a-z0-9]{40}\.torrent$/,
    category: '[Public][dongmanhuayuan.myheartsite.com]',
    transform: async (_, readTorrent) => {
      const torrent = await readTorrent();
      return `[dmhy]${torrent.name}.torrent`;
    }
  },
  {
    match: '[PTT]',
    category: '[Private][www.pttime.org]'
  },
  {
    match: '[HDArea]',
    category: '[Private][www.hdarea.co]'
  },
  {
    match: '[WinterSakura]',
    category: '[Private][wintersakura.net]'
  },
  {
    match: '[OldToons]',
    category: '[Private][oldtoons.world]'
  },
  {
    match: '[HDVIDEO]',
    category: '[Private][hdvideo.one]'
  },
  {
    match: '[HDtime]',
    category: '[Private][hdtime.org]'
  },
  {
    match: '[HAIDAN.VIDEO]',
    category: '[Private][haidan.video]'
  },
  {
    match: '[CarPT]',
    category: '[Private][carpt.net]'
  }
];

function isFileMatch(filename, matcher) {
  if (typeof matcher === 'string') {
    return filename.startsWith(matcher);
  } else if (Array.isArray(matcher)) {
    return matcher.includes(filename);
  } else if (typeof matcher === 'function') {
    return matcher(filename);
  } else if (typeof matcher?.test === 'function') {
    // regexp-like
    return matcher.test(filename);
  }
  throw new Error(`Invalid matcher`);
}

async function run(
  root = path.join(os.homedir(), 'Downloads'),
  dest = path.join(os.homedir(), 'torrents'),
  options = {}
) {
  const { unknownCategory = '[Public][unknown]' } = options;
  const torrents = await findTorrents(root);
  for (const torrent of torrents) {
    let matched = false;
    for (const transformer of transformers) {
      if (!isFileMatch(torrent, transformer.match)) {
        continue;
      }
      matched = true;
      const category = transformer.category || unknownCategory;

      const transform =
        typeof transformer.transform === 'function'
          ? transformer.transform
          : () => torrent;

      let filename;
      try {
        filename = await transform(torrent, () =>
          fs.readFile(path.join(root, torrent)).then(parseTorrent)
        );
        if (!filename) {
          continue;
        }
      } catch (e) {
        console.error(e);
        continue;
      }

      await move(
        path.join(root, torrent),
        path.resolve(dest, category, filename),
        { mkdirp: true }
      );

      console.log(
        `${pico.green(torrent)} => ${pico.green(path.join(category, filename))}`
      );

      break;
    }

    if (!matched) {
      console.log(pico.bold('ignore:'), torrent);
    }
  }
}

const argv = minimist(process.argv.slice(2));
run(argv._[0], argv.d || argv.dest, { unknownCategory: argv.unknown });
