import { execFile } from 'child_process';
import { getLogger } from '../utils';

const logger = getLogger('[DiskUsage]');

export interface Usage {
  total: number;
  used: number;
  available: number;
}

export const logDirectoryStatus = async (directory: string = '/tmp') => {
  try {
    const result = await diskusage(directory);
    logger.info(JSON.stringify(result));
  } catch (e) {
    logger.warn(`Cannot get disk space: ${e}`);
  }
};

export async function diskusage(path: string): Promise<Usage> {
  return new Promise<Usage>((resolve, reject) => {
    execFile('df', ['-P', '-k', path], function(err, stdout) {
      if (err) {
        return reject(err);
      }

      try {
        const result = parse(stdout);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function parse(dusage: string) {
  const lines = dusage.split('\n');
  if (!lines[1]) {
    throw new Error('Unexpected df output: [' + dusage + ']');
  }
  const matches = lines[1].match(/^.+\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+.+$/);
  if (!matches || matches.length !== 4) {
    throw new Error('Unexpected df output: [' + dusage + ']');
  }
  const total = matches[1];
  const used = matches[2];
  const available = matches[3];

  return {
    total: parseInt(total) * 1024,
    used: parseInt(used) * 1024,
    available: parseInt(available) * 1024,
  };
}
