import { $enum } from 'ts-enum-util';

export enum StagingLevel {
  Test = 'test',
  Local = 'local',
  Alpha = 'alpha',
  Beta = 'beta',
  RC = 'rc',
  Release = 'release',
}

const stagingLevelEnum = $enum(StagingLevel);

interface StagingAttributes {
  [each: string]: StagingLevel[];
}

interface StagingOptions<T extends StagingAttributes> {
  value?: string;
  attributes?: T;
}

interface StagingStatus<T> {
  level: StagingLevel;
  flags: T;
}

const $stage = <T extends StagingAttributes>(
  options?: StagingOptions<T>,
  defaultLevel: StagingLevel = StagingLevel.Local,
): StagingStatus<{ [P in keyof T]: boolean }> => {
  type Flags = { [P in keyof T]: boolean };
  if (!options) {
    return { level: defaultLevel, flags: ({} as any) as Flags };
  }

  const level = stagingLevelEnum.asValueOrDefault(options.value, defaultLevel);
  const flags = options.attributes
    ? Object.entries(options.attributes).reduce(
        (map, [key, levels]) => ({ ...map, [key]: levels.includes(level) }),
        {},
      )
    : undefined;
  return {
    level,
    flags: flags as Flags,
  };
};

const defaultAttributes = {
  local: [StagingLevel.Test, StagingLevel.Local, StagingLevel.Alpha],
  real: [StagingLevel.Beta, StagingLevel.RC, StagingLevel.Release],
  dev: [
    StagingLevel.Test,
    StagingLevel.Local,
    StagingLevel.Alpha,
    StagingLevel.Beta,
  ],
};

export const currentStage = $stage({
  value: process.env.STAGE,
  attributes: {
    local: defaultAttributes.local,
    real: defaultAttributes.real,
    dev: defaultAttributes.dev,
  },
});
