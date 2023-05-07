import { getLogger } from '../utils';
import { DataSource, EntitySchema, MixedList } from 'typeorm';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

export enum DBMS {
  MYSQL = 'mysql',
  POSTGRES = 'postgres',
  MARIADB = 'mariadb',
  MSSQL = 'mssql',
  ORACLE = 'oracle',
  SQLITE = 'sqlite',
}

export interface DBConnectionConfig {
  type: DBMS;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  entities: MixedList<Function | string | EntitySchema>;
}

class DBConnectionProxy {
  private dataSource: DataSource;
  constructor(config: DBConnectionConfig) {
    this.dataSource = new DataSource(config);
  }

  get data() {
    return this.dataSource.manager;
  }
}

class DB {
  private dbs: Map<string, DBConnectionProxy>;

  constructor(configs: DBConnectionConfig[]) {
    this.dbs = new Map();
    logger.debug(`DB configs: ${JSON.stringify(configs)}`);
    for (const config of configs) {
      this.dbs.set(config.type, new DBConnectionProxy(config));
    }
  }

  public get = (type: DBMS) => {
    const db = this.dbs.get(type);
    if (!db) {
      throw new Error(`No connection for ${type}`);
    }
    return db;
  };

  public clear = async () => {
    logger.debug('Clearing DB connections');
    for (const db of this.dbs.values()) {
      await db.data.release();
    }
  };
}

export interface DBPluginAux extends HandlerAuxBase {
  db: DB;
}

export class DBPlugin extends HandlerPluginBase<DBPluginAux> {
  private db: DB;
  constructor(configs: DBConnectionConfig[]) {
    super();
    this.db = new DB(configs);
  }

  public create = async () => {
    return { db: this.db };
  };

  public destroy = async () => {
    await this.db.clear();
  };
}

const build = (configs: DBConnectionConfig[]) => new DBPlugin(configs);
export default build;
