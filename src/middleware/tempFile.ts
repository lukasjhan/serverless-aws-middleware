import { existsSync, unlinkSync } from 'fs';
import { getLogger } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';
import { logDirectoryStatus } from '../status';

const logger = getLogger(__filename);

export interface TempFileManagerOptions {
  prefix?: string;
  location?: string;
}

class TempFileManager {
  private tempFiles: string[] = [];
  private config: TempFileManagerOptions;

  constructor(config?: TempFileManagerOptions) {
    this.config = config ?? {
      prefix: 'temp-',
      location: '/tmp',
    };
  }

  public generateTempFile(): string {
    const fileName = this.generateFileName();
    this.tempFiles.push(fileName);
    logger.debug(`Generate temp file ${fileName}`);
    return fileName;
  }

  private generateFileName(): string {
    const now = new Date();
    const timestamp = now.getTime();
    const randomNum = Math.floor(Math.random() * 10000);
    const fileName = `${this.config.location}/${this.config.prefix}${timestamp}-${randomNum}`;
    return fileName;
  }

  public clear(): void {
    for (const fileName of this.tempFiles) {
      if (existsSync(fileName)) {
        unlinkSync(fileName);
      }
    }
    logger.debug('Clearing temp files');
    this.tempFiles = [];
  }
}

export interface TempFilePluginAux extends HandlerAuxBase {
  tempFile: TempFileManager;
}

export class TempFilePlugin extends HandlerPluginBase<TempFilePluginAux> {
  private tempFile: TempFileManager;
  private config?: TempFileManagerOptions;

  constructor(config?: TempFileManagerOptions) {
    super();
    this.config = config;
    this.tempFile = new TempFileManager(config);
  }

  public create = async () => {
    logDirectoryStatus(this.config?.location);
    return {
      tempFile: this.tempFile,
    };
  };

  public end = () => {
    this.tempFile.clear();
  };
}

const build = (config?: TempFileManagerOptions) => new TempFilePlugin(config);
export default build;
