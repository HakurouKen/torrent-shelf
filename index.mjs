import path from 'node:path';
import fs from 'node:fs/promises';
import fetch from 'node-fetch';
import parseTorrent from 'parse-torrent';
import { load } from 'cheerio';
import filenamify from 'filenamify';
import minimist from 'minimist';

async function findTorrents(root) {
  const files = await fs.readdir(root);
  const torrents = files.filter(file => path.extname(file) === '.torrent');

  return torrents;
}

const transformers = [
  {
    match: /^\[acgrip\]/,
    category: '[Public][acg.rip]',
    transform: async name => {
      const match = name.match(/^\[acgrip\]\s+(\d+?)\./);
      const id = match?.[1];
      if (!id) {
        return null;
      }
      const response = await fetch(`https://acg.rip/t/${id}`);
      if (!response.ok) {
        throw new Error(`Response rejected with code:${response.status}`);
      }
      const $ = load(await response.text());
      const title = $('.post-show-content .panel-heading').text().trim();
      if (!title) {
        return null;
      }
      const filename = filenamify(title, { replacement: '-' });
      return `[acgrip][${id}]${filename}.torrent`;
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

async function run(root, dest, options = {}) {
  if (!root) {
    throw new Error(`Param "root" is not defined`);
  }
  if (!dest) {
    throw new Error(`Param "dest" is not defined`);
  }
  const { unknownCategory = 'unknown' } = options;
  const torrents = await findTorrents(root);
  for (const torrent of torrents) {
    for (const transformer of transformers) {
      if (!isFileMatch(torrent, transform.match)) {
        continue;
      }

      const transform =
        typeof transformer.transform === 'function'
          ? transformer.transform
          : () => torrent;

      const filename = await transform(torrent, () =>
        fs.readFile(path.join(root, torrent)).then(parseTorrent)
      );

      await fs.rename(
        path.join(root, torrent),
        path.resolve(dest, transformer.category || unknownCategory, filename)
      );

      console.log(
        `move torrent "${torrent}" to "${path.join(
          transform.category || unknownCategory,
          filename
        )}"`
      );

      break;
    }
  }
}

const argv = minimist(process.argv.slice(2));
run(argv._[0], argv.d || argv.dest, { unknownCategory: argv.unknown });
