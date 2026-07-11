export type LumiApi = {
  platform: NodeJS.Platform;
};

export const lumiApi: LumiApi = {
  platform: process.platform
};
