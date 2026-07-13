import { env } from '../env';

export type DailyRoomInfo = {
  name: string;
  roomUrl: string;
};

export type DailyJoinInfo = DailyRoomInfo & {
  token: string;
};

export class DailyVideoProvider {
  async createRoom(roomId: string, maxParticipants: number): Promise<DailyRoomInfo> {
    if (!env.dailyApiKey) {
      throw new Error('DAILY_API_KEY is required');
    }

    const name = this.createDailyRoomName(roomId);
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name,
        privacy: 'private',
        properties: {
          max_participants: maxParticipants,
          enable_prejoin_ui: false,
          enable_chat: false,
          enable_people_ui: false,
          start_video_off: false,
          start_audio_off: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Daily room creation failed: ${response.status}`);
    }

    const dailyRoom = (await response.json()) as { name: string; url?: string };

    return {
      name: dailyRoom.name,
      roomUrl: dailyRoom.url ?? this.createRoomUrl(dailyRoom.name)
    };
  }

  async createJoinInfo(input: {
    dailyRoomName: string;
    roomUrl: string;
    userId: string;
    userName: string;
    isOwner: boolean;
    sessionMinutes: number;
  }): Promise<DailyJoinInfo> {
    if (!env.dailyApiKey) {
      throw new Error('DAILY_API_KEY is required');
    }

    const exp = Math.floor(Date.now() / 1000) + (input.sessionMinutes + 60) * 60;
    const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        properties: {
          room_name: input.dailyRoomName,
          exp,
          eject_at_token_exp: true,
          is_owner: input.isOwner,
          user_id: input.userId,
          user_name: input.userName,
          enable_screenshare: false,
          start_video_off: false,
          start_audio_off: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Daily token creation failed: ${response.status}`);
    }

    const token = (await response.json()) as { token: string };

    return {
      name: input.dailyRoomName,
      roomUrl: input.roomUrl,
      token: token.token
    };
  }

  private headers() {
    return {
      Authorization: `Bearer ${env.dailyApiKey}`,
      'Content-Type': 'application/json'
    };
  }

  private createDailyRoomName(roomId: string) {
    return `roomi-${roomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`;
  }

  private createRoomUrl(name: string) {
    if (!env.dailyDomain) {
      throw new Error('DAILY_DOMAIN is required');
    }

    const domain = env.dailyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${domain}/${name}`;
  }
}
