export type RoomiApi = {
  platform: NodeJS.Platform;
};

export const roomiApi: RoomiApi = {
  platform: process.platform
};
