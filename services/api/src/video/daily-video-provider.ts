export type DailyJoinInfo = {
  roomUrl: string;
  token?: string;
};

export class DailyVideoProvider {
  async createJoinInfo(roomId: string): Promise<DailyJoinInfo> {
    return {
      roomUrl: `https://daily.example/${roomId}`
    };
  }
}
