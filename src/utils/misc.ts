export const stringifyError = (
  err: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number,
) => {
  const plainObject = {} as any;
  Object.getOwnPropertyNames(err).forEach(key => {
    plainObject[key] = err[key];
  });
  return JSON.stringify(plainObject, replacer, space);
};
